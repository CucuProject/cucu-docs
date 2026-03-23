# Service Communication

All inter-service communication in Cucu uses **Redis with mTLS encryption** as the transport layer. There are two communication patterns: request-response (MessagePattern) and fire-and-forget events (EventPattern).

## Communication Patterns

### MessagePattern (Request-Response)

Used when the caller needs a response. The caller blocks until the response arrives or a timeout occurs.

```typescript
// Caller (e.g., Gateway)
const result = await lastValueFrom(
  this.authClient.send<CheckSessionResponse>('CHECK_SESSION', { sessionId })
);

// Handler (Auth service controller)
@MessagePattern('CHECK_SESSION')
async checkSession(@Payload() data: { sessionId: string }) {
  return this.authService.checkSessionValidity(data.sessionId);
}
```

### EventPattern (Fire-and-Forget)

Used for side-effect notifications where the caller doesn't need a response. Events may be received by multiple listeners.

```typescript
// Emitter (Users service)
this.authClient.emit('USER_DELETED', { userId });

// Listener (Auth service)
@EventPattern('USER_DELETED')
async handleUserDeleted(@Payload() data: { userId: string }) {
  await this.authService.revokeAllSessionsOfUser(data.userId);
}
```

## Redis Transport Configuration

### mTLS Setup

Every service connects to Redis with mutual TLS. Configuration is built via `buildRedisTlsOptions()`:

```typescript
function buildRedisTlsOptions(cfg: ConfigService, envPrefix: string): RedisOptions {
  const host = cfg.get('REDIS_SERVICE_HOST');
  const tlsPort = cfg.get<number>('REDIS_SERVICE_TLS_PORT', 6380);
  const certPath = cfg.get(`${envPrefix}_REDIS_TLS_CLIENT_CERT`);
  const keyPath = cfg.get(`${envPrefix}_REDIS_TLS_CLIENT_KEY`);
  const caPath = cfg.get('REDIS_TLS_CA_CERT');

  if (certPath && keyPath && caPath) {
    return {
      host, port: tlsPort,
      tls: {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
        ca: [fs.readFileSync(caPath)],
        rejectUnauthorized: true,
      },
    };
  }
  // Fallback to plain (development only)
  return { host, port: cfg.get<number>('REDIS_SERVICE_PORT', 6379) };
}
```

Each service has its own TLS client certificate, identified by the `envPrefix` (e.g., `AUTH_REDIS_TLS_CLIENT_CERT`, `USERS_REDIS_TLS_CLIENT_CERT`).

### Client Registration

Services register their Redis clients via `ClientsModule.registerAsync()`:

```typescript
const RedisClientsModule = ClientsModule.registerAsync([
  {
    name: 'AUTH_SERVICE',
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: (cfg: ConfigService) => ({
      transport: Transport.REDIS,
      options: buildRedisTlsOptions(cfg, 'USERS'),
    }),
  },
]);
```

With multi-tenancy, services use `TenantAwareClientsModule.registerAsync()` instead, which wraps each client with `TenantAwareClientProxy` to auto-inject `_tenantSlug`.

## Complete RPC Catalog

### Auth Service

**Orchestrator Patterns** (Gateway thin proxy → Auth):

| Pattern | Type | Input | Output | Purpose |
|---------|------|-------|--------|---------|
| `VERIFY_FROM_TOKEN` | Message | `{refreshToken}` | `{valid, userId, groups, isPlatformAdmin, memberships}` | Validate refresh token + session, load identity memberships |
| `GET_ME` | Message | `{refreshToken}` | `{authenticated, user, permissions}` | Load current user profile + permissions |
| `REFRESH_FROM_TOKEN` | Message | `{refreshToken}` | `{accessToken, refreshToken, expiresIn}` | Rotate tokens |
| `SWITCH_FROM_TOKEN` | Message | `{refreshToken, targetTenantSlug}` | `{accessToken, refreshToken, userId, tenantSlug}` | Switch tenant context |

**Session Patterns** (internal):

