# Permission System

Cucu implements a **three-tier permission system** that controls access at operation, field, and scope levels.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PERMISSION LAYERS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Layer 1: OPERATION PERMISSIONS                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Can user execute this Query/Mutation?                                  │ │
│  │ Examples: createUser, findAllProjects, updateMilestone                │ │
│  │ Guard: OperationGuard                                                  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Layer 2: FIELD PERMISSIONS (with Scope)                                    │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Can user view/edit this specific field?                               │ │
│  │ Examples: User.authData.password, User.employmentData.RAL             │ │
│  │ Scopes: 'self' (own record only) or 'all' (any record)               │ │
│  │ Interceptor: createViewFieldsInterceptor                              │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Layer 3: PAGE PERMISSIONS                                                   │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Can user access this page in the frontend?                            │ │
│  │ Examples: /admin/users, /settings/permissions                         │ │
│  │ Usage: Frontend routing and UI rendering                              │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Permission Entities

### Group

A collection of permissions assigned to users:

```typescript
interface Group {
  _id: ID;
  name: string;           // e.g., "ADMIN", "MANAGER", "VIEWER"
  description?: string;
}
```

### OperationPermission

Controls ability to execute GraphQL operations:

```typescript
interface OperationPermission {
  _id: ID;
  groupId: ID;
  operationName: string;  // e.g., "createUser", "findAllUsers"
  canExecute: boolean;
  scope?: 'self' | 'all'; // Optional scope restriction
}
```

### Permission (Field-Level)

Controls visibility and editability of specific fields:

```typescript
interface Permission {
  _id: ID;
  groupId: ID;
  entityName: string;     // e.g., "User", "Project"
  fieldPath: string;      // e.g., "authData.email", "employmentData.RAL"
  canView: boolean;
  canEdit: boolean;
  scope?: 'self' | 'all'; // Optional: 'self' = own records only
}
```

### PagePermission

Controls frontend page access:

```typescript
interface PagePermission {
  _id: ID;
  groupId: ID;
  pageName: string;       // e.g., "/admin/users", "/settings"
  canAccess: boolean;
}
```

## Permission Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        GraphQL Request                                       │
│  query { findOneUser(userId: "123") { authData { name email } } }           │
└────────────────────────────────────────┬────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         1. OperationGuard                                    │
│  • Extract operation name: "findOneUser"                                    │
│  • Get user groups from headers: ["MANAGER", "USER"]                        │
│  • Check cache: Is findOneUser allowed for any of these groups?             │
│  • If NO: throw ForbiddenException("Operation not allowed")                 │
│  • If YES: continue                                                          │
└────────────────────────────────────────┬────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         2. ScopeGuard                                        │
│  • Check @ScopeCapable metadata: resolver marked with 'userId' param        │
│  • Get operation scope from cache: scope='self' for MANAGER group           │
│  • Extract targetId from args: "123"                                        │
│  • Get currentUserId from headers: "456"                                    │
│  • Compare: "123" !== "456"                                                  │
│  • If scope='self' and mismatch: throw ForbiddenException                   │
│  • If scope='all' or match: continue                                        │
└────────────────────────────────────────┬────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    3. ViewFieldsInterceptor                                  │
│  • Load viewable fields for User entity from cache                          │
│  • MANAGER group can view: [_id, authData.name, authData.email]             │
│  • Build MongoDB projection: { _id: 1, "authData.name": 1, ...}            │
│  • Store in request: req.__fieldSec['User']                                 │
└────────────────────────────────────────┬────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         4. Resolver Execution                                │
│  • Access @ViewableFields('User') → Set<string>                             │
│  • Query MongoDB with projection                                             │
│  • Sanitize response (remove unauthorized fields)                           │
└────────────────────────────────────────┬────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Response                                             │
│  { findOneUser: { authData: { name: "John", email: "john@..." } } }        │
│  (password field not included - not in viewable set)                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Permission Caching

Permissions are cached process-wide with 5-minute TTL:

```typescript
// _shared/service-common/src/permissions/permissions-cache.service.ts
@Injectable({ scope: Scope.REQUEST })
export class PermissionsCacheService {
  // Process-wide cache (shared across requests)
  private static MEMO = new Map<string, MemoVal>();
  private static TTL = 5 * 60 * 1000; // 5 minutes

  // Request-scoped data
  private opSet = new Set<string>();
  private fldMap = new Map<string, Set<string>>();
  private scopeMap = new Map<string, Map<string, string[]>>();
  private opScopeMap = new Map<string, string>();
}
```

