# Audit Service

The Audit service is a **centralized audit trail** for security and operational events across the platform. It persists structured events to a dedicated MongoDB database, enabling security monitoring, incident investigation, and compliance tracking.

## Overview

| Property | Value |
|----------|-------|
| Port | 3015 |
| Database | `audit-db:9015` (centralized, not per-tenant) |
| Collection | `audit_events` |
| Module | `AuditModule` |
| Type | Pure microservice (NOT a GraphQL subgraph) |
| Transport | Redis (event consumer only) |

::: warning NOT a GraphQL Subgraph
The Audit service is a **pure event consumer**. It does not expose a GraphQL schema, does not participate in Apollo Federation, and does not handle any RPC `MessagePattern`. It only listens for `EventPattern('AUDIT_EVENT')` via Redis.

The `@nestjs/graphql` dependency in `package.json` exists solely as a transitive dependency of `@cucu/service-common`'s barrel export.
:::

## Architecture

### Module Structure

```
AuditModule
├── ConfigModule (global)
├── MongooseModule (AUDIT_MONGO_URI — centralized DB)
└── MongooseModule.forFeature([AuditEvent])

Controller: AuditController (event handler)
Provider: AuditService (persistence)
```

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Centralized DB** (not per-tenant) | `tenantSlug` is stored as a field, not a separate database. This enables cross-tenant correlation for security monitoring (e.g., detecting credential stuffing across tenants) |
| **Fire-and-forget** | Producers `emit()` audit events — no response expected, no blocking |
| **Never crashes** | `try/catch` around all persistence — audit failures are logged but never propagate to the caller |
| **No RPC patterns** | Only `EventPattern` — the service is a pure sink, not queryable via RPC |

## Event Pattern

### `AUDIT_EVENT`

The single event pattern consumed by the service:

```typescript
@EventPattern('AUDIT_EVENT')
async handleAuditEvent(@Payload() payload: AuditEventPayload): Promise<void> {
  await this.auditService.logEvent(payload);
}
```

### Payload Interface

```typescript
interface AuditEventPayload {
  type: string;                              // Event type (e.g., TOKEN_REUSE_DETECTED)
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  userId?: string;                           // User involved
  sessionId?: string;                        // Session involved
  tenantSlug?: string;                       // Tenant context
  ip?: string;                               // Client IP address
  email?: string;                            // User email (for login events)
  metadata?: Record<string, any>;            // Event-specific details
}
```

### Severity Levels

| Severity | Usage | Examples |
|----------|-------|---------|
| `critical` | Active attack detected | `TOKEN_REUSE_DETECTED` (possible token theft) |
| `high` | Suspicious activity | `DEVICE_FINGERPRINT_MISMATCH` |
| `medium` | Failed security operations | `LOGIN_FAILED` |
| `low` | Informational security events | `IP_CHANGED_ON_REFRESH` |
| `info` | Normal operations worth tracking | `LOGIN_SUCCESS`, `SESSION_IDLE_REVOKED`, `SESSION_MAX_AGE_REVOKED` |

## MongoDB Schema

```typescript
@Schema({ collection: 'audit_events' })
class AuditEvent {
  @Prop({ required: true, index: true })
  type: string;

  @Prop({ required: true, enum: ['critical', 'high', 'medium', 'low', 'info'], index: true })
  severity: string;

  @Prop({ index: true })
  userId?: string;

  @Prop({ index: true })
  sessionId?: string;

  @Prop({ index: true })
  tenantSlug?: string;

  @Prop()
  ip?: string;

  @Prop()
  email?: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop({ default: () => new Date(), index: true })
  timestamp: Date;
}
```

### Indexes

| Fields | Type | Purpose |
|--------|------|---------|
| `type` | Single | Filter by event type |
| `severity` | Single | Filter by severity level |
| `userId` | Single | Lookup events for a user |
| `sessionId` | Single | Correlate events to a session |
| `tenantSlug` | Single | Per-tenant filtering |
| `timestamp` | Single + TTL | Time-range queries + auto-cleanup |

### TTL Index

Events are automatically deleted after **90 days** via a MongoDB TTL index:

```typescript
AuditEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
```

## Current Producers

### Auth Service — `session.service.ts`

| Event Type | Severity | Trigger |
|------------|----------|---------|
| `LOGIN_SUCCESS` | `info` | Successful authentication |
| `LOGIN_FAILED` | `medium` | Invalid password attempt |

### Auth Service — `token.service.ts`

| Event Type | Severity | Trigger |
|------------|----------|---------|
| `TOKEN_REUSE_DETECTED` | `critical` | Refresh token reuse (possible token theft — session revoked) |
| `DEVICE_FINGERPRINT_MISMATCH` | `high` | Refresh from different device than session originator |
| `IP_CHANGED_ON_REFRESH` | `low` | Client IP changed between refreshes |
| `SESSION_IDLE_REVOKED` | `info` | Session revoked due to idle timeout |
| `SESSION_MAX_AGE_REVOKED` | `info` | Session revoked due to max age limit |

### All Services (PR #351)

All services now have the `AUDIT_SERVICE` client wired in their modules via `TenantAwareClientsModule`, enabling any service to emit audit events:

- gateway, auth, users, grants, group-assignments, projects, milestones, milestone-to-user, milestone-to-project, project-access, organization, holidays, tenants, bootstrap

Currently, only the Auth service actively emits events. Other services have the wiring in place for future use.

## Error Handling

The service is designed to **never crash on audit failure**. All persistence operations are wrapped in try/catch:

```typescript
async logEvent(payload: AuditEventPayload): Promise<void> {
  try {
    await this.auditModel.create({
      ...payload,
      timestamp: new Date(),
    });
    this.logger.debug(`Audit event logged: ${payload.type} severity=${payload.severity}`);
  } catch (error) {
    // Never let audit failures crash the system
    this.logger.error(`Failed to log audit event: ${error?.message}`, error?.stack);
  }
}
```

On the producer side, events are emitted via `emit()` (fire-and-forget) — the producer never awaits a response and never catches failures from the transport layer.

## Dependencies

| Dependency | Purpose |
|------------|---------|
| **Redis** | Transport layer — receives `AUDIT_EVENT` via Redis pub/sub |
| **MongoDB** | Storage — dedicated `audit-db` container |
| **@cucu/service-common** | `buildRedisTlsOptions()` for Redis mTLS configuration |

## Tests

The audit service currently has **6 tests** across 2 spec files:
- `audit.service.spec.ts` — persistence logic
- `audit.controller.spec.ts` — event handling
