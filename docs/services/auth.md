# Auth Service

The Auth service is the **authentication orchestrator** for the platform. It manages **server-side sessions**, **JWT token issuance**, **refresh token rotation**, and coordinates with Tenants and Grants services for identity resolution and permission loading. It stores sessions in a per-tenant MongoDB database and caches group IDs in Redis.

## Overview

| Property | Value |
|----------|-------|
| Port | 3001 |
| Database | `auth_{tenantSlug}` |
| Collection | `sessions` |
| Module | `AuthModule` |
| Context | `AuthContext` (request-scoped) |

### Domain Entities

| Entity | Description |
|--------|-------------|
| `Session` | Server-side session record with device info, tokens, and timestamps |

## Architecture

### Module Structure

```
AuthModule
├── TenantDatabaseModule.forService('auth')
├── ConfigModule (global)
├── TenantAwareClientsModule
│   ├── USERS_SERVICE
│   ├── GRANTS_SERVICE
│   └── TENANTS_SERVICE
├── MicroservicesOrchestratorModule
├── ThrottlerModule (5 req/15min per IP)
├── CacheModule (Redis-backed, DB=1, TTL=1h)
├── GraphQLModule (ApolloFederationDriver)
└── JwtModule (JWT_SECRET, JWT_EXPIRES_IN)

Controller: AuthController (RPC handlers)
Providers:
├── AuthContext (SUBGRAPH_CONTEXT)
├── AuthOrchestratorService    ← NEW: Consolidates auth flows
├── AuthService
├── AuthResolver
├── TokenService               ← Handles JWT signing/rotation
├── SessionService             ← Session CRUD operations
├── PasswordService            ← Password change flow
├── LocalSchemaFieldsService
├── PermissionsCacheService
├── AuthThrottlerGuard (APP_GUARD)
├── OperationGuard (APP_GUARD)
└── ViewFieldsInterceptor (APP_INTERCEPTOR for Session)
```

### Orchestrator Pattern

The Auth service acts as the **central orchestrator** for authentication flows. The Gateway delegates all auth logic to Auth via consolidated RPC patterns:

```
Gateway (thin proxy)           Auth Service (orchestrator)
    │                               │
    │  VERIFY_FROM_TOKEN           │
    │  ───────────────────────────►│
    │                               ├─► Validate JWT
    │                               ├─► CHECK_SESSION (internal)
    │                               ├─► GET_IDENTITY_MEMBERSHIPS → Tenants
    │                               └─► Return { user, tenants, permissions }
    │                               │
    │  GET_ME                      │
    │  ───────────────────────────►│
    │                               ├─► Validate session
    │                               ├─► Load user data
    │                               └─► Return { me, session }
    │                               │
    │  REFRESH_FROM_TOKEN          │
    │  ───────────────────────────►│
    │                               ├─► Validate refresh token
    │                               ├─► Rotate tokens
    │                               └─► Return { accessToken, refreshToken }
```

This pattern:
- Keeps Gateway as a **thin proxy** with no auth logic
- Centralizes all identity resolution in Auth service
- Reduces RPC round-trips (Auth calls Tenants/Grants internally)
- Simplifies Gateway code and testing

### Redis Cache

The Auth service uses a dedicated Redis database (DB=1) for caching group IDs:

```
Key: groups:{userId}
Value: string[] (JSON)
TTL: 3600 seconds (1 hour)
```

## GraphQL Schema

### Queries

| Query | Args | Return | Description |
|-------|------|--------|-------------|
| `findAllSessions` | — | `[Session]!` | Returns all sessions for the current authenticated user |
| `findSessionsByUserId` | `userId: ID!` | `[Session]!` | Returns active sessions for a specific user. Scope enforcement: `self` scope restricts to own sessions only |

### Mutations

| Mutation | Args | Return | Description |
|----------|------|--------|-------------|
| `logout` | `input: LogoutInput!` | `Boolean!` | Revoke a single session by sessionId |
| `revokeSession` | `input: RevokeSessionInput!` | `Boolean!` | Revoke a session. Scope: `self` requires own session |
| `revokeUserSessions` | `userId: ID` | `Boolean!` | Revoke all active sessions for a user (nullable userId defaults to self) |
| `changePassword` | `input: ChangePasswordInput!` | `Boolean!` | Change password, revoke all sessions, sync to platform DB |

### ResolveField

| Field | On | Returns | Description |
|-------|-----|---------|-------------|
| `user` | `Session` | `User` (federation stub) | Returns `{ __typename: 'User', _id: session.userId }` |

## RPC Patterns

### Orchestrator Patterns (Gateway → Auth)

These consolidated patterns are called by the Gateway's thin proxy endpoints:

