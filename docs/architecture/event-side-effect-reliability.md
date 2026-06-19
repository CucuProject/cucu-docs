# Event and Side-Effect Reliability

Cucu uses Redis RPC for both request-response calls and fire-and-forget events. The codebase currently mixes blocking state changes, event-driven projections, derived catalogs, cache invalidation, and best-effort enrichment. This page defines the reliability contract that must be explicit when services evolve.

## Reliability Classes

### Blocking RPC

Use request-response RPC when the caller cannot safely commit local state without the downstream result.

Current examples:

- Gateway authentication flows calling Auth/Tenants/Grants.
- Project activation freezing economic snapshots through Milestone to Resource.
- ProjectAccess effective access assertions before object mutations.
- Roadmaps checking Project existence and ProjectAccess before adding release commitments.

Failure policy: fail the mutation/read that depends on the result, unless the caller explicitly documents a safe fallback.

### Best-Effort Side Effect

Use events only when the local write can succeed independently and the target state can be repaired later.

Current examples:

- `PROJECT_CREATED`, `PROJECT_UPDATED`, `PROJECT_DELETED` from Projects to Milestone to Project.
- `MILESTONE_CREATED`, `MILESTONE_UPDATED`, `MILESTONE_DELETED` from Milestones to Milestone to Resource.
- `RESOURCE_USER_UPSERT` and `RESOURCE_AI_AGENT_UPSERT` into Resources.
- `REVOKE_ALL_SESSIONS` from Users to Auth.
- `AUDIT_EVENT` into Audit.

Failure policy: event loss or consumer failure must be observable and reconcilable. If no reconciliation exists, the producing service doc must say so.

### Derived Read Model

Use derived records or snapshots when a service needs a query-optimized view of another service's data.

Current examples:

- `resources` catalog derived from Users and AI Agents.
- `users.authData.groupIds` mirror derived from GroupAssignments.
- `MilestoneToProject` join rows derived from Project/Milestone lifecycle events and direct create paths.
- Economic snapshot fields on ResourceDailyAllocation.

Failure policy: the owner of the derived read model must expose either deterministic rebuild/backfill, drift detection, or documented manual repair.

### Cache Invalidation

Use invalidation events only for cached data that has a safe TTL or request lifecycle fallback.

Current examples:

- `PERMISSIONS_CHANGED` invalidating permission caches across subgraphs.
- Auth group-id cache keyed by `groups:{tenantSlug}:{userId}`.

Failure policy: consumers must define whether stale data is security-sensitive, UX-only, or economically sensitive. Security-sensitive cache must fail closed or have explicit short TTL/replay.

## Current Risk Map

| Area | Current behavior | Required hardening direction |
|---|---|---|
| Delivery side effects | Project/Milestone lifecycle events update M2P/MTR projections. | Reconciliation jobs, drift reports, event coverage tests. |
| Group membership | GroupAssignments is source of truth; Users/Auth cache mirrors can lag. | Deterministic diff update, cache invalidation contract, reconciliation. |
| Resource catalog | Users/AI Agents feed Resources by events. | Backfill from source owners and stale-resource detection. |
| Session revocation | Users deactivation emits `REVOKE_ALL_SESSIONS`. | Reliable delivery or Auth validation against active/deleted user state. |
| Permission cache | Grants emits `PERMISSIONS_CHANGED`. | Producer coverage inventory, consumer invalidation tests, replay/manual invalidation. |
| Economics snapshots | Active-project allocation writes freeze rate/cost snapshots. | Incomplete snapshot observability and repair/re-freeze workflow. |
| Audit | Audit persistence failures are swallowed by design. | Audit health/lag/loss monitoring and critical-event producer checks. |
| Bootstrap | One-shot seeders may continue through optional records. | Structured run report with required/optional result classification. |

## Documentation Rule

Every service page that documents an outbound event or best-effort RPC must state:

- source of truth;
- derived target state;
- whether the side effect blocks the local mutation;
- consumer failure behavior;
- reconciliation/backfill owner;
- relevant Linear tickets or implementation track.

## Linear Implementation Track

The current cross-service hardening backlog is tracked by:

- `CUC-308`: define the cross-service event and side-effect reliability contract.
- `CUC-309`: inventory side effects and classify reliability class per service.
- `CUC-310`: define blocking RPC vs async event decision rules.
- `CUC-311`: require idempotent event consumers and duplicate-event handling.
- `CUC-312`: define reconciliation and backfill ownership for derived read models.
- `CUC-313`: add drift detection for event-fed projections.
- `CUC-314`: instrument side-effect failures and audit/event loss visibility.
- `CUC-315`: add regression tests for producer and consumer failure modes.
- `CUC-316`: update service docs and runbooks after implementation.

Service-specific hardening remains tracked by the local tickets already attached to GroupAssignments, Delivery side effects, Resources catalog sync, Auth revocation/group cache, Grants permission cache, and related service docs. This architecture track exists to prevent those fixes from becoming isolated local patches without a shared reliability rule.

## Engineering Rule

When adding a new side effect:

1. Prefer blocking RPC if local state would be invalid without the downstream result.
2. If using an event, add idempotent consumer behavior.
3. Add a deterministic reconciliation path before treating the event as production-critical.
4. Add tests for duplicate event, missed event repair, and consumer failure.
5. Document the contract in the owning service page and this map when it is cross-cutting.

## Related Service Pages

- [Projects](/services/projects)
- [Milestones](/services/milestones)
- [Milestone to Project](/services/milestone-to-project)
- [Milestone to Resource](/services/milestone-to-resource)
- [Users](/services/users)
- [GroupAssignments](/services/group-assignments)
- [Resources](/services/resources)
- [AI Agents](/services/ai-agents)
- [Rates](/services/rates)
- [Audit](/services/audit)
- [Bootstrap](/services/bootstrap)
