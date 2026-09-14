# Commercial Service

Commercial owns Customer, Engagement/Commessa, Contract, ContractLine and ContractLineAllocation. Delivery entities remain owned by Projects/Roadmaps; costs remain owned by Rates. Federation composes entities, while tenant-aware RPC verifies owner-service targets.

## Delivery status

CUC-417 implementation on `jarvisbotpot/cuc-417-engagement-access`, targeting `release/commercial-core`. This page documents the feature-branch contract, not a deployment to main. Approved sharing policy: Vincenzo, #cucu, 2026-09-11. Runtime/gate outcome is recorded in the linked delivery ticket.

## Access model

- Engagement is private on creation: owner is the active tenant user from trusted context.
- Owner and explicit USER shares (VIEWER / EDITOR) live on the same tenant-local document; sharing, revocation and ownership transfer are atomic single-document writes.
- VIEWER reads; EDITOR reads/writes permitted fields; OWNER additionally controls sharing, transfer and archive.
- Share APIs cannot assign OWNER; dedicated transfer removes the new owner's redundant share. The former owner loses access unless subsequently shared explicitly.
- No implicit supervisor, milestone, customer, delivery or grants-group access. No SUPERADMIN object-access bypass.
- Contract -> Engagement; ContractLine -> Contract -> Engagement; Allocation -> ContractLine -> Contract -> Engagement. Moving a child requires edit access to both parents.
- Operation grants and view/edit field grants are separate requirements. Being owner never grants financial fields automatically.
- Customer catalog policy is unchanged; it never expands visibility to sibling engagements.

## Public GraphQL

Existing CRUD/list/reference operations remain under Commercial. Additional operations:

- `engagementSharing(engagementId)`: owner-only, field-filtered owner/share details.
- `shareEngagement(engagementId, userId, role)`: owner-only VIEWER/EDITOR upsert.
- `revokeEngagementShare(engagementId, userId)`: owner-only, idempotent removal.
- `transferEngagementOwnership(engagementId, newOwnerUserId)`: atomic transfer to active tenant user; retries of the last transfer are idempotent.

The actual handler's operation is checked independently for each GraphQL root and Federation reference; one allowed root cannot authorize a second denied operation. Sharing control commands require dedicated operation grants and owner access, but do not edit commercial business fields. Generic input cannot set owner/shares.

## RPC and identity boundary

User-context CREATE/UPDATE/GET/LIST RPC variants and commercialContext/commercialEconomics use the same object policy and operation/field grants. Missing user/tenant, inactive user or identity verification failure denies ordinary access; absence of userId is not a maintenance bypass.

Users remains identity owner: `CHECK_USER_AUTH_STATE` verifies active tenant users with a five-second timeout. Actor activity is checked once per request; ACL data is not cached across requests.

Explicit signed BOOTSTRAP-only maintenance ingress:

- `SEED_COMMERCIAL`: allowlisted seed operations, explicit ownerUserId. It is not a general arbitrary method executor.
- `REPORT_ENGAGEMENT_ACCESS`: read-only ID/owner inventory, cursor and maximum 100 per page.
- `RECOVER_ENGAGEMENT_OWNER`: explicit operator, reason, mapping and expected owner; refuses replacement of an active owner and uses compare-and-set. Repeating a successful mapping is idempotent.

These handlers require the service-common signed caller guard; unsigned legacy envelopes and user-context invocations are rejected. Generic RPC cannot set maintenance mode.

## Queries, filtering and economics

ACL predicates and parent joins execute in Mongo before result limits and before exposed counts/totals. Parent joins stay in the Commercial tenant database; no foreign-service collection is queried. IDs and page sizes are validated; deterministic sort includes _id. Source-target read models retain their existing bounded cardinality (50 Engagement rows, 200 funding rows). No per-row identity RPC is added.

Revocation is effective on the next request after commit; an already executing request is not retroactively rolled back. Operation self/all scope is isolated per asynchronous operation, including concurrent GraphQL roots. Detail fields support owner self scopes; mixed aggregate summaries conservatively require all-scope field grants unless the operation itself is self-scoped.

A delivery caller without commessa access receives no hidden commessa IDs, customer summaries, allocations or totals. Field restrictions are applied after object filtering. Funding remains ContractLineAllocation; secondary scopes remain CUC-414 and are not implemented here.

## Consistency, audit and legacy data

Shares are bounded to 1000 per engagement as a storage/payload safeguard. Indexed owner and membership predicates support access queries. Owner, shares and last-transfer retry metadata never appear in ordinary engagement responses.

Commercial emits access envelope-v1 events for creation, share/role change, revoke, transfer and recovery. Payload contains tenant, actor, target and minimal role/owner changes, not contract contents. Best-effort transport failures are warned, including observable errors; a committed ACL change is not rolled back because audit transport failed. Audit sink remains the central append-only owner; this change does not add durable audit retry/outbox.

Existing records have no trustworthy createdBy. Do not infer owners from customer or primary scope. Inventory and explicit mapping must precede activation on nonempty legacy data. Ownerless records fail closed; demo seeding refuses to silently adopt legacy engagements. Fresh demo owners come from `commercialOwnerEmail` (explicit `{tenant}` template in seed configuration).

Detailed intake/rollout: `apps/commercial/ACCESS-ROLLOUT.md`. No automatic migration or release-to-main is authorized by CUC-417.

## Evidence and source files

- `apps/commercial/src/engagement-access.service.ts`: tenant policy, queries, sharing, recovery.
- `apps/commercial/src/commercial-access-boundary.ts`: per-handler grants, field masking, operation-local scope.
- `apps/commercial/src/commercial.service.ts`: parent enforcement and permission-aware read models.
- `apps/commercial/src/commercial-maintenance.controller.ts`: signed maintenance entry points.
- `apps/commercial/tests/engagement-access.integration.spec.ts`: real isolated Mongo, tenant/role matrix and concurrency.
- `apps/commercial/tests/engagement-sharing.schema.spec.ts`: schema, actual GraphQL multi-root execution and unsigned maintenance denial.
- [CUC-417](https://linear.app/cucuproject/issue/CUC-417), [CUC-175](https://linear.app/cucuproject/issue/CUC-175), [CUC-414](https://linear.app/cucuproject/issue/CUC-414).

## Validation status — 2026-09-11

Canonical Docker startup is blocked by [CUC-418](https://linear.app/cucuproject/issue/CUC-418): floating Mongo image refuses Linux kernel 7.0.12-linuxkit (SERVER-121912), before Commercial can start. No live gateway/login/composition smoke is certified. Current code must be rebuilt and validated after that infrastructure fix.

Economics checks whether candidate funding remains outside the visible/bounded set without returning hidden IDs or counts. If visible funding is incomplete, the result is PARTIAL, visible amounts remain scoped, and full-target margins are null. Fully inaccessible funding does not produce an EXISTS_RESTRICTED placeholder. This also avoids declaring complete totals when existing read-model limits truncate funding.

Production advisory audit equals the exact release baseline (12 affected packages: 11 high, 1 moderate). New test dependencies are dev-only; remediation/audit visibility remains CUC-392/393 and rollout CUC-415. No main/release merge or legacy-data migration is claimed.
