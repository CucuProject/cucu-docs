# Service Common Library

The `service-common` library provides shared utilities, guards, interceptors, and services used across all Cucu microservices.

## Location

```
_shared/service-common/src/
├── context/
│   ├── base-subgraph-context.ts
│   └── subgraph-context.interface.ts
├── guards/
│   ├── operation.guard.ts
│   └── rpc-internal.guard.ts
├── permissions/
│   ├── permissions-cache.service.ts
│   ├── scope.guard.ts
│   ├── scope-capable.decorator.ts
│   ├── viewable-fields.decorator.ts
│   ├── load-fields.interceptor.ts
│   ├── check-field-view.interceptor.ts
│   └── build-projection.util.ts
├── security/
│   └── verify-gateway-signature.ts
├── utils/
│   ├── redis-tls.options.ts
│   └── assert-object-id.ts
└── pipes/
    └── parse-mongo-id.pipe.ts
```

## Subgraph Context

### ISubgraphContext Interface

```typescript
interface ISubgraphContext {
  userGroups(): string[];
  isInternalCall(): boolean;
  hasUserContext(): boolean;
  currentUserId(): string | undefined;
  tenantSlug(): string | undefined;
  tenantId(): string | undefined;
}
```

### BaseSubgraphContext

```typescript
@Injectable({ scope: Scope.REQUEST })
export class BaseSubgraphContext implements ISubgraphContext {
  constructor(private readonly req: Request) {}

  userGroups(): string[] {
    // Return groups from JWT token
    return this.req.user?.groups ?? [];
  }

  isInternalCall(): boolean {
    // Check if called from gateway federation
    if (!this.verifyHeaders()) return false;
    return this.getHeaders()['x-internal-federation-call'] === '1';
  }

  hasUserContext(): boolean {
    // Check if user context was provided
    if (!this.verifyHeaders()) return false;
    return !!this.getHeaders()['x-user-groups'];
  }

  currentUserId(): string | undefined {
    // Return user ID from verified headers
    if (!this.verifyHeaders()) return undefined;
    return this.getHeaders()['x-user-id'];
  }

  tenantSlug(): string | undefined {
    // Extracts the tenant slug from the x-tenant-slug header (HTTP)
    // or from the _tenantSlug field in the RPC payload.
    if (!this.verifyHeaders()) return undefined;
    return this.getHeaders()['x-tenant-slug'] ?? this.getRpcPayload()?._tenantSlug;
  }

  tenantId(): string | undefined {
    // Extracts the tenant ID from the x-tenant-id header (HTTP)
    // or from the _tenantId field in the RPC payload.
    if (!this.verifyHeaders()) return undefined;
    return this.getHeaders()['x-tenant-id'] ?? this.getRpcPayload()?._tenantId;
  }

  private verifyHeaders(): boolean {
    return verifyGatewaySignature(this.getHeaders());
  }
}
```

#### Tenant Context Methods

| Method | Source (HTTP) | Source (RPC) | Description |
|--------|--------------|-------------|-------------|
| `tenantSlug()` | `x-tenant-slug` header | `_tenantSlug` payload field | Tenant URL-safe slug (e.g., `"acme-corp"`) |
| `tenantId()` | `x-tenant-id` header | `_tenantId` payload field | Tenant MongoDB ObjectId as string |

These methods return `undefined` when:
- The request lacks a valid gateway signature (not a forwarded request)
- The tenant headers/fields are not present (e.g., platform-level operations)

## Guards

### OperationGuard

Validates operation-level permissions:

```typescript
@Injectable({ scope: Scope.REQUEST })
export class OperationGuard implements CanActivate {
  constructor(
    private readonly permCache: PermissionsCacheService,
    private readonly sctx: ISubgraphContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Skip RPC calls (internal)
    if (context.getType() === 'rpc') return true;

    // 2. Skip internal federation without user
    if (this.sctx.isInternalCall() && !this.sctx.hasUserContext()) {
      return true;
    }

    // 3. Extract operation name
    const gqlCtx = GqlExecutionContext.create(context);
    const info = gqlCtx.getInfo();
    const opName = info.operation.selectionSet.selections[0]?.name?.value;

    // 4. Check permission
    const groups = this.sctx.userGroups();
    await this.permCache.ensureOpAllowed(opName, groups);

    return true;
  }
}
```

