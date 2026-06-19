# Milestone to Resource Service

Milestone to Resource owns assignment and allocation between milestones and resources. A resource can represent a user, an AI agent, or a planned capacity slot.

## Runtime Role

- Owns `MilestoneToResource` and `ResourceDailyAllocation`.
- Supports concrete assignments and draft/planned capacity.
- Exposes assignment queries by milestone/resource and daily allocation views.
- Provides resource availability and aggregated allocation surfaces.
- Feeds implicit Project visibility checks through ProjectAccess.
- Freezes and clears project economic snapshots.

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

## Boundaries

This service does not own User, Resource, AI Agent, Rate/Cost, Project, or Milestone source data. Assignment can contribute to implicit Project visibility, but it does not replace ProjectAccess.