| Pattern | Input | Output | Description |
|---------|-------|--------|-------------|
| `VERIFY_FROM_TOKEN` | `{refreshToken}` | `{valid, userId, groups, isPlatformAdmin, memberships}` | Validate refresh token + session, load identity memberships. Called by `/auth/verify` (Gateway decodes refresh token for tenantSlug, uses `TenantContextService.run()` for CLS context) |
| `GET_ME` | `{refreshToken}` | `{authenticated, user, permissions}` | Load current user profile, permissions. Called by `/auth/me` (same CLS pattern as verify) |
| `REFRESH_FROM_TOKEN` | `{refreshToken}` | `{accessToken, refreshToken, expiresIn}` | Rotate tokens, return new pair. Called by `/auth/refresh` (same CLS pattern) |
| `SWITCH_FROM_TOKEN` | `{refreshToken, targetTenantSlug}` | `{accessToken, refreshToken, userId, tenantSlug}` | Switch tenant context, re-issue tokens. Called by `/auth/switch` |

### Session Patterns (Internal)

| Pattern | Input | Output | Description |
|---------|-------|--------|-------------|
| `LOGIN` | `{email, password, ip, deviceName, browserName, deviceFingerprint}` | `{accessToken, refreshToken, userId, sessionId, expiresIn}` | **Deprecated** — legacy login via tenant DB |
| `CREATE_AUTHENTICATED_SESSION` | `{userId, email, tenantSlug?, tenantId?, ip, deviceName, browserName, deviceFingerprint}` | `{accessToken, refreshToken, userId, sessionId, expiresIn}` | Create/reuse session after platform DB verification |
| `CHECK_SESSION` | `{sessionId}` | `{isValid, userId?, groupIds?, reason?}` | Validate session (called on every request by `createJwtAuthMiddleware` in the Gateway) |
| `REFRESH_SESSION` | `{refreshToken}` | `{accessToken, refreshToken, userId, sessionId, expiresIn}` | Rotate tokens (internal, called by orchestrator) |
| `REVOKE_SESSION` | `{sessionId, requestUserId, force}` | void | Revoke single session |
| `SWITCH_SESSION_TENANT` | `{sessionId, userId, tenantSlug, tenantId, email}` | `{accessToken, refreshToken}` | Re-issue tokens for tenant switch (internal) |

### EventPattern (Fire-and-Forget)

| Pattern | Input | Action |
|---------|-------|--------|
| `USER_DELETED` | `{userId}` | Revoke all sessions + clear group cache |
| `REVOKE_ALL_SESSIONS` | `{userId}` | Revoke all sessions + clear group cache |

### Outbound RPC Calls

| Target | Pattern | Purpose |
|--------|---------|---------|
| **Tenants** | `CHECK_PLATFORM_ADMIN` | Check if user is platform admin (orchestrator) |
| **Tenants** | `GET_IDENTITY_MEMBERSHIPS` | Load user's tenant memberships (orchestrator) |
| **Tenants** | `SWITCH_TENANT` | Validate and execute tenant switch |
| **Tenants** | `UPDATE_IDENTITY_PASSWORD` | Change password — sync to platform DB |
| **Grants** | `GET_MY_PERMISSIONS` | Load permissions for current tenant context |
| Users | `FIND_GROUPIDS_BY_USERID` | Load group IDs for JWT claims (cache miss) |
| Users | `FIND_USER_BY_EMAIL` | Legacy login — find user with password |
| Users | `FIND_USER_WITH_PASSWORD` | Change password — get current hash |
| Users | `UPDATE_USER_PASSWORD` | Change password — update tenant DB |

## Session Schema

```typescript
Session {
  _id: ObjectId           // Pre-generated for JWT embedding
  userId: string          // @Field
  refreshToken: string    // NOT exposed via GraphQL
  deviceFingerprint: string // NOT exposed via GraphQL
  createdAt?: Date        // @Field(nullable)
  updatedAt?: Date        // @Field(nullable)
  revokedAt?: Date        // @Field(nullable) — set when revoked
  ip?: string             // @Field(nullable)
  deviceName?: string     // @Field(nullable) — e.g., "macOS 14.3"
  browserName?: string    // @Field(nullable) — e.g., "Chrome 134"
  expiresAt?: Date        // @Field(nullable) — refresh token expiry
  sessionStart: Date      // @Field — when session was first created
  lastActivity: Date      // @Field — updated on CHECK_SESSION
  tenantId?: string       // Defence-in-depth (not exposed)
}
```

### Indexes

| Fields | Type | Purpose |
|--------|------|---------|
| `{userId, ip, deviceFingerprint, revokedAt}` | Compound | Session reuse lookup |
| `{userId, revokedAt}` | Compound | Session listing + batch revocation |

## Business Logic

### Session Reuse

Sessions are identified by `(userId, ip, deviceFingerprint)`. If a valid session exists for this triple, it's reused instead of creating a new one. This prevents session explosion from page reloads.

