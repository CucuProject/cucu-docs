# Bootstrap Service

Bootstrap is a one-shot application context for tenant provisioning and seed data. It is not a runtime subgraph.

## Runtime Role

- Reads `bootstrap-seed.yaml`.
- Seeds tenants, grants, lookup tables, users, project templates, rates/costs, and demo Roadmap/Project data.
- Calls other services through Redis RPC.
- Passes `_tenantSlug` for tenant-scoped operations.
- Runs as provisioning/seed orchestration, not as a domain service.
- Uses the legacy orchestrator readiness path outside Kubernetes.
- On the CUC-430 Kubernetes branch, reads Redis TLS/ACL, the legacy internal HMAC, and the dedicated RPC signing key from owner-scoped mounted files; file values are normalized before use and incomplete configuration fails closed.
- The Kubernetes path signs the allowlisted mutating RPCs, checks dependency markers with one bounded `MGET` per retry, and requires an immutable DNS-safe run id, `demo` mode, and an explicit unique subset of the built-in `acme`, `globex`, and `initech` fixtures.

## GraphQL and RPC Surface

- GraphQL: none.
- Inbound RPC: none.
- Inbound events: none.

## Outbound RPC

Bootstrap calls many services, including:

- Grants: `CREATE_GROUP`, `UPSERT_PERMISSION`, `UPSERT_OPERATION_PERMISSION`, `UPSERT_PAGE_PERMISSION`.
- Organization: `CREATE_SENIORITY_LEVEL`, `CREATE_JOB_ROLE`, `CREATE_COMPANY`, `CREATE_ROLE_CATEGORY`.
- Tenants: `UPSERT_USER_IDENTITY`.
- Users: `CREATE_USER`, `UPDATE_USER`.
- Group assignments: `CREATE_GROUP_ASSIGNMENT`.
- Projects: `SEED_PROJECT_TEMPLATES`, project template phase create/delete.
- Rates: `CREATE_RATE`, `CREATE_COST`.

## Boundaries

Bootstrap owns no runtime data. It should stay idempotent and explicit. Do not hide domain logic in bootstrap seeders.

## Failure Modes

- Bootstrap is a one-shot application context and calls `process.exit(0|1)` after completion/failure.
- A top-level dependency or seeder failure aborts the process with exit code `1`; logs identify run id, stage, status, and error class without serializing the underlying error. There is still no persisted per-step/per-tenant report.
- Several seeder internals catch missing optional records and continue, so a successful process exit does not by itself prove every optional demo/enrichment artifact was created.
- Bootstrap must not become the only place where domain invariants live; runtime services still need to validate their own contracts.
- Docker Desktop runtime evidence now covers recovery of the preserved failed ACME tenant, repeated ACME reruns with no document drift across the nine baseline tenant databases, and a fresh Globex first run. Structured per-step/per-tenant reporting, explicit Job deadline and owner-absent cases, and Orion remain tracked by CUC-430.
