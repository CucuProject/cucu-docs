# Tenants Service

The Tenants service manages the **Platform DB** — the global registry of all tenants in the Cucu platform. It is the source of truth for tenant identity, configuration, and lifecycle state.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 3002 |
| **Database** | tenants-db (MongoDB, port 9002) |
| **Role** | Tenant registry, platform-level configuration |
| **Dependencies** | None (core service) |

::: warning Platform DB — Not Per-Tenant
The `tenants` database is a **shared global database**, not a per-tenant database. It stores metadata about tenants, not tenant data itself. Tenant-scoped data lives in separate per-tenant databases managed by `@cucu/tenant-db`.
:::

## Schemas

### Tenant

The core entity representing a registered tenant on the platform:

```typescript
interface Tenant {
  _id: ID;

  // Identity
  slug: string;           // Unique URL-safe identifier (e.g., "acme-corp")
  name: string;           // Human-readable display name

  // Lifecycle
  status: TenantStatus;   // See status values below
  plan: TenantPlan;       // Subscription plan

  // Owner
  ownerEmail: string;     // Email of the tenant owner

  // Branding
  primaryColor?: string;  // Hex color (e.g., "#3B82F6")
  logoUrl?: string;       // URL to tenant logo

  // Configuration
  settings?: Record<string, any>;  // Tenant-level feature flags / config
  limits: {
    maxUsers: number;           // Maximum users allowed
    maxProjects: number;        // Maximum projects allowed
    maxStorageMb: number;       // Storage quota in MB
  };

  // Billing
  billing?: {
    customerId?: string;        // External billing customer ID
    subscriptionId?: string;    // External subscription ID
  };

  // Lifecycle timestamps
  trialEndsAt?: Date;
  suspendedAt?: Date;
  archivedAt?: Date;

  // Soft delete
  deletedAt?: Date;

  // Audit
  createdAt: Date;
  updatedAt: Date;
}
```

#### Tenant Status Values

| Status | Description |
|--------|-------------|
| `provisioning` | Tenant is being set up (resources being created) |
| `active` | Tenant is fully operational |
| `trial` | Tenant is in trial period |
| `suspended` | Tenant has been suspended (billing or policy) |
| `archived` | Tenant is archived (read-only) |
| `deleted` | Tenant has been soft-deleted |
| `provisioning_failed` | Provisioning encountered an error |

#### Tenant Plan Values

| Plan | Description |
|------|-------------|
| `trial` | Free trial with basic limits |
| `starter` | Entry-level paid plan |
| `professional` | Full-featured plan |
| `enterprise` | Custom enterprise plan |

### TenantAdmin

Represents a user with administrative access to a specific tenant:

```typescript
interface TenantAdmin {
  _id: ID;
  email: string;          // Admin user email
  tenantSlug: string;     // Tenant slug reference
  tenantId: string;       // Tenant ObjectId reference
  role: TenantAdminRole;  // 'owner' | 'admin'
  createdAt: Date;
  updatedAt: Date;
}
```

#### TenantAdmin Role Values

| Role | Description |
|------|-------------|
| `owner` | Original tenant creator — full control |
| `admin` | Additional admin with management access |

## Slug Validation

Tenant slugs follow strict validation rules:

- **Regex**: `^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$`
  - Starts and ends with a lowercase letter or digit
  - Middle can contain lowercase letters, digits, and hyphens
  - Total length: 3–30 characters
- **Blacklist**: The following slugs are reserved and cannot be registered:
  `www`, `api`, `admin`, `app`, `mail`, `ftp`, `cdn`, `static`, `assets`,
  `dashboard`, `login`, `signup`, `register`, `billing`, `support`, `help`,
  `docs`, `blog`, `status`, `health`, `cucu`, `platform`, `root`, `system`
- **Uniqueness**: Enforced at the database level (unique index on `slug`)

## REST Endpoints

The Tenants service exposes two REST endpoints in addition to its GraphQL API. These are used by infrastructure-level routing (not by client applications directly).

### `GET /tenants/resolve/:slug`

Resolves the configuration for a tenant by slug. Used by the gateway and other internal services to look up tenant metadata.

**Protected by:** `x-internal-resolve` header (must match `INTERNAL_HEADER_SECRET`)

**Response:**
```json
{
  "_id": "...",
  "slug": "acme-corp",
  "name": "Acme Corp",
  "status": "active",
  "plan": "professional",
  "primaryColor": "#3B82F6",
  "limits": {
    "maxUsers": 100,
    "maxProjects": 50,
    "maxStorageMb": 10240
  }
}
```

**Error responses:**
- `404` — Tenant not found or deleted
- `403` — Missing or invalid `x-internal-resolve` header

