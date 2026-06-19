# ProjectAccess Service

The ProjectAccess service owns Cucu's current Project object-access model. It persists explicit Project-to-User roles and resolves effective access by combining explicit records, supervisor hierarchy, milestone allocation, and SUPERADMIN membership.

This service answers "can this user see or act on this specific Project?" Operation and field permissions are handled separately by Grants.

## Service Profile

| Property | Value |
|---|---|
| Runtime | NestJS subgraph + Redis RPC/events |
| Database | `project_access_{tenantSlug}` |
| Collection | `projectaccesses` |
| App module | `apps/project-access/src/project-access.module.ts` |
| Main service | `apps/project-access/src/project-access.service.ts` |

## Responsibilities

- Persist explicit Project access records.
- Create owner access for new projects.
- Share projects with users.
- Transfer ownership.
- Revoke access.
- Resolve effective project access level.
- Return accessible project id sets to other services.
- Assert project action permissions by section/action.
- Filter GraphQL read results by the caller's accessible projects.

## Functional Role

ProjectAccess is the object-visibility layer for Projects. It determines which users can see or act on a specific Project after Grants has already decided whether the operation/field is generally allowed. It is intentionally narrower than the future generic sharing model: current code is Project/User only.

Primary actors:

- Project owners/collaborators sharing projects with users.
- Supervisors gaining implicit edit access to subordinate-owned projects.
- Assigned resources gaining viewer access through milestone allocation.
- SUPERADMIN users receiving unrestricted project access.
- Projects service creating owner access for new projects.
- Roadmaps/Milestones/Projects asking for accessible project id sets.

Key enabled flows:

- Owner access creation at project creation time.
- Share, transfer ownership, revoke access, and list project shares.
- Effective access checks for project sections/actions.
- Read filtering for project-access records and consumer project lists.
- Cycle-safe split between full access (`GET_ALL_ACCESSIBLE_PROJECT_IDS`) and explicit/no-MTR access (`GET_EXPLICIT_ACCESSIBLE_PROJECT_IDS`).

## Data Model

`projectaccesses` fields:

| Field | Purpose |
|---|---|
| `_id` | Federation key. |
| `projectId` | Project target. |
| `userId` | User subject. |
| `role` | `owner`, `collaborator`, `editor`, or `viewer`. |
| `tenantId` | Defense-in-depth metadata. |

Unique index:

```ts
{ projectId: 1, userId: 1 }
```

There is one explicit role per user per project.

## Effective Access Sources

The effective level is the highest role found:

| Source | Effective level |
|---|---|
| Explicit `projectaccesses` record | Stored role. |
| Supervisor chain of project creator/owner | `editor`. |
| User allocated to a milestone in the project | `viewer`. |
| SUPERADMIN group membership | `owner` / unrestricted. |

Priority:

```text
owner > collaborator > editor > viewer
```

## GraphQL API

| Type | Name | Args | Notes |
|---|---|---|---|
| Query | `findAllProjectAccess` | `pagination?`, `filter?`, `sort?` | Requires auth and applies readable project filter. |
| Query | `findProjectAccessByProjectId` | `projectId`, `pagination?`, `sort?` | Caller must view the project. |
| Query | `findProjectAccessByUserId` | `userId`, `pagination?`, `sort?` | Scope-capable by `userId`. |
| Query | `findOneProjectAccess` | `id` | Checks caller can read that record's project. |
| Query | `getProjectShares` | `projectId` | Caller must have project access. |
| Mutation | `createProjectAccess` | input | Caller must be allowed to share. |
| Mutation | `updateProjectAccess` | input | Caller must be allowed to share. |
| Mutation | `removeProjectAccess` | id | Caller must be allowed to share. |
| Mutation | `shareProject` | projectId, userId, role | Role cannot be owner. |
| Mutation | `transferOwnership` | projectId, newOwnerId | Supervisor of owner or SUPERADMIN only. |
| Mutation | `revokeAccess` | projectId, userId | Cannot revoke owner or self. |
| ResolveField | `project` | parent | Federated Project stub. |
| ResolveField | `user` | parent | Federated User stub. |

## RPC and Events

Inbound:

| Pattern | Kind | Purpose |
|---|---|---|
| `HAS_PROJECT_ACCESS` | Message | Explicit-record existence check. |
| `GET_ACCESSIBLE_PROJECT_IDS` | Message | Explicit project ids only. |
| `PROJECT_ACCESS_EXISTS` | Message | Record existence by id. |
| `CREATE_PROJECT_ACCESS` | Message | Bootstrap direct create. |
| `FIND_PROJECT_ACCESS_BY_PROJECT_AND_USER` | Message | Explicit record existence. |
| `PROJECT_OWNER_CREATED` | Event | Backward-compatible owner record creation. |
| `CREATE_OWNER_ACCESS` | Message | Synchronous owner record creation. |
| `GET_ALL_ACCESSIBLE_PROJECT_IDS` | Message | Explicit + supervisor + milestone allocation + SUPERADMIN. |
| `GET_EXPLICIT_ACCESSIBLE_PROJECT_IDS` | Message | Explicit + supervisor + SUPERADMIN, no milestone lookup. |
| `GET_PROJECT_ACCESS_LEVEL` | Message | Effective access level. |
| `ASSERT_PROJECTS_ACCESS` | Message | Batch section/action assertion. |
| `PERMISSIONS_CHANGED` | Event | Invalidate permission cache. |

