# Organization Service

Organization owns professional lookup data used by users, allocation, rates, and reporting.

## Runtime Role

- Owns `Company`, `RoleCategory`, `JobRole`, and `SeniorityLevel`.
- Exposes CRUD GraphQL for each lookup.
- Resolves federation references.
- Provides usage counts and usage breakdowns where implemented.
- Provides RPC lookup/create endpoints for bootstrap and other services.

## GraphQL Surface

Each entity has list/detail/create/update/delete operations:

- Companies
- Role categories
- Job roles
- Seniority levels

## RPC and Events

Inbound RPC:

- `JOB_ROLE_EXISTS`
- `FIND_JOB_ROLES_BY_IDS`
- `FIND_SENIORITY_LEVELS_BY_IDS`
- `FIND_COMPANIES_BY_IDS`
- `FIND_ROLE_CATEGORIES_BY_IDS`
- `CREATE_SENIORITY_LEVEL`
- `FIND_SENIORITY_LEVEL_BY_NAME`
- `CREATE_JOB_ROLE`
- `FIND_JOB_ROLE_BY_NAME`
- `CREATE_COMPANY`
- `FIND_COMPANY_BY_NAME`
- `CREATE_ROLE_CATEGORY`
- `FIND_ROLE_CATEGORY_BY_NAME`

Inbound events:

- `PERMISSIONS_CHANGED`

## Failure Modes

- Usage-count resolver fields catch Users RPC failures and return `0`; this is a display fallback, not proof that an entity is unused.
- Delete guards for Company, JobRole, and SeniorityLevel call Users usage-count RPC without swallowing errors. If Users is unavailable, deletion fails rather than risking orphaned references.
- RoleCategory delete currently only soft-deletes the role category; it does not perform the same Users-backed guard because role usage is through JobRole.
- JobRole usage breakdown combines Users usage and SeniorityLevel references; RPC failure returns a zero breakdown.

## Boundaries

Organization does not own employment history, team membership, org chart, rates, costs, or object access. RoleCategory and JobRole are not a substitute for teams.