### Cache Key

```
Key = Sorted comma-separated group IDs
Example: "group-admin,group-manager,group-user"
```

### Cache Structure

```typescript
type MemoVal = {
  ts: number;                         // Timestamp of cache population
  opSet: Set<string>;                 // Allowed operation names
  entMap: Map<string, Set<string>>;   // Entity → viewable field paths
  scopeMap: Map<string, Map<string, string[]>>; // Entity → field → scopes
  opScopeMap: Map<string, string>;    // Operation → scope ('self'|'all')
};
```

### Cache Invalidation

```typescript
// When permissions change, Grants service emits event
this.redisClient.emit('PERMISSIONS_CHANGED', { groupIds: ['group-123'] });

// All services receive and invalidate
@EventPattern('PERMISSIONS_CHANGED')
handlePermissionsChanged(@Payload() data: { groupIds: string[] }) {
  PermissionsCacheService.invalidateGroups(data.groupIds);
}
```

## OperationGuard Implementation

```typescript
// _shared/service-common/src/guards/operation.guard.ts
@Injectable({ scope: Scope.REQUEST })
export class OperationGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Skip RPC calls
    if (context.getType() === 'rpc') return true;

    // Skip internal federation calls without user context
    if (this.sctx.isInternalCall() && !this.sctx.hasUserContext()) {
      return true;
    }

    // Extract operation name
    const gqlCtx = GqlExecutionContext.create(context);
    const info = gqlCtx.getInfo();
    let opName = info.operation.selectionSet.selections?.[0]?.name?.value;

    // Strip Apollo suffixes (e.g., "findAllUsers__12345")
    opName = opName?.replace(/__\w+__\d+$/, '');

    // Check permission
    const groups = this.sctx.userGroups();
    await this.permCache.ensureOpAllowed(opName, groups);

    return true;
  }
}
```

## ScopeGuard Implementation

```typescript
// _shared/service-common/src/permissions/scope.guard.ts
@Injectable({ scope: Scope.REQUEST })
export class ScopeGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check @ScopeCapable decorator
    const idParamName = this.reflector.getAllAndOverride<string>(
      SCOPE_CAPABLE_KEY,
      [context.getHandler(), context.getClass()]
    );
    if (!idParamName) return true; // Not scope-aware

    // Skip internal calls
    if (this.sctx.isInternalCall() && !this.sctx.hasUserContext()) {
      return true;
    }

    // Get operation scope
    const opName = this.extractOperationName(context);
    const scope = this.permCache.getOperationScope(opName);
    if (!scope || scope === 'all') return true;

    // Scope is 'self' - compare IDs
    const args = GqlExecutionContext.create(context).getArgs();
    const targetId = this.extractTargetId(args, idParamName);
    const currentUserId = this.sctx.currentUserId();

    if (targetId !== currentUserId) {
      throw new ForbiddenException(
        `Operation "${opName}" restricted to own resources (scope=self)`
      );
    }

    return true;
  }

  private extractTargetId(args: any, paramName: string): string {
    // Support dot notation: "updateUserInput._id"
    const parts = paramName.split('.');
    let value = args;
    for (const part of parts) {
      value = value?.[part];
    }
    return value?.toString();
  }
}
```

## Field-Level Permission Decorator

```typescript
// Mark resolver as scope-aware
@ScopeCapable('userId')
@UseGuards(ScopeGuard)
@Query(() => User)
async findOneUser(
  @Args('userId') userId: string,
  @ViewableFields('User') viewable: Set<string>,
): Promise<User>

// Check field visibility on ResolveField
@CheckFieldView('User', 'subordinates')
@ResolveField(() => [User])
async subordinates(@Parent() user: User): Promise<User[]>
```

## ViewableFields Interceptor

```typescript
// _shared/service-common/src/permissions/load-fields.interceptor.ts
export function createViewFieldsInterceptor(entities: string[]) {
  @Injectable({ scope: Scope.REQUEST })
  class ViewFieldsInterceptor implements NestInterceptor {
    async intercept(context: ExecutionContext, next: CallHandler) {
      const req = this.getRequest(context);
      if (!req) return next.handle();

      const groups = this.sctx.userGroups();
      req.__fieldSec = req.__fieldSec || {};

      for (const entity of entities) {
        // Load viewable fields
        await this.permCache.ensureEntityLoaded(entity, groups);
        const viewable = this.permCache.getViewableFieldsForEntity(entity);

        if (!viewable.size) {
          throw new ForbiddenException(`No view permission on "${entity}"`);
        }

        // Split by scope
        const { allFields, selfFields } = this.permCache.getFieldsByScope(entity);

        req.__fieldSec[entity] = {
          set: viewable,
          proj: buildProjection(viewable),
          projOthers: buildProjection(allFields),
          selfFields,
        };
      }

      return next.handle();
    }
  }
  return ViewFieldsInterceptor;
}
```