| Pattern | Type | Input | Output | Purpose |
|---------|------|-------|--------|---------|
| `LOGIN` | Message | `{email, password, ip, deviceName, browserName, deviceFingerprint}` | `{accessToken, refreshToken, userId, sessionId, expiresIn}` | Legacy login (deprecated) |
| `CREATE_AUTHENTICATED_SESSION` | Message | `{userId, email, tenantSlug?, tenantId?, ip, deviceName, browserName, deviceFingerprint}` | `{accessToken, refreshToken, userId, sessionId, expiresIn}` | Create session after platform DB verification |
| `CHECK_SESSION` | Message | `{sessionId}` | `{isValid, userId?, groupIds?, reason?}` | Validate session for every request |
| `REFRESH_SESSION` | Message | `{refreshToken}` | `{accessToken, refreshToken, userId, sessionId, expiresIn}` | Token rotation (internal) |
| `REVOKE_SESSION` | Message | `{sessionId, requestUserId, force}` | void | Revoke single session |
| `SWITCH_SESSION_TENANT` | Message | `{sessionId, userId, tenantSlug, tenantId, email}` | `{accessToken, refreshToken}` | Re-issue tokens for tenant switch |
| `USER_DELETED` | Event | `{userId}` | — | Revoke all sessions for deleted user |
| `REVOKE_ALL_SESSIONS` | Event | `{userId}` | — | Revoke all sessions for user |

### Users Service

| Pattern | Type | Input | Output | Purpose |
|---------|------|-------|--------|---------|
| `USER_EXISTS` | Message | `string \| {id}` | `boolean` | Check if user exists |
| `CREATE_USER` | Message | `CreateUserInput` | `User` | Create user (bootstrap) |
| `FIND_USER_BY_EMAIL` | Message | `{email, forAuth?}` | `{_id, password?, groupIds} \| null` | Find user by email |
| `FIND_USER_WITH_PASSWORD` | Message | `{userId}` | `{_id, password, email} \| null` | Get user with password hash (for changePassword) |
| `UPDATE_USER` | Message | `UpdateUserInput` | `User` | Update user |
| `UPDATE_USER_PASSWORD` | Message | `{userId, newPasswordHash}` | void | Update password hash |
| `FIND_GROUPIDS_BY_USERID` | Message | `{userId}` | `{groupIds: string[]}` | Get user's group IDs |
| `GET_ORG_ENTITY_USAGE_COUNT` | Message | `{field, id}` | `number` | Count users referencing a lookup entity |
| `USER_GROUPS_CHANGED` | Event | `{userId}` | — | Sync authData.groupIds in user document |
| `PERMISSIONS_CHANGED` | Event | `{groupIds}` | — | Invalidate permission cache |

### Grants Service

| Pattern | Type | Input | Output | Purpose |
|---------|------|-------|--------|---------|
| `GROUP_EXISTS` | Message | `string \| {id}` | `boolean` | Check if group exists |
| `FIND_GROUP_BY_NAME` | Message | `string \| {name}` | `Group \| null` | Find group by name |
| `CREATE_GROUP` | Message | `CreateGroupInput` + `_internalSecret` | `Group` | Create group (RpcInternalGuard) |
| `CREATE_PERMISSION` | Message | `CreatePermissionInput` + `_internalSecret` | `Permission` | Create permission (RpcInternalGuard) |
| `UPSERT_PERMISSION` | Message | `CreatePermissionInput` + `_internalSecret` | `Permission` | Upsert permission (RpcInternalGuard) |
| `CREATE_OPERATION_PERMISSION` | Message | `CreateOperationPermissionInput` + `_internalSecret` | `OperationPermission` | Create op permission (RpcInternalGuard) |
| `UPSERT_OPERATION_PERMISSION` | Message | `CreateOperationPermissionInput` + `_internalSecret` | `OperationPermission` | Upsert op permission (RpcInternalGuard) |
| `UPSERT_PAGE_PERMISSION` | Message | `CreatePagePermissionInput` + `_internalSecret` | `PagePermission` | Upsert page permission (RpcInternalGuard) |
| `FIND_OP_PERMISSIONS_BY_GROUP` | Message | `{groupId}` | `OperationPermission[]` | List operation permissions |
| `FIND_PERMISSIONS_BY_GROUP` | Message | `{groupId, entityName?}` | `Permission[]` | List field permissions |
| `FIND_PAGE_PERMISSIONS_BY_GROUP` | Message | `{groupId}` | `PagePermission[]` | List page permissions |
| `FIND_BULK_PERMISSIONS_MULTI` | Message | `{groupIds, entityNames?, opNames?}` | `BulkPermsDTO` | Bulk load for PermissionsCacheService |
| `GET_MY_PERMISSIONS` | Message | `{groupIds}` | permissions object | Load all permissions for current user (used by `/auth/me`) |
| `CHECK_OPERATION_PERMISSION` | Message | `{groupIds, operation}` | `{allowed: boolean}` | Check single operation permission (used by force-revoke) |