### Token Pre-generation

The session `_id` is pre-generated as `new Types.ObjectId()` before the JWT is signed. This allows the `sessionId` to be embedded in the JWT **before** the session document is saved to MongoDB — ensuring atomicity.

### Group ID Caching

Group IDs are cached in Redis (DB=1, TTL=1h) to avoid RPC calls to Users on every request:

```
1. Check cache: groups:{userId}
2. Cache hit → return cached groupIds
3. Cache miss → RPC FIND_GROUPIDS_BY_USERID → cache result → return
```

Cache is invalidated when:
- User is deleted (`revokeAllSessionsOfUser` calls `cacheManager.del`)
- Password is changed (all sessions revoked + cache cleared)

### Password Complexity Validation

The `ChangePasswordInput` DTO enforces password complexity via `@IsStrongPassword()` from `@cucu/service-common/validators`:

```typescript
@InputType()
export class ChangePasswordInput {
  @IsNotEmpty()
  @IsString()
  currentPassword: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @IsStrongPassword()   // ← from @cucu/service-common
  newPassword: string;
}
```

**Complexity requirements** (enforced by `PASSWORD_COMPLEXITY_REGEX`):
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
- At least one special character (`!@#$%^&*()_+-=[]{}|;:,.<>?`)

::: info DEV_MODE bypass
When `DEV_MODE=true`, password complexity validation is skipped to simplify development workflows.
:::

### Password Change Flow

1. `FIND_USER_WITH_PASSWORD` RPC → get current hash + email
2. `bcrypt.compare(currentPassword, hash)` — verify current
3. `bcrypt.hash(newPassword)` → generate new hash
4. `UPDATE_USER_PASSWORD` → update tenant DB (backward compat)
5. `UPDATE_IDENTITY_PASSWORD` → update platform DB (source of truth)
6. Revoke all active sessions → force re-login

### RPC DTO Validation

All RPC handlers use formal DTOs with `class-validator` decorators, validated by the global `ValidationPipe` (configured in `createSubgraphMicroservice`):

| DTO | Pattern | Fields |
|-----|---------|--------|
| `CheckSessionRpcDto` | `CHECK_SESSION` | `sessionId` |
| `RevokeSessionRpcDto` | `REVOKE_SESSION` | `sessionId, requestUserId, force` |
| `LoginRpcDto` | `LOGIN` | `email, password, ip, deviceName, browserName, deviceFingerprint` |
| `CreateAuthenticatedSessionRpcDto` | `CREATE_AUTHENTICATED_SESSION` | `userId, email, tenantSlug?, tenantId?, ip, deviceName, browserName, deviceFingerprint` |
| `RefreshSessionRpcDto` | `REFRESH_SESSION` | `refreshToken` |
| `SwitchSessionTenantRpcDto` | `SWITCH_SESSION_TENANT` | `sessionId, userId, tenantSlug, tenantId, email` |
| `UserDeletedRpcDto` | `USER_DELETED` / `REVOKE_ALL_SESSIONS` | `userId` |
| `VerifyFromTokenRpcDto` | `VERIFY_FROM_TOKEN` / `GET_ME` | `refreshToken` |
| `RefreshFromTokenRpcDto` | `REFRESH_FROM_TOKEN` | `refreshToken, deviceFingerprint?, ip?` |
| `SwitchFromTokenRpcDto` | `SWITCH_FROM_TOKEN` | `refreshToken, targetTenantSlug` |

The `TenantClsInterceptor` strips `_tenantSlug` and `_internalSecret` from RPC payloads **before** `ValidationPipe` runs, so DTOs only declare business fields.

### Throttling

The `AuthThrottlerGuard` applies rate limiting specifically to the Auth service:
- **5 requests per 15 minutes** per IP (configurable via `AUTH_THROTTLE_TTL`, `AUTH_THROTTLE_LIMIT`)
- All RPC handlers are decorated with `@SkipThrottle()` — only GraphQL/HTTP is throttled

## Field-Level Permissions

The Auth service applies field filtering on the `Session` entity:

```typescript
@UseInterceptors(createViewFieldsInterceptor(['Session']))
@Query(() => [Session])
async findAllSessions(@ViewableFields('Session') viewable: Set<string>) {
  return this.authService.findAllSessions(viewable);
}
```

The service builds a Mongoose projection from viewable fields:

```typescript
private getViewableProjection(entity: string, viewable?: Set<string>): any {
  if (viewable && viewable.size > 0) return buildMongooseProjection(viewable);
  if (this.actx?.isInternalCall() && !this.actx?.hasUserContext()) return undefined;
  const set = this.permCache.getViewableFieldsForEntity(entity);
  if (!set.size) throw new ForbiddenException('No viewable fields');
  return buildMongooseProjection(set);
}
```