## Usage in Resolvers

```typescript
@Resolver(() => User)
@UseGuards(OperationGuard)
export class UsersResolver {
  @Query(() => User, {
    name: 'findOneUser',
    description: 'serviceName=User'
  })
  @ScopeCapable('userId')
  @UseGuards(ScopeGuard)
  @UseInterceptors(createViewFieldsInterceptor(['User']))
  async findOneUser(
    @Args('userId', ParseMongoIdPipe) userId: string,
    @ViewableFields('User') viewable: Set<string>,
  ): Promise<User> {
    return this.usersService.findById(userId, viewable);
  }
}
```

## Service-Level Field Filtering

```typescript
// apps/users/src/users.service.ts
async findById(
  userId: string,
  viewable?: Set<string>
): Promise<User> {
  const projection = this.buildProjection(viewable);

  const user = await this.userModel
    .findOne({ _id: userId, deletedAt: null }, projection)
    .lean()
    .exec();

  return this.sanitize(user, viewable);
}

private buildProjection(viewable?: Set<string>) {
  if (!viewable?.size) return undefined;

  // Always include system fields
  const fields = new Set(viewable);
  ['_id', 'deletedAt', 'createdAt', 'updatedAt'].forEach(f => fields.add(f));

  return buildMongooseProjection(fields);
}

private sanitize(obj: any, viewable?: Set<string>): User {
  if (!viewable) return obj;

  // Remove fields not in viewable set
  // Convert empty objects/arrays to null for GraphQL
  // ... sanitization logic
}
```

## Scope-Aware Sanitization

```typescript
private sanitizeScoped(
  obj: any,
  allowed?: Set<string>,
  recordId?: string
): any {
  if (!allowed) return this.sanitize(obj, allowed);

  const currentUid = this.uctx?.currentUserId();

  // If internal call or own record: full sanitize
  if (!currentUid || recordId === currentUid) {
    return this.sanitize(obj, allowed);
  }

  // Other user's record: exclude self-only fields
  const { allFields } = this.permCache.getFieldsByScope('User');
  if (!allFields.size) return this.sanitize(obj, allowed);

  return this.sanitize(obj, allFields);
}
```

## GraphQL Examples

### Setting Up Permissions

```graphql
# Create a group
mutation {
  createGroup(input: {
    name: "VIEWER"
    description: "Read-only access to users"
  }) {
    _id
    name
  }
}

# Grant operation permission
mutation {
  createOperationPermission(input: {
    groupId: "group-viewer-id"
    operationName: "findAllUsers"
    canExecute: true
  }) {
    _id
    operationName
    canExecute
  }
}

# Grant field permission (view only, scope self)
mutation {
  createPermission(input: {
    groupId: "group-viewer-id"
    entityName: "User"
    fieldPath: "authData.email"
    canView: true
    canEdit: false
  }) {
    _id
    fieldPath
    canView
  }
}
```

### Introspection Queries

```graphql
# List all fields for an entity
query {
  listFieldsFromGateway(typeName: "User")
}
# Returns: ["_id", "authData.name", "authData.email", ...]

# List operations for a service
query {
  listMutationsFromGateway(serviceName: "User")
}
# Returns: ["createUser", "updateUser", "removeUser", ...]
```

## Best Practices

### 1. Group Design

- Create functional groups: `ADMIN`, `MANAGER`, `EMPLOYEE`, `VIEWER`
- Use groups for roles, not individuals
- A user can belong to multiple groups (permissions union)

### 2. Field Paths

- Use dot notation for nested fields: `authData.email`
- Always include parent if including children
- System fields (`_id`, `createdAt`, etc.) are always included

### 3. Scope Usage

- Use `scope: 'self'` for sensitive personal data
- Use `scope: 'all'` for administrative operations
- Default (no scope) means `all`

### 4. Cache Considerations

- TTL is 5 minutes - permission changes are not instant
- For immediate effect, call `invalidateGroups([groupId])`
- In production, consider event-driven invalidation

## Next Steps

- [Service Startup](/architecture/startup) - Service orchestration
- [Grants Service](/services/grants) - Permission management
- [Add New Permission Guide](/guides/add-new-permission) - Step-by-step guide
