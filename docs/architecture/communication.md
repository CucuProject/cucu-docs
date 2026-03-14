# Service Communication

All inter-service communication in Cucu uses Redis with mTLS encryption. This document covers the RPC patterns, event system, and security mechanisms.

## Communication Patterns

### MessagePattern (Request-Response)

Used for synchronous operations where a response is expected:

```typescript
// Sender (e.g., Gateway or Users service)
const result = await lastValueFrom(
  this.authClient.send<CheckSessionResponse>('CHECK_SESSION', {
    sessionId: 'session-123'
  })
);

// Receiver (Auth controller)
@Controller()
export class AuthController {
  @MessagePattern('CHECK_SESSION')
  async checkSession(@Payload() data: { sessionId: string }) {
    return this.authService.checkSessionValidity(data.sessionId);
  }
}
```

### EventPattern (Fire-and-Forget)

Used for asynchronous notifications where no response is expected:

```typescript
// Sender (Users service)
this.authClient.emit('USER_DELETED', { userId: 'user-123' });

// Receiver (Auth controller)
@Controller()
export class AuthController {
  @EventPattern('USER_DELETED')
  async handleUserDeleted(@Payload() data: { userId: string }) {
    await this.authService.revokeAllSessionsOfUser(data.userId);
  }
}
```

## Redis Transport Configuration

### Module Registration

```typescript
// apps/users/src/users.module.ts
ClientsModule.registerAsync([
  {
    name: 'AUTH_SERVICE',
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: (cfg: ConfigService) => ({
      transport: Transport.REDIS,
      options: buildRedisTlsOptions(cfg, 'USERS'),
    }),
  },
  {
    name: 'GRANTS_SERVICE',
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: (cfg: ConfigService) => ({
      transport: Transport.REDIS,
      options: buildRedisTlsOptions(cfg, 'USERS'),
    }),
  },
])
```

### TLS Configuration

```typescript
// _shared/service-common/src/utils/redis-tls.options.ts
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

  // Fallback to plain connection (development only)
  return {
    host,
    port: cfg.get<number>('REDIS_SERVICE_PORT', 6379),
  };
}
```

## Event Flow Diagrams

### User Deletion Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                    Users Service                                  │
│  1. removeUser(userId) called                                    │
│  2. Set deletedAt timestamp, active=false                        │
│  3. Emit 'USER_DELETED' event                                    │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                    Redis Pub/Sub (USER_DELETED)
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
┌───────────────┐       ┌───────────────┐        ┌───────────────┐
│ Auth Service  │       │ MilestoneToUser│       │GroupAssignments│
│               │       │               │        │               │
│ Revoke all    │       │ Delete all    │        │ Delete all    │
│ sessions      │       │ assignments   │        │ assignments   │
└───────────────┘       └───────────────┘        └───────────────┘
```

### Permission Change Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                    Grants Service                                 │
│  1. updatePermission(...) or updateOperationPermission(...)      │
│  2. Emit 'PERMISSIONS_CHANGED' with affected groupIds            │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                    Redis Pub/Sub (PERMISSIONS_CHANGED)
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
┌───────────────┐       ┌───────────────┐        ┌───────────────┐
│ Users Service │       │ Projects Svc  │        │ Milestones Svc│
│               │       │               │        │               │
│ Invalidate    │       │ Invalidate    │        │ Invalidate    │
│ perm cache    │       │ perm cache    │        │ perm cache    │
│ for groups    │       │ for groups    │        │ for groups    │
└───────────────┘       └───────────────┘        └───────────────┘
```

## Complete RPC Pattern Catalog

### Auth Service Patterns

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `LOGIN` | Message | `{ email, password, ip, deviceName, browserName, deviceFingerprint }` | `{ accessToken, userId, sessionId, expiresIn }` |
| `CHECK_SESSION` | Message | `{ sessionId }` | `{ isValid, userId?, groupIds?, reason? }` |
| `REFRESH_SESSION` | Message | `{ refreshToken }` | `{ accessToken, userId, sessionId, expiresIn }` |
| `REVOKE_SESSION` | Message | `{ sessionId, requestUserId, force }` | `void` |
| `USER_DELETED` | Event | `{ userId }` | N/A |
| `REVOKE_ALL_SESSIONS` | Event | `{ userId }` | N/A |

