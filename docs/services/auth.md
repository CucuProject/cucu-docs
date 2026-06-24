# Auth Service

The Auth service owns Cucu authentication state: server-side sessions, JWT issuance, refresh-token rotation, password changes, and the orchestration needed by the Gateway to build a trusted user context.

It stores sessions in tenant databases and coordinates with Tenants, Users, Grants, and Audit through Redis RPC/events.

## Service Profile

| Property | Value |
|---|---|
| Runtime | NestJS subgraph + Redis RPC |
| Public port | `3001` |
| Database | `auth_{tenantSlug}` |
| Collection | `sessions` |
| App module | `apps/auth/src/auth.module.ts` |
| Context | `AuthContext` |

## Responsibilities

- Validate Gateway access tokens via `VERIFY_ACCESS_TOKEN`.
- Validate refresh tokens via `VERIFY_FROM_TOKEN`.
- Return current authenticated user state via `GET_ME`.
- Rotate refresh tokens via `REFRESH_FROM_TOKEN`.
- Switch tenant context via `SWITCH_FROM_TOKEN`.
- Create or reuse sessions after the Gateway verifies credentials through Tenants.
- Expose GraphQL operations for session listing, revocation, logout, and password change.
- Apply field-level filtering on `Session`.
- Emit security audit events for login and token/session anomalies.

## Functional Role

Auth is the session authority for Cucu. It turns a credential that Tenants has already verified into a server-side session, access token, refresh token, and tenant-scoped identity context. It also owns the security response when a token/session looks suspicious.

Primary actors:

- Gateway, which calls Auth for login/session lifecycle and access-token validation.
- End users managing sessions, logout, and password changes through GraphQL/REST.
- Tenants, which owns Universal Auth identities and membership checks.
- Users, which supplies group ids and receives password-hash updates.
- Audit, which receives login and token anomaly events.

Key enabled flows:

- Login session creation/reuse after Gateway verifies password with Tenants.
- Access-token validation for every authenticated Gateway GraphQL request.
- Refresh rotation with reuse detection, device fingerprint checks, and idle/max-age enforcement.
- Password change with tenant DB update, best-effort platform identity sync, session revocation, and group-cache invalidation.
- Tenant switching by validating the current refresh session, checking target membership, and issuing a new token pair.

## Main Modules

| Module/File | Purpose |
|---|---|
| `auth.module.ts` | Tenant DB, Redis cache DB=1, GraphQL federation, JWT RS256, guards/interceptors. |
| `auth.controller.ts` | Redis message/event handlers. |
| `auth.resolver.ts` | GraphQL API for sessions/password/logout. |
| `auth-orchestrator.service.ts` | Gateway-facing consolidated auth flows. |
| `session.service.ts` | Session creation, reuse, validity, revocation and projections. |
| `token.service.ts` | Refresh rotation, group cache, token reuse detection. |
| `password.service.ts` | Password change and session invalidation. |
| `schemas/session.schema.ts` | Tenant MongoDB session schema and indexes. |

## Session Model

| Field | GraphQL | Purpose |
|---|---:|---|
| `_id` | yes | Session id embedded in JWTs. |
| `userId` | yes | Session owner. |
| `refreshToken` | no | Hash of the active refresh token. |
| `deviceFingerprint` | no | Refresh-device binding. |
| `revokedAt` | yes | Explicit or logical revocation timestamp. |
| `ip` | yes | Last known session IP. |
| `deviceName` | yes | Device parsed from user-agent. |
| `browserName` | yes | Browser parsed from user-agent. |
| `expiresAt` | yes | Refresh-token expiry. |
| `sessionStart` | yes | Session lifetime start. |
| `lastActivity` | yes | Debounced session activity timestamp. |
| `tenantId` | no | Defense-in-depth tenant reference. |

Indexes:

- `{ userId, deviceFingerprint, revokedAt }` for session reuse.
- `{ userId, revokedAt }` for listing and batch revocation.

## Gateway-Facing RPC

| Pattern | Input | Output | Used by |
|---|---|---|---|
| `VERIFY_ACCESS_TOKEN` | `{ accessToken }` | Validated user/session context or invalid reason | Gateway Bearer middleware. |
| `VERIFY_FROM_TOKEN` | `{ refreshToken }` | `{ valid, userId, groups, isPlatformAdmin, memberships }` | `/auth/verify`. |
| `GET_ME` | `{ refreshToken }` | `{ authenticated, user, permissions }` | `/auth/me`. |
| `REFRESH_FROM_TOKEN` | `{ refreshToken, deviceFingerprint?, ip? }` | New token pair + enrichment | `/auth/refresh`. |
| `SWITCH_FROM_TOKEN` | `{ refreshToken, targetTenantSlug }` | New token pair + target tenant | `/auth/switch`. |
| `CREATE_AUTHENTICATED_SESSION` | Verified identity + request metadata | Access token, refresh token, session id | `/auth/login`. |

