# Milestone to Project Service

Milestone to Project owns the Project-Milestone join and the operative dates of a milestone inside a project context.

## Runtime Role

- Owns `MilestoneToProject`.
- Serves Project and Milestone federation references.
- Handles Project and Milestone lifecycle events.
- Provides bulk lookup for access filtering, date guards, and Gantt flows.
- Extends active project milestone end dates when resource allocation requires it.

## GraphQL Surface

- `findAllMilestoneToProject`
- `findMilestoneToProjectByProjectId`
- `findMilestoneToProjectByMilestoneId`
- `getMilestoneToProject`
- `createMilestoneToProject`
- `updateMilestoneToProject`
- `removeMilestoneToProject`
- project/milestone batch assignment mutations

## RPC and Events

Inbound RPC:

- `FIND_MILESTONE_TO_PROJECT_BY_PROJECT_ID`
- `FIND_MILESTONE_TO_PROJECT_BY_MILESTONE_ID`
- `FIND_MILESTONE_TO_PROJECT_BY_MILESTONE_IDS`
- `HAS_ACTIVE_PROJECT_FOR_MILESTONE`
- `HAS_ARCHIVED_PROJECT_FOR_MILESTONE`
- `GET_PROJECT_IDS_BY_MILESTONE_IDS`
- `GET_MILESTONE_IDS_BY_PROJECT_IDS`
- `EXTEND_ACTIVE_MILESTONE_TO_PROJECT_END_DATE`
- `CREATE_MILESTONE_TO_PROJECT`

Inbound events:

- `PROJECT_CREATED`
- `PROJECT_UPDATED`
- `PROJECT_DELETED`
- `MILESTONE_CREATED`
- `MILESTONE_UPDATED`
- `MILESTONE_DELETED`
- `PERMISSIONS_CHANGED`

## Access Rules

Milestone visibility inherits from Project visibility. Planned-date and archive guards pass through this service so Milestones does not couple directly to Projects.

## Boundaries

This service must remain a join service. It does not own allocation, cost, user/resource, or Project access.