### `GET /tenants/check-slug/:slug`

Checks whether a slug is available for registration. This endpoint is **public** (no authentication required) and is intended for use during the tenant signup flow.

**Response:**
```json
{ "available": true }
```
or
```json
{ "available": false }
```

::: tip
This endpoint validates both slug format and blacklist in addition to checking uniqueness. If the slug fails format validation, `available: false` is returned (no error thrown).
:::

## GraphQL API

### Queries

#### findAllTenants

Returns a paginated list of all tenants. Requires platform-level admin access.

```graphql
query FindAllTenants(
  $pagination: PaginationInput
  $filter: TenantFilterInput
) {
  findAllTenants(pagination: $pagination, filter: $filter) {
    items {
      _id
      slug
      name
      status
      plan
      ownerEmail
      createdAt
    }
    totalCount
    hasNextPage
  }
}
```

**Filter options:**
```typescript
interface TenantFilterInput {
  status?: TenantStatus;
  plan?: TenantPlan;
  search?: string;   // Full-text search on slug and name
}
```

#### findOneTenant

```graphql
query FindOneTenant($slug: String!) {
  findOneTenant(slug: $slug) {
    _id
    slug
    name
    status
    plan
    ownerEmail
    primaryColor
    logoUrl
    limits {
      maxUsers
      maxProjects
      maxStorageMb
    }
    billing {
      customerId
      subscriptionId
    }
    trialEndsAt
    createdAt
    updatedAt
  }
}
```

### Mutations

#### createTenant

```graphql
mutation CreateTenant($input: CreateTenantInput!) {
  createTenant(input: $input) {
    _id
    slug
    name
    status
  }
}
```

**Input:**
```json
{
  "input": {
    "slug": "acme-corp",
    "name": "Acme Corp",
    "ownerEmail": "admin@acme-corp.com",
    "plan": "trial",
    "limits": {
      "maxUsers": 10,
      "maxProjects": 5,
      "maxStorageMb": 1024
    }
  }
}
```

**Notes:**
- `status` is automatically set to `provisioning` on creation
- Slug is validated (format + blacklist + uniqueness) before creation

#### updateTenant

```graphql
mutation UpdateTenant($input: UpdateTenantInput!) {
  updateTenant(input: $input) {
    _id
    slug
    name
    status
    plan
  }
}
```

**Input:**
```json
{
  "input": {
    "_id": "...",
    "name": "Acme Corporation",
    "status": "active",
    "plan": "professional"
  }
}
```

## Configuration

### Environment Variables

```ini
# Service Config
TENANTS_SERVICE_NAME=tenants
TENANTS_SERVICE_PORT=3002
TENANTS_DB_HOST=tenants-db
TENANTS_DB_PORT=9002

# MongoDB
MONGODB_URI=mongodb://tenants-db:27017/tenants

# No dependencies (core service)
TENANTS_DEPENDENCIES=[]

# Internal secret (for /resolve endpoint)
INTERNAL_HEADER_SECRET=<secret>

# Redis
REDIS_SERVICE_HOST=redis
REDIS_SERVICE_TLS_PORT=6380
```

### Database Indexes

```typescript
TenantSchema.index({ slug: 1 }, { unique: true });
TenantSchema.index({ status: 1 });
TenantSchema.index({ ownerEmail: 1 });
TenantSchema.index({ deletedAt: 1 });

TenantAdminSchema.index({ tenantSlug: 1 });
TenantAdminSchema.index({ email: 1, tenantId: 1 }, { unique: true });
```

## File Structure

```
apps/tenants/
├── src/
│   ├── main.ts
│   ├── tenants.module.ts
│   ├── tenants.controller.ts        # REST endpoints (resolve, check-slug)
│   ├── tenants.resolver.ts          # GraphQL queries/mutations
│   ├── tenants.service.ts           # Business logic
│   ├── tenants.context.ts           # Subgraph context
│   ├── schemas/
│   │   ├── tenant.schema.ts         # Mongoose schema
│   │   └── tenant-admin.schema.ts
│   ├── entities/
│   │   ├── tenant.entity.ts         # GraphQL types
│   │   └── tenant-admin.entity.ts
│   └── dto/
│       ├── create-tenant.input.ts
│       └── update-tenant.input.ts
├── Dockerfile
└── README.md
```

## Notes

::: info Provisioning not included
The Tenants service does **not** handle tenant provisioning (database creation, seeding, etc.). Provisioning logic will be added as a separate concern in a future iteration. Currently, tenants are created with `status: provisioning` and must be manually transitioned to `active`.
:::

## Next Steps

- [Tenant DB Package](/shared/tenant-db) - Multi-tenant database connection management
- [Port Assignments](/reference/ports) - Service and DB port reference
