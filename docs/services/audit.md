# Audit Service

Audit is a central event-only sink for audit events.

## Runtime Role

- Consumes only `AUDIT_EVENT`.
- Persists audit event documents into a central database.
- Stores `tenantSlug` as event metadata.
- Does not expose GraphQL.
- Does not expose RPC queries.

## Event Contract

Inbound events:

- `AUDIT_EVENT`

The payload contains event type, severity, optional user/session/tenant/ip/email metadata, and event-specific metadata.

## Boundaries

Audit is not tenant-db routed. `tenantSlug` is a field for correlation, not database selection. Producer failures and audit sink failures must remain decoupled: audit persistence should not break business flows.

## Failure Modes

- `AuditService.logEvent()` catches persistence errors, logs them, and does not throw. Audit loss is possible if the central audit database is unavailable.
- Audit exposes no query/read API in the reviewed code; retention, export, search, and operational reporting are outside the current service surface.
- Producers remain responsible for emitting meaningful `type`, `severity`, actor, tenant, and metadata fields.
