# Tenants Service

The Tenants service owns Cucu's platform database: tenant registry, Universal Auth identities, tenant signup/provisioning, platform admin checks, and tenant discovery.

Unlike tenant runtime services, it does not use `TenantDatabaseModule`. It connects to the shared platform MongoDB through `MONGODB_URI`. It still imports `TenantClsModule` because Redis/RPC calls may carry `_tenantSlug` metadata and the shared subgraph pipeline expects an active CLS context.

## Service Profile

| Property | Value |
|---|---|
| Runtime | NestJS subgraph + Redis RPC + internal HTTP |
| Database | Shared platform DB |
| Collections | `tenants`, `user_identities`, `platform_admins`, `tenantadmins` |
| App module | `apps/tenants/src/tenants.module.ts` |
| Main service | `apps/tenants/src/tenants.service.ts` |

## Responsibilities

- Manage tenant records, status, plans, limits, branding, default currency, and lifecycle operations.
- Validate tenant slugs with regex, blacklist, and uniqueness checks.
- Verify Universal Auth identities for Gateway login.
- Store the platform password source of truth in `user_identities.passwordHash`.
- Resolve tenant memberships for discovery and tenant switching.
- Provision initial tenant databases, indexes, base groups, admin user, and identity membership.
- Provide platform admin checks with `user_identities` as primary and legacy `platform_admins` as fallback.

## Data Ownership

### `tenants`

Key fields include `slug`, `name`, `status`, `plan`, `ownerEmail`, `primaryColor`, `logoUrl`, `limits`, `trialExpiresAt`, billing references, provisioning timestamps, `customDomain`, `defaultCurrency`, and `deletedAt`.

Indexes:

- `slug` unique
- `status`
- `customDomain` unique partial string
- `ownerEmail`
- `deletedAt`

### `user_identities`

`UserIdentity` stores normalized email, password hash, name/surname, `isPlatformAdmin`, memberships, and lockout state.

Membership fields:

- `tenantSlug`
- `tenantId`
- `userId`
- `role`
- `joinedAt`

Lockout fields:

- `failedLoginAttempts`
- `lockoutUntil`

Index: `email` unique.

## REST API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/tenants/resolve/:slug` | `x-internal-resolve` equals `TENANT_RESOLVE_SECRET` | Server-to-server tenant config lookup for frontend middleware. |

Public signup/check/status endpoints live at the Gateway and proxy to Tenants RPC.

## GraphQL API

| Type | Name | Args | Notes |
|---|---|---|---|
| Query | `findAllTenants` | `pagination?`, `status?` | Platform tenant list. |
| Query | `findOneTenant` | `id` | Tenant by ObjectId. |
| Query | `supportedCurrencies` | none | Static currency metadata. |
| Mutation | `createTenant` | `input` | Creates a tenant in `provisioning`; does not run provisioning by itself. |
| Mutation | `updateTenant` | `input` | Tenant metadata update. |
| Mutation | `suspendTenant` | `id` | Only `active` or `trial` tenants. |
| Mutation | `reactivateTenant` | `id` | Only suspended tenants. |
| Mutation | `extendTrial` | `id`, `days` | Trial plan only, 1-30 days. |
| ResolveField | `Tenant.userCount` | parent | Currently a stub returning `0`. |

## RPC API

