# Milestones Service

Milestones owns milestone base data, notes, status, lock state, and dependency graph. Planned dates live here; project-specific operative dates live in Milestone to Project.

## Runtime Role

- Owns `Milestone`, `MilestoneDependency`, and `MilestoneNote`.
- Resolves `Milestone.projects` through Milestone to Project.
- Resolves `Milestone.resources` through Milestone to Resource.
- Calls Milestone to Project when project assignment ids are present in milestone payloads.
- Emits milestone lifecycle events to Milestone to Resource for assignment synchronization.
- Uses ProjectAccess through Milestone to Project for object visibility and mutation checks.

## GraphQL Surface

- Milestones: `findAllMilestones`, `findOneMilestone`, `createMilestone`, `createMilestones`, `updateMilestone`, `removeMilestone`, `updateMilestoneStatus`.
- Notes: `findMilestoneNotesByMilestone`, `createMilestoneNote`, `updateMilestoneNote`, `removeMilestoneNote`.
- Dependencies: query by project/milestone, create, remove.

## RPC and Events

Inbound RPC:

- `MILESTONE_EXISTS`
- `FIND_MILESTONE_BY_NAME`
- `FIND_MILESTONES_BY_IDS`
- `GET_MILESTONE_DATES`
- `CREATE_MILESTONE`
- `UPDATE_MILESTONE`
- `UPDATE_MILESTONE_STATUS`
- `DELETE_MILESTONE`
- `FIND_DEPENDENCIES_BY_MILESTONE_IDS`

Outbound:

- `CREATE_MILESTONE_TO_PROJECT`
- `MILESTONE_CREATED`
- `MILESTONE_UPDATED`
- `MILESTONE_DELETED`

Inbound events:

- `PERMISSIONS_CHANGED`

## Access Rules

Milestones must not be visible in isolation. Visibility is inherited through accessible Projects via Milestone to Project. Planned date changes are blocked when any linked project is `ACTIVE` or `ARCHIVED`. Locked milestones block ordinary update/delete except lock toggle.

## Failure Modes

- Single milestone create first creates the milestone, then creates project links through `CREATE_MILESTONE_TO_PROJECT`; if link creation fails, the current code rolls back the milestone create in that path.
- Bulk milestone create inserts all milestones first, then creates project links; if link creation fails, it deletes the inserted milestones by id. Downstream side effects still need to be considered when adding new consumers.
- `MILESTONE_CREATED`, `MILESTONE_UPDATED`, and `MILESTONE_DELETED` are emitted to Milestone to Resource best effort; emit failures are logged and do not roll back the local milestone mutation.
- Read enrichment for `Milestone.projects` and `Milestone.resources` can return empty arrays when downstream RPCs fail.

## Boundary Note

The old `MilestoneToResource` naming is obsolete. Current runtime uses Milestone to Resource for user/resource/AI allocation.