### GroupAssignments Service

| Pattern | Type | Input | Output | Purpose |
|---------|------|-------|--------|---------|
| `FIND_GROUP_ASSIGNMENTS_BY_USER_ID` | Message | `string` | `GroupAssignment[]` | User's group memberships |
| `FIND_GROUP_ASSIGNMENTS_BY_GROUP_ID` | Message | `string` | `GroupAssignment[]` | Group's members |
| `CREATE_GROUP_ASSIGNMENT` | Message | `{userId, groupId}` | `GroupAssignment` | Create assignment |
| `USER_CREATED` | Event | `{userId, groupIds}` | — | Create assignments for new user |
| `USER_UPDATED` | Event | `{userId, groupIds}` | — | Sync assignments on user update |
| `USER_DELETED` | Event | `{userId}` | — | Delete all assignments |
| `USER_HARD_DELETED` | Event | `{userId}` | — | Delete all assignments (permanent) |
| `GROUP_CREATED` | Message | `{groupId, userIds}` | — | Create assignments for new group |
| `GROUP_UPDATED` | Message | `{groupId, userIds}` | — | Sync assignments on group update |
| `GROUP_DELETED` | Message | `{groupId}` | — | Delete all assignments for group |

### MilestoneToUser Service

| Pattern | Type | Input | Output | Purpose |
|---------|------|-------|--------|---------|
| `FIND_MILESTONE_TO_USER_BY_USER_ID` | Message | `string` | `{_id}[]` | User's milestone assignments |
| `FIND_MILESTONE_TO_USER_BY_MILESTONE_ID` | Message | `string` | `{_id}[]` | Milestone's assigned users |
| `USER_CREATED` | Event | `{userId, assignedMilestoneIds}` | — | Create assignments |
| `USER_UPDATED` | Event | `{userId, assignedMilestoneIds}` | — | Sync assignments |
| `USER_DELETED` | Event | `{userId}` | — | Delete all assignments |
| `MILESTONE_CREATED` | Event | `{milestoneId, assignedUserIds, startDates?, endDates?}` | — | Create assignments |
| `MILESTONE_UPDATED` | Event | `{milestoneId, assignedUserIds, startDates?, endDates?}` | — | Sync assignments |
| `MILESTONE_DELETED` | Event | `{milestoneId}` | — | Delete all assignments |

### MilestoneToProject Service

| Pattern | Type | Input | Output | Purpose |
|---------|------|-------|--------|---------|
| `FIND_MILESTONE_TO_PROJECT_BY_PROJECT_ID` | Message | `string` | assignments | Project's milestones |
| `FIND_MILESTONE_TO_PROJECT_BY_MILESTONE_ID` | Message | `string` | assignments | Milestone's projects |
| `FIND_MILESTONE_TO_PROJECT_BY_MILESTONE_IDS` | Message | `string[]` | assignments | Batch lookup |
| `CREATE_MILESTONE_TO_PROJECT` | Message | `{milestoneId, projectId, startDate?, endDate?}` | assignment | Direct create (bootstrap) |
| `PROJECT_CREATED` | Event | `{projectId, assignedMilestoneIds}` | — | Create assignments |
| `PROJECT_UPDATED` | Event | `{projectId, assignedMilestoneIds}` | — | Sync assignments |
| `PROJECT_DELETED` | Event | `{projectId}` | — | Delete assignments |
| `MILESTONE_CREATED` | Event | `{milestoneId, assignedProjectIds, startDates?, endDates?}` | — | Create assignments |
| `MILESTONE_DELETED` | Event | `{milestoneId}` | — | Delete assignments |

### Milestones Service

| Pattern | Type | Input | Output | Purpose |
|---------|------|-------|--------|---------|
| `MILESTONE_EXISTS` | Message | `string \| {id}` | `boolean` | Check existence |
| `FIND_MILESTONE_BY_NAME` | Message | `{name}` | `Milestone \| null` | Find by name |
| `GET_MILESTONE_DATES` | Message | `string` | `{startDate, endDate}` | Get date range |
| `CREATE_MILESTONE` | Message | `CreateMilestoneInput` | `Milestone` | Create (bootstrap) |
| `UPDATE_MILESTONE` | Message | `UpdateMilestoneInput` | `Milestone` | Update |
| `UPDATE_MILESTONE_STATUS` | Message | `{milestoneId, status}` | `Milestone` | Update status |
| `DELETE_MILESTONE` | Message | `string` | `Milestone` | Delete |