## Internal RPC and Events

| Pattern | Kind | Purpose |
|---|---|---|
| `CHECK_SESSION` | Message | Legacy/fallback session check. |
| `REVOKE_SESSION` | Message | Revoke one session, optionally forced. |
| `REFRESH_SESSION` | Message | Internal refresh rotation entrypoint. |
| `SWITCH_SESSION_TENANT` | Message | Re-issue tokens for an existing session in a new tenant context. |
| `USER_DELETED` | Event | Revoke all sessions for a deleted user. |
| `REVOKE_ALL_SESSIONS` | Event | Revoke all sessions for a user. |

Outbound dependencies:

- Tenants: `CHECK_PLATFORM_ADMIN`, `GET_IDENTITY_MEMBERSHIPS`, `SWITCH_TENANT`, `UPDATE_IDENTITY_PASSWORD`.
- Users: `FIND_GROUPIDS_BY_USERID`, `FIND_USER_WITH_PASSWORD`, `UPDATE_USER_PASSWORD`.
- Grants: `GET_MY_PERMISSIONS`.
- Audit: `AUDIT_EVENT`.

## GraphQL API

| Type | Name | Args | Notes |
|---|---|---|---|
| Query | `findAllSessions` | none | Current user's sessions with field filtering. |
| Query | `findSessionsByUserId` | `userId` | Scope `self` restricts access to own sessions. |
| Mutation | `revokeSession` | `input.sessionId` | Self-scope enforces session ownership. |
| Mutation | `revokeUserSessions` | `userId?` | Defaults to current user; permission handled by `OperationGuard`. |
| Mutation | `changePassword` | `currentPassword`, `newPassword` | Updates password and revokes active sessions. |
| Mutation | `logout` | `input.sessionId` | Revokes own session. |
| ResolveField | `Session.user` | parent session | Federation stub for `User`. |

## Core Business Flows

### Access Token Validation

`AuthOrchestratorService.verifyAccessToken()` is the Gateway's source of truth:

1. Verify JWT signature and expiry.
2. Require `type === "access"`.
3. Require `sessionId`.
4. Run session validation in tenant context when `tenantSlug` is present.
5. Return only validated identity/session/group/tenant data to the Gateway.

Session validation checks session existence, revocation, idle timeout, max age, and group ids. It does not re-check the current Users `active`/`deletedAt` state on every request. User deactivation therefore relies on the `REVOKE_ALL_SESSIONS` event from Users; that reliability gap is tracked in CUC-270..CUC-276.

### Session Creation

The Gateway verifies credentials through Tenants first. Auth receives a verified identity and request metadata:

1. Load group ids from Users.
2. Look for an active session by `(userId, deviceFingerprint)`.
3. Reuse the session when it is still inside idle/max-age limits.
4. Otherwise enforce the concurrent session limit and create a new session.
5. Pre-generate the session `_id` before signing JWTs.
6. Store only the hashed refresh token.
7. Emit `LOGIN_SUCCESS`.

IP is intentionally excluded from the reuse lookup to avoid unnecessary session churn when the network changes.

### Refresh Token Rotation

`TokenService.refreshToken()`:

1. Verify refresh token and `type === "refresh"`.
2. Resolve tenant context from token payload.
3. Load the session.
4. Reject missing or revoked sessions.
5. Compare stored hash with the presented refresh token.
6. On mismatch, revoke the session and emit `TOKEN_REUSE_DETECTED`.
7. Validate device fingerprint when provided.
8. Log IP changes without blocking.
9. Enforce idle timeout and max age.
10. Load group ids and sign a new access/refresh pair.
11. Store the hash of the new refresh token.

### Password Change

`PasswordService.changePassword()`:

1. Load current password hash from Users.
2. Verify the current password with bcrypt.
3. Hash the new password.
4. Update the tenant DB through Users.
5. Best-effort sync the platform DB through Tenants.
6. Revoke all active sessions.
7. Clear tenant-scoped group cache when tenant context is available.