### Users Service Patterns

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `USER_EXISTS` | Message | `userId: string` | `boolean` |
| `CREATE_USER` | Message | `CreateUserInput` | `User` |
| `FIND_USER_BY_EMAIL` | Message | `{ email, forAuth? }` | `{ _id, password?, groupIds }` or `null` |
| `FIND_USER_WITH_PASSWORD` | Message | `{ userId }` | `{ _id, password }` or `null` |
| `UPDATE_USER` | Message | `UpdateUserInput` | `User` |
| `UPDATE_USER_PASSWORD` | Message | `{ userId, newPassword }` | `void` |
| `FIND_GROUPIDS_BY_USERID` | Message | `{ userId }` | `{ groupIds: string[] }` |
| `GET_ORG_ENTITY_USAGE_COUNT` | Message | `{ field, id }` | `number` |
| `USER_GROUPS_CHANGED` | Event | `{ userId }` | N/A |
| `PERMISSIONS_CHANGED` | Event | `{ groupIds }` | N/A |

### Grants Service Patterns

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `GROUP_EXISTS` | Message | `groupId: string` | `boolean` |
| `FIND_GROUP_BY_NAME` | Message | `name: string` | `Group` or `null` |
| `CREATE_GROUP` | Message | `CreateGroupInput` | `Group` |
| `CREATE_PERMISSION` | Message | `CreatePermissionInput` | `Permission` |
| `UPSERT_PERMISSION` | Message | `CreatePermissionInput` | `Permission` |
| `CREATE_OPERATION_PERMISSION` | Message | `CreateOperationPermissionInput` | `OperationPermission` |
| `UPSERT_OPERATION_PERMISSION` | Message | `CreateOperationPermissionInput` | `OperationPermission` |
| `FIND_OP_PERMISSIONS_BY_GROUP` | Message | `{ groupId }` | `OperationPermission[]` |
| `FIND_PERMISSIONS_BY_GROUP` | Message | `{ groupId, entityName? }` | `Permission[]` |
| `FIND_BULK_PERMISSIONS_MULTI` | Message | `{ groupIds }` | `BulkPermissionsDTO` |
| `UPSERT_PAGE_PERMISSION` | Message | `CreatePagePermissionInput` | `PagePermission` |
| `FIND_PAGE_PERMISSIONS_BY_GROUP` | Message | `{ groupId }` | `PagePermission[]` |

### GroupAssignments Service Patterns

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `FIND_GROUP_ASSIGNMENTS_BY_USER_ID` | Message | `userId: string` | `GroupAssignment[]` |
| `FIND_GROUP_ASSIGNMENTS_BY_GROUP_ID` | Message | `groupId: string` | `GroupAssignment[]` |
| `USER_CREATED` | Event | `{ userId, groupIds? }` | N/A |
| `USER_UPDATED` | Event | `{ userId, groupIds? }` | N/A |
| `USER_DELETED` | Event | `{ userId }` | N/A |
| `GROUP_CREATED` | Event | `{ groupId, userIds? }` | N/A |
| `GROUP_UPDATED` | Event | `{ groupId, userIds? }` | N/A |
| `GROUP_DELETED` | Event | `{ groupId }` | N/A |

### MilestoneToUser Service Patterns

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `FIND_MILESTONE_TO_USER_BY_USER_ID` | Message | `userId: string` | `{ _id: string }[]` |
| `FIND_MILESTONE_TO_USER_BY_MILESTONE_ID` | Message | `milestoneId: string` | `{ _id: string }[]` |
| `USER_CREATED` | Event | `{ userId, milestoneIds? }` | N/A |
| `USER_UPDATED` | Event | `{ userId, milestoneIds? }` | N/A |
| `USER_DELETED` | Event | `{ userId }` | N/A |
| `MILESTONE_CREATED` | Event | `{ milestoneId, userIds? }` | N/A |
| `MILESTONE_DELETED` | Event | `{ milestoneId }` | N/A |

