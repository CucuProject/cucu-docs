# Milestone to Resource Service

Milestone to Resource owns assignment and allocation between milestones and resources. A resource can represent a user, an AI agent, or a planned capacity slot.

## Runtime Role

- Owns `MilestoneToResource` and `ResourceDailyAllocation`.
- Supports concrete assignments and draft/planned capacity.
- Exposes assignment queries by milestone/resource and daily allocation views.
- Provides resource availability and aggregated allocation surfaces.
- Feeds implicit Project visibility checks through ProjectAccess.
- Freezes and clears project economic snapshots.
- Enforces allocation guards for archived projects, weekends, holidays, date windows, and user capacity where dependency data is available.

## GraphQL Surface

- `createMilestoneToResource`
- `findAllMilestoneToResource`
- `findMilestoneToResourcesByMilestoneId`
- `findMilestoneToResourcesByResourceId`
- `findMilestoneToResourceIdsByMilestones`
- `updateMilestoneToResource`
- `reorderMilestoneToResources`
- `removeMilestoneToResource`
- batch create/update/delete for user/resource and milestone contexts
- daily allocation and availability queries/mutations

## RPC and Events

Inbound events:

- `USER_CREATED`, `USER_UPDATED`, `USER_DELETED`, `USER_HARD_DELETED`
- `MILESTONE_CREATED`, `MILESTONE_UPDATED`, `MILESTONE_DELETED`
- `PERMISSIONS_CHANGED`

Inbound RPC:

- `FIND_MILESTONE_TO_RESOURCE_BY_USER_ID`
- `FIND_MILESTONE_TO_RESOURCE_BY_MILESTONE_ID`
- `CREATE_MILESTONE_TO_RESOURCE`
- `HAS_MTR_FOR_USER_IN_PROJECT`
- `GET_MILESTONE_IDS_BY_USER`
- `GET_MTR_DETAILS_BY_IDS`
- `GET_MTR_DETAILS_BY_MILESTONE_IDS`
- `GET_ALLOCATIONS_BY_MTR_IDS`
- `FREEZE_PROJECT_ECONOMIC_SNAPSHOTS`
- `CLEAR_PROJECT_ECONOMIC_SNAPSHOTS`
- `FREEZE_AI_AGENT_COST_SNAPSHOTS_FOR_PROJECT`
- resource-assignment compatibility aliases

Outbound RPC:

- `EXTEND_ACTIVE_MILESTONE_TO_PROJECT_END_DATE`

## Failure Modes

- Batch assignment update paths still use replace-style `deleteMany` plus insert for user and milestone contexts.
- Access filters use `GET_EXPLICIT_ACCESSIBLE_PROJECT_IDS`; if ProjectAccess/M2P lookup fails, reads fail closed to empty sets.
- Holiday checks can degrade open: failures resolving M2P, Project country, or Holidays calendars are caught and treated as no holidays.
- Capacity checks can degrade open: failure fetching Users capacity data returns an empty capacity map, which leaves the default per-user capacity guard ineffective for that batch.
- Economic snapshot freezing is blocking for active-project allocation writes. Missing rate/cost data produces `INCOMPLETE` snapshots; invalid resolver shape or missing project context throws and blocks the operation.
- Snapshot reads in Rates distinguish `LIVE`, `FROZEN`, and `PARTIAL`; incomplete snapshots still contribute zero for missing rate/cost amounts.

## Boundaries

This service does not own User, Resource, AI Agent, Rate/Cost, Project, or Milestone source data. Assignment can contribute to implicit Project visibility, but it does not replace ProjectAccess.