This is not currently atomic. Login uses the Tenants platform identity as source of truth, while the blocking write is the Users tenant password mirror. If `UPDATE_IDENTITY_PASSWORD` fails after `UPDATE_USER_PASSWORD`, the GraphQL mutation can still return success while future login keeps using the old platform password until reconciliation. The fix track is CUC-285..CUC-292.

## Audit Events

| Event | Severity | Trigger |
|---|---|---|
| `LOGIN_SUCCESS` | `info` | Session created or reused after valid login. |
| `TOKEN_REUSE_DETECTED` | `critical` | Old refresh token reused after rotation. |
| `DEVICE_FINGERPRINT_MISMATCH` | `high` | Refresh attempted from a different device fingerprint. |
| `IP_CHANGED_ON_REFRESH` | `low` | Refresh came from a different IP. |
| `SESSION_IDLE_REVOKED` | `info` | Idle timeout exceeded. |
| `SESSION_MAX_AGE_REVOKED` | `info` | Max session age exceeded. |

## Cache

Auth uses Redis DB=1 for group ids:

```text
groups:{tenantSlug}:{userId}
```

TTL is 3600 seconds. Tenant slug is part of the key to avoid cross-tenant pollution.

`TokenService.getGroupIds()` returns an empty group list when the Users `FIND_GROUPIDS_BY_USERID` RPC fails. That is fail-closed for permissions but can silently degrade the user context. Group cache invalidation and fail-policy hardening are tracked in CUC-277..CUC-284.

## Invariants

- Refresh tokens are never stored in clear text.
- Session `_id` is generated before JWT signing so token and DB session agree.
- Access tokens are not trusted by the Gateway until Auth validates token and session.
- Refresh-token reuse revokes the entire session.
- Group ids are runtime claims, not the source of truth.
- GraphQL session fields are filtered through field-level grants.
- RPC DTOs are validated with formal DTO classes.

## Failure Modes

- Refresh-token hash mismatch is treated as token reuse: Auth revokes the session, emits `TOKEN_REUSE_DETECTED`, and rejects the refresh.
- Device fingerprint mismatch blocks refresh and emits `DEVICE_FINGERPRINT_MISMATCH`.
- Idle timeout or max session age revokes the session during refresh/validation.
- `GET_MY_PERMISSIONS` or membership enrichment failures degrade `/auth/me`/refresh enrichment but do not make Gateway trust unvalidated tokens.
- Platform DB password sync during `changePassword` is best effort; tenant `users` update and session revocation are the blocking path.
- Deactivation revocation depends on receiving `REVOKE_ALL_SESSIONS`; missed events can leave sessions valid until they are otherwise revoked or expire.
- Group lookup failure during token/session refresh currently degrades to an empty group list, not a retried or surfaced dependency error.

## Docs vs Code Notes

- `CHECK_SESSION` still exists as legacy/fallback RPC, but Gateway's primary Bearer validation path is `VERIFY_ACCESS_TOKEN`.
- Password source of truth for login is Tenants `user_identities.passwordHash`; Auth changes tenant user password first and then attempts platform sync.
- The critical code-audit backlog for Auth is CUC-270..CUC-276, CUC-277..CUC-284, CUC-285..CUC-292, and CUC-293..CUC-300.

## Examples

### `VERIFY_ACCESS_TOKEN`

Input:

```json
{
  "accessToken": "eyJ..."
}
```

Valid response:

```json
{
  "valid": true,
  "userId": "665...",
  "sessionId": "665...",
  "groupIds": ["665..."],
  "tenantSlug": "acme",
  "tenantId": "665...",
  "email": "admin@acme.test"
}
```

Invalid response:

```json
{
  "valid": false,
  "reason": "Invalid or expired access token"
}
```

### `changePassword`

```graphql
mutation ChangePassword($input: ChangePasswordInput!) {
  changePassword(input: $input)
}
```

```json
{
  "input": {
    "currentPassword": "OldStr0ng!",
    "newPassword": "NewStr0ng!"
  }
}
```

## Source References

- `apps/auth/src/auth.module.ts`
- `apps/auth/src/auth.controller.ts`
- `apps/auth/src/auth.resolver.ts`
- `apps/auth/src/auth-orchestrator.service.ts`
- `apps/auth/src/session.service.ts`
- `apps/auth/src/token.service.ts`
- `apps/auth/src/password.service.ts`
- `apps/auth/src/schemas/session.schema.ts`

## Relevant Tests

- `apps/auth/tests/auth-controller.spec.ts`
- `apps/auth/tests/auth-service.spec.ts`
- `apps/auth/tests/auth-orchestrator.spec.ts`
- `apps/auth/tests/auth-resolver.spec.ts`