### Projects Service

| Pattern | Type | Input | Output | Purpose |
|---------|------|-------|--------|---------|
| `PROJECT_EXISTS` | Message | `string \| {id}` | `boolean` | Check existence |
| `FIND_PROJECT_BY_NAME` | Message | `string` | `Project \| null` | Find by name |
| `GET_PROJECT_DATES` | Message | `string` | `{startDate, endDate}` | Get date range |
| `CREATE_PROJECT` | Message | `{projectBasicData, assignedMilestoneIds?}` | `Project` | Create (bootstrap) |
| `CREATE_PROJECT_TEMPLATE` | Message | `{name, description?, scope, createdBy?}` | `ProjectTemplate` | Create template (bootstrap) |
| `FIND_PROJECT_TEMPLATE_BY_NAME` | Message | `string` | `ProjectTemplate \| null` | Find template |
| `CREATE_PROJECT_TEMPLATE_PHASE` | Message | `{templateId, name, orderIndex, ...}` | `ProjectTemplatePhase` | Create phase |
| `SEED_PROJECT_TEMPLATES` | Message | — | `void` | Trigger template seeding (bootstrap) |

### Organization Service

| Pattern | Type | Input | Output | Purpose |
|---------|------|-------|--------|---------|
| `FIND_SENIORITY_LEVELS_BY_IDS` | Message | `string[]` | `SeniorityLevel[]` | Batch lookup |
| `FIND_JOB_ROLES_BY_IDS` | Message | `string[]` | `JobRole[]` | Batch lookup |
| `FIND_COMPANIES_BY_IDS` | Message | `string[]` | `Company[]` | Batch lookup |
| `FIND_ROLE_CATEGORIES_BY_IDS` | Message | `string[]` | `RoleCategory[]` | Batch lookup |
| `CREATE_SENIORITY_LEVEL` | Message | `{name, order, description?}` | `SeniorityLevel` | Bootstrap seeder |
| `CREATE_JOB_ROLE` | Message | `{name, order, description?}` | `JobRole` | Bootstrap seeder |
| `CREATE_ROLE_CATEGORY` | Message | `{name, description?}` | `RoleCategory` | Bootstrap seeder |
| Various `FIND_*_BY_NAME` | Message | `string` | entity or null | Bootstrap seeder lookup |

### Holidays Service

| Pattern | Type | Input | Output | Purpose |
|---------|------|-------|--------|---------|
| `GET_HOLIDAYS` | Message | `{countryCode, year}` | `HolidayCalendar \| null` | Single country/year lookup |
| `GET_HOLIDAYS_BULK` | Message | `{countryCodes[], startYear, endYear}` | `HolidayCalendar[]` | Multi-country, year-range lookup |
| `GET_AVAILABLE_COUNTRIES` | Message | — | `{countryCode, countryName}[]` | List seeded countries |
| `GET_COMPANY_CLOSURES` | Message | `{startDate, endDate}` | `CompanyClosure[]` | Company closures in range (tenant) |
| `GET_USER_ABSENCES` | Message | `{userId, startDate, endDate}` | `UserAbsence[]` | User absences in range (tenant) |
| `GET_BUSINESS_DAYS` | Message | `{userId?, countryCode, startDate, endDate}` | `BusinessDay[]` | Calculate business days |
| `PERMISSIONS_CHANGED` | Event | `{groupIds}` | — | Invalidate permission cache |

### Tenants Service

