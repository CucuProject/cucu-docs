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
- Before seeding, each Kubernetes run acquires a Redis `SET NX` lease for every selected tenant in deterministic order. The 31-minute lease outlives the 30-minute Job deadline; a competing run fails in stage `lock`, and release checks the owning run id before deleting a lease.

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
- Rates: inventory reads plus `CREATE_RATE` and `CREATE_COST` for missing entries.

## Boundaries

Bootstrap owns no runtime data. It should stay idempotent and explicit. Do not hide domain logic in bootstrap seeders.

The Rates seeder reads the existing matrix inventory once per tenant and creates only exact missing dimension/amount/currency/validity combinations. It fails closed when inventory cannot be read. Direct owner and project-user economics use exact lookups before create; project-user economics are limited to the current tenant's explicitly billable seed users, so fixtures from another tenant are never replayed.

## Kubernetes Operator Runbook

The executable Desktop procedure lives in `infra/kubernetes/images/DESKTOP.md` in `cucu-nest`; that file is authoritative for commands and overlay names. The contract is:

| Input | Required value |
|---|---|
| Runtime | Docker Desktop Kubernetes, context `docker-desktop` |
| Mode | `demo` |
| Tenant selection | Explicit unique subset of `acme`, `globex`, `initech` |
| Run identity | New DNS-safe `BOOTSTRAP_RUN_ID`, matching the immutable Job `runId` |

Before applying a Job, verify that the 19 applications and 20 datastore workloads are Ready and that no Bootstrap Job is active. Render the local, Bootstrap, and Desktop overlays with matching `runId`, `BOOTSTRAP_RUN_ID`, and `BOOTSTRAP_TENANTS`; require a successful server-side dry run before applying that exact render. A normal `cucu-apps` Helm upgrade does not run Bootstrap.

For every run, preserve the Job and generate both reports:

- `scripts/k8s-test-bootstrap-report.py` validates Job/image/run identity and emits a redacted per-step report with `ready`, `completed_with_warnings`, `incomplete`, or `failed` readiness;
- `scripts/k8s-test-bootstrap-database-report.py` records authoritative tenant database, collection, and document totals. On rerun, pass the prior report as the baseline and require `comparison.identical=true`.

A tenant is complete only when the Job succeeded, the step report is `ready` with zero warnings/errors, datastore totals are coherent, the authenticated user E2E passes, and the permanent workloads remain Ready. Tenant state `active` or process exit `0` alone is insufficient. The structured report currently records operation-authoritative `created`/`updated`/`skipped` outcomes for provisioning, users, lookup tables, project templates, roadmaps, and tenant default currency. The Roadmaps seeder counts roadmap, release, and release-project operations; an existing entity is `skipped`, a create is `created`, and missing required owner/project data fails the step closed instead of being reduced to a warning. The Projects owner reconciles each system template and phase, recreates missing phases, and returns the counts to Bootstrap; a missing or malformed count contract fails the step closed. Default-currency lookup/update failures also abort the step instead of being reduced to a warning; a first assignment reports `updated`, while an already configured tenant reports `skipped`. Unconverted steps remain explicit as `counts: null` with `countAuthority: unavailable`; CUC-251 remains open until every step has an authoritative contract and a runtime rerun proves it.

On failure, keep the Job, tenant record, and partial data. Repair the dependency or contract, then use a new run id. A `provisioning_failed` tenant may be retried only with the same owner. Never delete a tenant, Job, PVC, or lease to manufacture a clean result.

## Failure Modes

- Bootstrap is a one-shot application context and calls `process.exit(0|1)` after completion/failure.
- A top-level dependency or seeder failure aborts the process with exit code `1`; logs identify run id, stage, status, and error class without serializing the underlying error. Bootstrap emits one redacted schema-v1 record per tenant; the Desktop tooling consumes it while keeping legacy warning signals separate and persists a separate authoritative Mongo totals report. Only steps marked `countAuthority: operation` may expose mutation counts.
- Several seeder internals catch missing optional records and continue, so a successful process exit does not by itself prove every optional demo/enrichment artifact was created.
- Bootstrap must not become the only place where domain invariants live; runtime services still need to validate their own contracts.
- Docker Desktop runtime evidence covers preserved-failure recovery, deadline and owner-absent failures, warning-free ACME/Globex/Initech runs, and duplicate-free reruns. Initech v1/v2 keeps 16 tenant-owned databases, 36 collections, and 2,973 documents identical. Two simultaneous Initech Jobs produce exactly one successful run and one lock-stage failure before the seeder; the winner preserves the same database totals and the proof resources are removed. Explicit Jobs must retain the established `cucu-bootstrap` release identity so the NetworkPolicy selects them; a differently named release fails dependency readiness before seed. Orion is not a fixture on this branch, and the remaining unconverted per-step outcomes stay tracked by CUC-251/CUC-430.
