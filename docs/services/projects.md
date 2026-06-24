# Projects Service

Projects owns the Project operational record: project CRUD, status lifecycle, project templates, template phases/shares, Gantt read model, and initial owner-access creation.

## Runtime Role

- Owns `Project`, `ProjectTemplate`, `ProjectTemplatePhase`, and `ProjectTemplateShare`.
- Resolves `Project.milestones` through Milestone to Project.
- Emits `PROJECT_CREATED`, `PROJECT_UPDATED`, and `PROJECT_DELETED` to Milestone to Project using Redis events.
- Calls `CREATE_OWNER_ACCESS` on ProjectAccess after project creation; project creation is not rolled back if owner-access creation fails.
- Exposes `ganttProject`, but does not own milestone allocation or economics and tolerates partial enrichment failures.
- Freezes economic snapshots through Milestone to Resource when a project becomes active and clears them when moved back to draft; those status transitions fail if snapshot RPC fails.

## GraphQL Surface

- Project: `findAllProjects`, `findOneProject`, `ganttProject`, `createProject`, `updateProject`, `removeProject`.
- Templates: `findAllProjectTemplates`, `findOneProjectTemplate`, `createProjectTemplate`, `updateProjectTemplate`, `deleteProjectTemplate`, `shareProjectTemplate`, `unshareProjectTemplate`.
- Phases: `findPhasesByTemplate`, `createProjectTemplatePhase`, `updateProjectTemplatePhase`, `deleteProjectTemplatePhase`.

## RPC and Events

Inbound RPC:

- `PROJECT_EXISTS`
- `GET_PROJECT_DATES`
- `FIND_PROJECT_BY_NAME`
- `CREATE_PROJECT`
- `GET_PROJECT_CREATED_BY`
- `GET_PROJECT_IDS_BY_CREATOR`
- `UPDATE_PROJECT_CREATED_BY`
- `GET_PROJECTS_STATUS`
- `GET_PROJECTS_SUMMARY`
- template seed/create/find/delete patterns

Inbound events:

- `PERMISSIONS_CHANGED`

Outbound:

- `CREATE_OWNER_ACCESS`
- `PROJECT_CREATED`
- `PROJECT_UPDATED`
- `PROJECT_DELETED`

## Access Rules

Project visibility is object access, not grants membership. `findAllProjects`, `findOneProject`, update, and remove verify object access server-side. `ARCHIVED` projects block ordinary update/delete, except status-only reactivation.

## Failure Modes

- Project-to-milestone synchronization is event-driven. If a `PROJECT_CREATED`/`PROJECT_UPDATED`/`PROJECT_DELETED` event is missed, the Project record can diverge from Milestone to Project until reconciliation.
- Initial owner access is important but non-fatal in the current code: `CREATE_OWNER_ACCESS` errors are logged after the Project document already exists.
- `ganttProject` catches several downstream failures and returns partial empty slices for milestones, assignments, allocations, dependencies, resources, organization lookups, and economics instead of failing the whole read.
- Default currency falls back to `EUR`; currency conversion failures can leave original amounts unconverted in some project read-model helpers.

## Boundaries

Projects does not own milestones, resource allocation, rate/cost data, or the access graph. `createdBy` is provenance; ProjectAccess is the object visibility and role model.