| Pattern | Type | Input | Output | Purpose |
|---------|------|-------|--------|---------|
| `TENANT_EXISTS` | Message | `string` | `boolean` | Check existence |
| `FIND_TENANT_BY_ID` | Message | `string` | `Tenant \| null` | Find by ID |
| `FIND_TENANT_BY_SLUG` | Message | `string` | `Tenant \| null` | Find by slug |
| `RESOLVE_TENANT_BY_SLUG` | Message | `string` | `Tenant \| null` | Resolve active tenant |
| `CHECK_SLUG_AVAILABILITY` | Message | `string` | `{valid, error?}` | Validate slug |
| `SIGNUP_TENANT` | Message | `SignupTenantRpcDto` | `{tenantId}` | Create tenant + provision (Gateway proxy) |
| `GET_TENANT_STATUS` | Message | `{id}` | `{status, loginUrl?, error?}` | Poll provisioning status (Gateway proxy) |
| `BOOTSTRAP_TENANT` | Message | `BootstrapTenantRpcDto` | `{success, tenantId}` | Create + provision (bootstrap only) |
| `CHECK_PLATFORM_ADMIN` | Message | `{email}` | `{isPlatformAdmin}` | Admin check (user_identities primary, platform_admins fallback) |
| `LOGIN_PLATFORM_ADMIN` | Message | `LoginPlatformAdminRpcDto` | admin record or null | Legacy admin login |
| `SEED_PLATFORM_ADMIN` | Message | `{email, password, name, surname}` | `{success, skipped?}` | Bootstrap seeder |
| `VERIFY_IDENTITY_PASSWORD` | Message | `VerifyIdentityPasswordRpcDto` | identity | Login verification |
| `DISCOVER_TENANTS` | Message | `DiscoverTenantsRpcDto` | memberships | List tenants for email |
| `SWITCH_TENANT` | Message | `{email, tenantSlug}` | `{userId, tenantSlug, tenantId}` | Tenant switch |
| `GET_IDENTITY_MEMBERSHIPS` | Message | `{email}` | `{memberships, isPlatformAdmin}` | Full identity info |
| `UPDATE_IDENTITY_PASSWORD` | Message | `UpdateIdentityPasswordRpcDto` | void | Update password |
| `UPSERT_USER_IDENTITY` | Message | `UpsertUserIdentityRpcDto` | identity | Create/update identity |

## RPC Security

### RpcInternalGuard

Registered **globally** via `createSubgraphMicroservice` — protects ALL RPC handlers from unauthorized callers. The `_internalSecret` is injected automatically by `TenantAwareClientProxy` into every RPC call.

**Behavior:**
- HTTP/GraphQL requests → pass through (those have their own guards)
- Handlers decorated with `@SkipRpcGuard()` → bypass validation
- All other RPC handlers → validates `_internalSecret` in payload using timing-safe comparison, then strips it before the handler runs

```typescript
// The guard is global — no @UseGuards needed on individual handlers.
// Handlers that should skip validation use:
@SkipRpcGuard()
@MessagePattern('SOME_PATTERN')
async handler(@Payload() dto: SomeDto) { ... }
```

**Fail-closed:** If `INTERNAL_HEADER_SECRET` is not set, all RPC requests are rejected.

### Gateway HMAC Signature

The Gateway signs internal headers with HMAC-SHA256 using `INTERNAL_HEADER_SECRET`. The signature includes a **timestamp** for anti-replay protection:

```typescript
const timestamp = Date.now().toString();
headers.set('x-gateway-timestamp', timestamp);

const payload = `${userGroups}|${internalCall}|${userId}|${tenantSlug}|${tenantId}|${timestamp}`;
const signature = createHmac('sha256', secret).update(payload).digest('hex');
headers.set('x-gateway-signature', signature);
```

Subgraphs verify this signature via `verifyGatewaySignature(headers)` before trusting any `x-user-*` or `x-tenant-*` headers. **Requests older than 30 seconds are rejected** (anti-replay). This prevents direct calls to subgraph HTTP endpoints from spoofing user identity.

See [Security](/shared/security.md) for details on `verifyGatewaySignature` and `RpcInternalGuard`.

### RPC DTO Validation

All RPC handlers across auth, users, and tenants services use **formal DTO classes** with `class-validator` decorators. The global `ValidationPipe` (configured in `createSubgraphMicroservice` with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`) validates payloads automatically.

The `TenantClsInterceptor` strips transport metadata (`_tenantSlug`, `_tenantId`) and `RpcInternalGuard` strips `_internalSecret` from payloads **before** `ValidationPipe` runs, so DTOs only need to declare business-relevant fields.

```
Guard lifecycle: RpcInternalGuard → TenantClsInterceptor → ValidationPipe → Handler
```

## Event-Driven Patterns

### Design Principles

1. **Events are fire-and-forget** — emitters don't wait for handlers
2. **Handlers must be idempotent** — events may be delivered multiple times
3. **No event loops** — service A emits → B handles, but B does NOT re-emit the same event
4. **Direct emission** — the service that changes state emits the event (not relay via intermediate)

### Global Event: PERMISSIONS_CHANGED

Every subgraph listens for `PERMISSIONS_CHANGED` and invalidates its local permission cache:

```typescript
@EventPattern('PERMISSIONS_CHANGED')
handlePermissionsChanged(@Payload() data: { groupIds: string[] }) {
  PermissionsCacheService.invalidateGroups(data.groupIds);
}
```