Outbound dependencies:

- Projects: project status, existence, creator lookup, createdBy update, projects by creator.
- Users: user existence, group ids, supervisor chain, subordinates.
- Grants: SUPERADMIN group lookup.
- MilestoneToResource: user milestone ids and MTR-in-project checks.
- MilestoneToProject: project ids for milestone ids.

## Core Flows

### Access Level Resolution

`GET_PROJECT_ACCESS_LEVEL` checks:

1. explicit access record;
2. supervisor chain of the project creator;
3. MTR allocation in the project;
4. SUPERADMIN membership.

It returns the highest level found, or `null`.

`HAS_PROJECT_ACCESS` is intentionally narrower: it checks only direct explicit records. It does not include supervisor access, milestone allocation, SUPERADMIN, teams, hierarchies, or future indirect rules.

### Accessible Project Ids

`GET_ALL_ACCESSIBLE_PROJECT_IDS` includes all implemented sources and returns `{ projectIds, isUnrestricted }`.

`GET_EXPLICIT_ACCESSIBLE_PROJECT_IDS` intentionally excludes MilestoneToResource/MilestoneToProject calls so milestone services can use it without circular dependency.

### Share API

`shareProject`:

- rejects `owner` role;
- rejects archived projects;
- allows owner, collaborator, supervisor of owner, or SUPERADMIN;
- creates or updates the target user's record.

`transferOwnership`:

- allows supervisor of current owner or SUPERADMIN only;
- does not allow the owner to transfer by themself;
- downgrades current owner to collaborator;
- upserts the new owner;
- updates `projects.createdBy` best effort.

`revokeAccess`:

- rejects owner revocation;
- rejects self-revocation;
- requires share permission.

## Invariants

- Project access writes are blocked for archived projects.
- GraphQL reads require authentication unless the call is internal without user context.
- GraphQL list queries are filtered to projects readable by the caller.
- `ASSERT_PROJECTS_ACCESS` uses `canProjectRole(level, section, action)` from `@cucu/permission-rules`.
- `HAS_PROJECT_ACCESS` is explicit-record only; use `GET_PROJECT_ACCESS_LEVEL` for effective access.

## Failure Modes

- Archived projects block access-write mutations even if the caller could otherwise share.
- `HAS_PROJECT_ACCESS` may return false for a user who has effective supervisor/MTR/SUPERADMIN access; callers needing effective access must use `GET_PROJECT_ACCESS_LEVEL`.
- `UPDATE_PROJECT_CREATED_BY` during ownership transfer is best effort, so access records can change even when Projects creator metadata sync fails.
- SUPERADMIN checks fail closed for unrestricted access if Grants/Users lookup fails.
- `CREATE_OWNER_ACCESS` trusts the Projects-side event/RPC and does not verify project/user existence locally.
- Projects calls `CREATE_OWNER_ACCESS` after project creation and logs errors without rolling back the already-created project.

## Example

```json
{
  "projectId": "665...",
  "userId": "665..."
}
```

`GET_PROJECT_ACCESS_LEVEL` response:

```json
{ "level": "editor" }
```

## Relevant Tests

- `apps/project-access/tests/project-access-controller.spec.ts`
- `apps/project-access/tests/project-access-service.spec.ts`
- `apps/project-access/tests/share-api.spec.ts`

## Notes and Risks

- `createOwnerAccess` trusts the caller and does not verify project/user existence.
- `UPDATE_PROJECT_CREATED_BY` during transfer ownership is best effort; access records may already be changed if that RPC fails.
- The future generic access model with target/subject types is not implemented here; current code is Project/User only.
- Explicit-vs-effective access evolution is tracked in CUC-198..CUC-204.
- `UPDATE_PROJECT_CREATED_BY` reconciliation is tracked in CUC-205..CUC-211.
- Generic team/subject access is future work, not current ProjectAccess behavior.

## Source References

- `apps/project-access/src/project-access.module.ts`
- `apps/project-access/src/project-access.controller.ts`
- `apps/project-access/src/project-access.resolver.ts`
- `apps/project-access/src/project-access.service.ts`
- `apps/project-access/src/schemas/project-access.schema.ts`
- `apps/project-access/src/enums/project-access-role.enum.ts`