### Organization Service Patterns

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `FIND_SENIORITY_LEVELS_BY_IDS` | Message | `ids: string[]` | `SeniorityLevel[]` |
| `FIND_JOB_ROLES_BY_IDS` | Message | `ids: string[]` | `JobRole[]` |
| `FIND_COMPANIES_BY_IDS` | Message | `ids: string[]` | `Company[]` |

## Internal RPC Security

### RpcInternalGuard

Protects sensitive RPC mutation handlers from unauthorized Redis callers:

```typescript
// Protecting bootstrap operations
@UseGuards(RpcInternalGuard)
@MessagePattern('CREATE_GROUP')
async createGroup(@Payload() dto: CreateGroupInput) {
  return this.groupsService.create(dto);
}
```

The guard verifies an internal secret:

```typescript
// _shared/service-common/src/guards/rpc-internal.guard.ts
@Injectable()
export class RpcInternalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'rpc') {
      throw new ForbiddenException('This endpoint is RPC-only');
    }

    const secret = this.configService.get('INTERNAL_HEADER_SECRET');
    if (!secret) {
      throw new ForbiddenException('INTERNAL_HEADER_SECRET not configured');
    }

    const data = context.switchToRpc().getData();
    const internalSecret = data?._internalSecret;

    // Timing-safe comparison
    if (!internalSecret || !timingSafeEqual(secret, internalSecret)) {
      throw new ForbiddenException('Invalid internal secret');
    }

    // Strip secret from payload
    delete data._internalSecret;
    return true;
  }
}
```

### Calling Protected Endpoints

```typescript
// From bootstrap service
await lastValueFrom(
  this.grantsClient.send('CREATE_GROUP', {
    ...createGroupInput,
    _internalSecret: process.env.INTERNAL_HEADER_SECRET,
  })
);
```

## Error Handling

### RPC Timeouts

```typescript
// Default timeout: 30 seconds
const result = await lastValueFrom(
  this.client.send('PATTERN', payload).pipe(
    timeout(30000),
    catchError(err => {
      if (err instanceof TimeoutError) {
        throw new GatewayTimeoutException('Service unavailable');
      }
      throw err;
    })
  )
);
```

### Service Unavailability

```typescript
// Handle connection errors gracefully
try {
  const result = await lastValueFrom(
    this.client.send('PATTERN', payload)
  );
} catch (error) {
  if (error.message?.includes('ECONNREFUSED')) {
    throw new ServiceUnavailableException('Service offline');
  }
  throw error;
}
```

## Best Practices

### 1. Use lastValueFrom

Always use `lastValueFrom` from RxJS to convert Observable to Promise:

```typescript
import { lastValueFrom } from 'rxjs';

// GOOD
const result = await lastValueFrom(this.client.send('PATTERN', data));

// BAD (deprecated)
const result = await this.client.send('PATTERN', data).toPromise();
```

### 2. Define Clear Payload Types

```typescript
// Define interfaces for payloads
interface CheckSessionPayload {
  sessionId: string;
}

interface CheckSessionResponse {
  isValid: boolean;
  userId?: string;
  groupIds?: string[];
  reason?: string;
}

// Use generic typing
const result = await lastValueFrom(
  this.client.send<CheckSessionResponse, CheckSessionPayload>(
    'CHECK_SESSION',
    { sessionId }
  )
);
```

### 3. Handle Events Idempotently

Events may be delivered multiple times. Design handlers accordingly:

```typescript
@EventPattern('USER_DELETED')
async handleUserDeleted(@Payload() data: { userId: string }) {
  // Idempotent: deleteMany is safe to call multiple times
  await this.assignmentModel.deleteMany({ userId: data.userId });
}
```

### 4. Log RPC Calls

```typescript
@MessagePattern('CHECK_SESSION')
async checkSession(@Payload() data: { sessionId: string }) {
  this.logger.log(`CHECK_SESSION => sessionId=${data.sessionId}`);
  const result = await this.authService.checkSessionValidity(data.sessionId);
  this.logger.log(`CHECK_SESSION result => isValid=${result.isValid}`);
  return result;
}
```

## Next Steps

- [Authentication Flow](/architecture/auth-flow) - How login/session verification uses RPC
- [Permission System](/architecture/permissions) - Permission checking via RPC
- [RPC Patterns Reference](/reference/rpc-patterns) - Complete pattern catalog