**Usage:**
```typescript
@Module({
  providers: [
    { provide: APP_GUARD, useClass: OperationGuard }
  ]
})
export class UsersModule {}
```

### ScopeGuard

Enforces scope restrictions (`self` vs `all`):

```typescript
@Injectable({ scope: Scope.REQUEST })
export class ScopeGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check @ScopeCapable decorator
    const idParamName = this.reflector.getAllAndOverride<string>(
      SCOPE_CAPABLE_KEY,
      [context.getHandler(), context.getClass()]
    );
    if (!idParamName) return true;

    // Get operation scope
    const opName = this.extractOperationName(context);
    const scope = this.permCache.getOperationScope(opName);

    if (!scope || scope === 'all') return true;

    // scope === 'self': compare IDs
    const args = GqlExecutionContext.create(context).getArgs();
    const targetId = this.extractNestedValue(args, idParamName);
    const currentUserId = this.sctx.currentUserId();

    if (targetId !== currentUserId) {
      throw new ForbiddenException(
        `Operation "${opName}" restricted to own resources`
      );
    }

    return true;
  }
}
```

### RpcInternalGuard

Protects sensitive RPC endpoints:

```typescript
@Injectable()
export class RpcInternalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'rpc') {
      throw new ForbiddenException('RPC only');
    }

    const secret = this.configService.get('INTERNAL_HEADER_SECRET');
    if (!secret) {
      throw new ForbiddenException('Secret not configured');
    }

    const data = context.switchToRpc().getData();
    const internalSecret = data?._internalSecret;

    // Timing-safe comparison
    if (!this.timingSafeEqual(secret, internalSecret)) {
      throw new ForbiddenException('Invalid secret');
    }

    delete data._internalSecret;
    return true;
  }
}
```

**Usage:**
```typescript
@UseGuards(RpcInternalGuard)
@MessagePattern('CREATE_GROUP')
async createGroup(@Payload() dto: CreateGroupInput) {}
```

## Permission Caching

### PermissionsCacheService

```typescript
@Injectable({ scope: Scope.REQUEST })
export class PermissionsCacheService {
  // Process-wide cache (5 min TTL)
  private static MEMO = new Map<string, MemoVal>();
  private static TTL = 5 * 60 * 1000;

  // Request-scoped data
  private opSet = new Set<string>();
  private fldMap = new Map<string, Set<string>>();

  async ensureOpAllowed(op: string, groups: string[]): Promise<void> {
    await this.loadMissing({ ops: [op] }, groups);
    if (!this.opSet.has(op)) {
      throw new ForbiddenException(`Operation "${op}" not allowed`);
    }
  }

  async ensureEntityLoaded(entity: string, groups: string[]): Promise<void> {
    await this.loadMissing({ ents: [entity] }, groups);
  }

  getViewableFieldsForEntity(entity: string): Set<string> {
    return this.fldMap.get(entity) ?? new Set();
  }

  getFieldsByScope(entity: string): { allFields: Set<string>; selfFields: Set<string> } {
    // Split fields by their scope
  }

  getOperationScope(opName: string): string | null {
    return this.opScopeMap.get(opName) ?? null;
  }

  static invalidateGroups(groupIds: string[]): void {
    // Remove cache entries containing these groups
  }

  static invalidateAll(): void {
    this.MEMO.clear();
  }
}
```

## Decorators

### @ScopeCapable

Marks a resolver as scope-aware:

```typescript
// Simple parameter
@ScopeCapable('userId')
@Query(() => User)
async findOneUser(@Args('userId') userId: string) {}

// Nested parameter
@ScopeCapable('updateUserInput._id')
@Mutation(() => User)
async updateUser(@Args('updateUserInput') input: UpdateUserInput) {}
```

### @ViewableFields

Injects viewable field set:

```typescript
@Query(() => User)
async findOneUser(
  @ViewableFields('User') viewable: Set<string>
): Promise<User> {
  return this.service.findById(id, viewable);
}
```

### @CheckFieldView

Checks field visibility on ResolveField:

```typescript
@CheckFieldView('User', 'subordinates')
@ResolveField(() => [User])
async subordinates(@Parent() user: User): Promise<User[]> {}
```

## Interceptors