| Pattern | Purpose |
|---|---|
| `SIGNUP_TENANT` | Validate slug, create tenant, and run provisioning. |
| `GET_TENANT_STATUS` | Poll provisioning status after signup. |
| `TENANT_EXISTS` | Referential existence check. |
| `FIND_TENANT_BY_ID` | Platform tenant lookup by id. |
| `FIND_TENANT_BY_SLUG` | Tenant lookup by slug. |
| `RESOLVE_TENANT_BY_SLUG` | Active/non-deleted tenant resolve. |
| `GET_TENANT_DEFAULT_CURRENCY` | Returns tenant currency, defaulting to `EUR`. |
| `UPDATE_TENANT` | Update tenant metadata. |
| `CHECK_SLUG_AVAILABILITY` | Slug regex/blacklist/unique check. |
| `BOOTSTRAP_TENANT` | Idempotent bootstrap provisioning. |
| `CHECK_PLATFORM_ADMIN` | Primary identity check plus legacy fallback. |
| `LOGIN_PLATFORM_ADMIN` | Legacy platform admin login. |
| `SEED_PLATFORM_ADMIN` | Seed platform admin. |
| `DISCOVER_TENANTS` | Email to tenant memberships. |
| `VERIFY_IDENTITY_PASSWORD` | Login password + membership validation. |
| `SWITCH_TENANT` | Verify membership for tenant switch. |
| `GET_IDENTITY_MEMBERSHIPS` | Membership/admin enrichment. |
| `UPDATE_IDENTITY_PASSWORD` | Sync password hash from Auth password change. |
| `UPSERT_USER_IDENTITY` | Create/update identity and membership. |
| `CHECK_ACCOUNT_LOCKOUT` | Read lockout status. |
| `HANDLE_LOGIN_FAILURE` | Increment failed attempts and apply lockout. |

## Core Flows

### Signup Provisioning

1. `SIGNUP_TENANT` validates slug availability.
2. `TenantsService.create()` inserts a `tenants` record with `status: provisioning`.
3. `TenantProvisioningService.provision()` creates tenant DBs for the configured `TENANT_SERVICES`.
4. It applies service indexes from `service-indexes.ts`.
5. It seeds base groups in `grants_{slug}`.
6. It creates the admin user in `users_{slug}` with a platform-auth placeholder password.
7. It creates or updates `user_identities` with the real password hash and owner membership.
8. It marks the tenant `active` and sets the trial expiry.
9. On failure, it drops created databases, removes the membership, and marks `provisioning_failed`.

### Universal Auth

`VERIFY_IDENTITY_PASSWORD` normalizes email, checks lockout, verifies bcrypt password, resets lockout on success, and requires a membership for the requested `tenantSlug`.

Progressive lockout:

- 5 failed attempts: 15 minutes
- 10 failed attempts: 30 minutes
- 15 failed attempts: 60 minutes

## Invariants

- Tenant slug rules are enforced before create/provisioning.
- Password source of truth is platform `user_identities`, not `users.authData.password`.
- Login requires both valid credentials and membership in the requested tenant.
- Internal tenant resolve uses timing-safe secret comparison.
- The service is platform DB scoped; tenant runtime DB work is limited to provisioning.

## Cache and Audit

No domain cache is implemented in the files reviewed. `AUDIT_SERVICE` is registered as a client, but no direct audit event emitters were found in the Tenants files reviewed.

## Example

```json
{
  "email": "admin@acme.test",
  "password": "Str0ng!Pass",
  "tenantSlug": "acme"
}
```

Valid `VERIFY_IDENTITY_PASSWORD` response:

```json
{
  "accountId": "665...",
  "userId": "665...",
  "tenantSlug": "acme",
  "tenantId": "665...",
  "isPlatformAdmin": false,
  "email": "admin@acme.test"
}
```

## Relevant Tests

- `apps/tenants/tests/tenants-service.spec.ts`
- `apps/tenants/tests/tenants-controller.spec.ts`
- `apps/tenants/tests/tenant-provisioning.service.spec.ts`

## Notes and Risks

- The provisioning service currently creates DBs for a historical subset of tenant services and does not include newer runtime services such as roadmaps, rates, resources, ai-agents, holidays, or milestone-to-resource.
- `Tenant.userCount` returns `0`.
- Provisioning is synchronous; the code comments call out BullMQ as future work.

## Source References

- `apps/tenants/src/tenants.module.ts`
- `apps/tenants/src/tenants.controller.ts`
- `apps/tenants/src/tenants.resolver.ts`
- `apps/tenants/src/tenant-fields.resolver.ts`
- `apps/tenants/src/tenants.service.ts`
- `apps/tenants/src/provisioning/tenant-provisioning.service.ts`
- `apps/tenants/src/provisioning/service-indexes.ts`
- `apps/tenants/src/schemas/tenant.schema.ts`
- `apps/tenants/src/schemas/user-identity.schema.ts`
