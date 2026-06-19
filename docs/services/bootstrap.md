# Bootstrap Service

Bootstrap is a one-shot application context for tenant provisioning and seed data. It is not a runtime subgraph.

## Runtime Role

- Reads `bootstrap-seed.yaml`.
- Seeds tenants, grants, lookup tables, users, project templates, rates/costs, and demo Roadmap/Project data.
- Calls other services through Redis RPC.
- Passes `_tenantSlug` for tenant-scoped operations.
- Runs as provisioning/seed orchestration, not as a domain service.

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