### createViewFieldsInterceptor

Factory for loading field permissions:

```typescript
export function createViewFieldsInterceptor(entities: string[]) {
  @Injectable({ scope: Scope.REQUEST })
  class ViewFieldsInterceptor implements NestInterceptor {
    async intercept(context: ExecutionContext, next: CallHandler) {
      const req = this.getRequest(context);
      const groups = this.sctx.userGroups();

      req.__fieldSec = {};

      for (const entity of entities) {
        await this.permCache.ensureEntityLoaded(entity, groups);
        const viewable = this.permCache.getViewableFieldsForEntity(entity);

        req.__fieldSec[entity] = {
          set: viewable,
          proj: buildProjection(viewable),
        };
      }

      return next.handle();
    }
  }
  return ViewFieldsInterceptor;
}
```

**Usage:**
```typescript
@UseInterceptors(createViewFieldsInterceptor(['User']))
@Query(() => User)
async findOneUser() {}
```

## Security Utilities

### verifyGatewaySignature

```typescript
export function verifyGatewaySignature(headers: Record<string, any>): boolean {
  const signature = headers['x-gateway-signature'];
  const secret = process.env.INTERNAL_HEADER_SECRET;

  if (!secret) return false;

  const userGroups = headers['x-user-groups'] ?? '';
  const internalCall = headers['x-internal-federation-call'] ?? '';
  const userId = headers['x-user-id'] ?? '';

  const payload = `${userGroups}|${internalCall}|${userId}`;
  const expected = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return timingSafeEqual(
    Buffer.from(signature, 'utf8'),
    Buffer.from(expected, 'utf8')
  );
}
```

### buildRedisTlsOptions

```typescript
export function buildRedisTlsOptions(
  cfg: ConfigService,
  envPrefix: string
): RedisOptions {
  const host = cfg.get('REDIS_SERVICE_HOST', 'redis');
  const tlsPort = cfg.get<number>('REDIS_SERVICE_TLS_PORT', 6380);

  const certPath = cfg.get(`${envPrefix}_REDIS_TLS_CLIENT_CERT`);
  const keyPath = cfg.get(`${envPrefix}_REDIS_TLS_CLIENT_KEY`);
  const caPath = cfg.get('REDIS_TLS_CA_CERT');

  if (certPath && keyPath && caPath) {
    return {
      host,
      port: tlsPort,
      tls: {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
        ca: [fs.readFileSync(caPath)],
        rejectUnauthorized: true,
      },
    };
  }

  // Fallback to plain connection
  return { host, port: cfg.get('REDIS_SERVICE_PORT', 6379) };
}
```

## Pipes

### ParseMongoIdPipe

```typescript
@Injectable()
export class ParseMongoIdPipe implements PipeTransform {
  transform(value: string) {
    if (!mongoose.isValidObjectId(value)) {
      throw new BadRequestException(`Invalid ObjectId: ${value}`);
    }
    return value;
  }
}
```

**Usage:**
```typescript
@Query(() => User)
async findOneUser(
  @Args('userId', ParseMongoIdPipe) userId: string
): Promise<User> {}
```

## Utilities

### assertObjectId

```typescript
export function assertObjectId(value: any, name: string): void {
  if (!mongoose.isValidObjectId(value)) {
    throw new BadRequestException(`${name} is not a valid ObjectId`);
  }
}
```

### buildProjection

```typescript
export function buildProjection(viewable: Set<string>): Record<string, 1> {
  const proj: Record<string, 1> = {};
  const all = Array.from(viewable);

  for (const path of all) {
    // Skip parent if child exists
    const hasChildren = all.some(p => p.startsWith(path + '.'));
    if (hasChildren) continue;
    proj[path] = 1;
  }

  return proj;
}
```

## Module Setup

```typescript
// In each service's module
@Module({
  providers: [
    // Context provider
    UsersContext,
    { provide: 'SUBGRAPH_CONTEXT', useExisting: UsersContext },

    // Permission services
    PermissionsCacheService,

    // Global guards
    { provide: APP_GUARD, useClass: OperationGuard },
  ],
})
export class UsersModule {}
```

## Next Steps

- [Field-Level Grants](/shared/field-level-grants) - Field introspection
- [Permission System](/architecture/permissions) - How it all works together
