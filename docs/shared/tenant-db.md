# Tenant DB Package

The `@cucu/tenant-db` package provides **multi-tenant database connection management** for Cucu services. It handles lazy connection pooling, idle cleanup, and per-request tenant resolution.

::: info Independence
`@cucu/tenant-db` does **not** depend on `@cucu/service-common`. Connection management is intentionally kept separate from the service utility layer.
:::

## Location

```
_shared/tenant-db/src/
├── tenant-connection.manager.ts
├── tenant-database.module.ts
├── with-tenant-id.util.ts
├── get-tenant-db-name.util.ts
└── index.ts
```

## Exports

| Export | Type | Description |
|--------|------|-------------|
| `TenantConnectionManager` | Class (singleton) | Manages the lazy connection pool |
| `TenantDatabaseModule` | NestJS Module | Dynamic module for per-service registration |
| `withTenantId` | Function | Mixin that adds a passive `tenantId` field to a document |
| `getTenantDbName` | Function | Returns the database name for a given service + slug |

---

## TenantConnectionManager

A **singleton** service that maintains a lazy pool of MongoDB connections — one per tenant slug per service. Connections are created on first access and automatically closed after 15 minutes of idle time.

```typescript
class TenantConnectionManager {
  /**
   * Returns a Mongoose connection for the given tenant slug.
   * Creates a new connection lazily if one doesn't exist.
   * Resets the idle timer on each call.
   */
  async getConnection(tenantSlug: string): Promise<Connection>;

  /**
   * Returns current pool statistics (for monitoring/debugging).
   */
  getStats(): TenantConnectionStats;
}

interface TenantConnectionStats {
  totalConnections: number;
  activeConnections: number;   // Used within the last idle timeout
  idleConnections: number;
  connectionsBySlug: Record<string, { lastUsed: Date; state: string }>;
}
```

### Connection Lifecycle

```
First request for slug "acme" →
  No connection found →
    Create new MongoDB connection →
      Cache in pool →
        Start idle timer (15 min)

Subsequent requests for slug "acme" →
  Connection found in pool →
    Reset idle timer →
      Return connection

15 min of inactivity →
  Idle cleanup job fires (every 5 min) →
    Close connection →
      Remove from pool
```

### Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| Idle timeout | 15 minutes | Connection closed after 15 min of no activity |
| Cleanup interval | 5 minutes | How often the cleanup job scans for idle connections |
| Pool strategy | Lazy | Connections created on first access, never pre-warmed |

---

## TenantDatabaseModule

A **dynamic NestJS module** that registers the correct database connection strategy for a service based on environment configuration.

```typescript
class TenantDatabaseModule {
  static forService(serviceName: string): DynamicModule;
}
```

### Usage

```typescript
// In your service module
@Module({
  imports: [
    TenantDatabaseModule.forService('users'),
  ],
})
export class UsersModule {}
```

### Behavior by TENANT_MODE

The module reads the `TENANT_MODE` environment variable to determine its strategy:

| `TENANT_MODE` | Behavior |
|---------------|----------|
| `single` | **Noop** — no tenant connection is registered. The service uses its own static MongoDB URI. Use for single-tenant or platform-level services. |
| `multi` | Registers `TENANT_CONNECTION` as a **request-scoped provider**. Each request gets the appropriate tenant connection based on the `x-tenant-slug` header. |

#### `TENANT_MODE=single` (noop)

```typescript
// No tenant injection happens. Service uses its own MONGODB_URI as usual.
// TenantDatabaseModule.forService('users') is effectively a no-op.
```

#### `TENANT_MODE=multi` (request-scoped connection)

```typescript
// The module provides:
// - TENANT_CONNECTION: Mongoose Connection (request-scoped)
//
// Inject in your repository/service:
@Injectable()
export class UsersRepository {
  constructor(
    @Inject(TENANT_CONNECTION) private readonly tenantConn: Connection,
  ) {}

  async findAll() {
    const UserModel = this.tenantConn.model('User', UserSchema);
    return UserModel.find();
  }
}
```

The `TENANT_CONNECTION` is resolved from the request context using the `x-tenant-slug` header (validated and set by the gateway).

---

## withTenantId

A **document mixin** that adds a passive `tenantId` field to a Mongoose schema. This is a defence-in-depth measure: even if the application layer correctly routes to the tenant's database, documents carry their own `tenantId` for auditing and cross-tenant leak detection.

```typescript
function withTenantId(doc: Document, slug: string): Document;
```

### Usage

```typescript
// When creating a document in a multi-tenant service:
const user = new UserModel(input);
withTenantId(user, tenantSlug);  // Sets user.tenantId = slug
await user.save();
```

### Schema Setup

To use `withTenantId`, add the field to your schema:

```typescript
const UserSchema = new Schema({
  // ... your fields ...
  tenantId: { type: String, index: true }, // Added by withTenantId mixin
});
```

::: info Passive field
`tenantId` is a passive denormalization field — it does not drive routing or access control decisions. The actual tenant isolation is achieved by connecting to the correct per-tenant database. `tenantId` exists as a safety net.
:::

---

## getTenantDbName

Returns the conventional database name for a given service and tenant slug.

```typescript
function getTenantDbName(service: string, slug: string): string;
```

### Naming Convention

```
{service}_{slug}
```

### Examples

```typescript
getTenantDbName('users', 'acme-corp')       // → "users_acme-corp"
getTenantDbName('projects', 'startup-inc')  // → "projects_startup-inc"
getTenantDbName('milestones', 'big-bank')   // → "milestones_big-bank"
```

This convention is used by `TenantConnectionManager` when constructing the MongoDB connection URI for a tenant.

---

## Full Integration Example

```typescript
// 1. Register the module in your service
@Module({
  imports: [
    TenantDatabaseModule.forService('projects'),
  ],
  providers: [ProjectsService, ProjectsRepository],
})
export class ProjectsModule {}

// 2. Inject the tenant connection in your repository
@Injectable()
export class ProjectsRepository {
  constructor(
    @Inject(TENANT_CONNECTION) private readonly conn: Connection,
  ) {}

  private get model() {
    return this.conn.model('Project', ProjectSchema);
  }

  async findAll(): Promise<Project[]> {
    return this.model.find().lean();
  }

  async create(input: CreateProjectInput, slug: string): Promise<Project> {
    const doc = new (this.model)(input);
    withTenantId(doc, slug);  // Add passive tenantId
    return doc.save();
  }
}

// 3. The tenant connection is resolved automatically per request
// based on the x-tenant-slug header set by the gateway.
```

---

## Environment Variables

```ini
# Controls the tenant mode for all services in a deployment
TENANT_MODE=single   # or "multi"
```

When `TENANT_MODE=multi`, each service also needs access to the platform MongoDB host to build per-tenant connection URIs (handled internally by `TenantConnectionManager`).

---

## Next Steps

- [Tenants Service](/services/tenants) - Platform DB and tenant registry
- [Service Common](/shared/service-common) - Gateway signature verification and permission utilities
