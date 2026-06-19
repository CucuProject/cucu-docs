# Projects Service

Projects owns the Project operational record: project CRUD, status lifecycle, project templates, template phases/shares, Gantt read model, and initial owner-access creation.

## Runtime Role

- Owns `Project`, `ProjectTemplate`, `ProjectTemplatePhase`, and `ProjectTemplateShare`.
- Resolves `Project.milestones` through Milestone to Project.
- Emits `PROJECT_CREATED`, `PROJECT_UPDATED`, and `PROJECT_DELETED` to Milestone to Project.
- Calls `CREATE_OWNER_ACCESS` on ProjectAccess after project creation.
- Exposes `ganttProject`, but does not own milestone allocation or economics.

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

## Boundaries

Projects does not own milestones, resource allocation, rate/cost data, or the access graph. `createdBy` is provenance; ProjectAccess is the object visibility and role model.
