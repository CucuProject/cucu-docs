# Users Service

The Users service owns the tenant-scoped `User` entity: People data, employment information, organizational references, supervisor hierarchy, capacity periods, soft/hard delete lifecycle, and the legacy group mirror used by Auth.

It is also a synchronization point for Resources, GroupAssignments, MilestoneToResource, Auth, Rates, Organization, and ProjectAccess.

## Service Profile

| Property | Value |
|---|---|
| Runtime | NestJS subgraph + Redis RPC/events |
| Database | `users_{tenantSlug}` |
| Collection | `users` |
| App module | `apps/users/src/users.module.ts` |
| Context | `UsersContext` |

## Responsibilities

- GraphQL CRUD for users.
- People list filtering, pagination, sorting, and filter-count aggregation.
- Field-level view/edit grants with self/all scopes.
- Date and capacity-period validation.
- Supervisor/subordinate graph traversal.
- Soft delete, restore, and hard delete.
- Group mirror sync through `USER_GROUPS_CHANGED`.
- Event emission to `group-assignments`, `milestone-to-resource`, `resources`, and `auth`.
- RPC support for Auth, ProjectAccess, Rates, Organization, and Bootstrap.

## Functional Role

Users is the People profile and employment owner. It gives the rest of Cucu a tenant-scoped person/resource identity: who the user is, whether they are active, which organizational attributes they carry, which capacity periods apply, and how supervisor relationships affect access.

Primary actors:

- People admins creating, updating, deactivating, restoring, or deleting users.
- Users reading their own profile/session-visible fields.
- Auth loading group ids and password hashes for session/password flows.
- ProjectAccess resolving supervisor/subordinate access.
- Resources/Rates/MilestoneToResource consuming capacity and role/seniority context.

Key enabled flows:

- People list/filter management for operational staffing.
- User create/update sync to GroupAssignments and Resources.
- User deactivation revoking Auth sessions.
- Supervisor-chain and subordinate queries for ProjectAccess effective visibility.
- Rate context and basic user/capacity reads for planning and economics.

## Data Model

`User` is stored in `users` with nested subdocuments:

| Section | Purpose |
|---|---|
| `authData` | Name, surname, email, legacy password hash, and mirrored `groupIds`. |
| `personalData` | Birth data, citizenship, languages, creation date. |
| `employmentData` | Employment dates, cost, RAL, location. |
| `additionalFieldsData` | Job roles, seniority, role category, supervisors, company, active flag, billable flag, capacity. |

Indexes:

- `{ additionalFieldsData.supervisorIds: 1, deletedAt: 1 }`
- `{ authData.groupIds: 1, deletedAt: 1 }`
- `{ authData.email: 1, deletedAt: 1 }` unique

`authData.password` is deprecated. Platform `user_identities.passwordHash` in Tenants is the password source of truth.

## GraphQL API

| Type | Name | Args | Notes |
|---|---|---|---|
| Query | `findAllUsers` | `pagination?`, `filter?`, `sort?` | List or paginated People query. |
| Query | `getUserFilterCounts` | none | `$facet` aggregate for People filters. |
| Query | `findOneUser` | `userId`, `includeDeleted?` | Scope-capable by `userId`. |
| Query | `findDeletedUsers` | `filter?`, `sort?` | Soft-deleted users. |
| Mutation | `createUser` | `createUserInput` | Hashes password when present and emits downstream events. |
| Mutation | `updateUser` | `updateUserInput` | Enforces editable-field grants and lifecycle rules. |
| Mutation | `removeUser` | `userId` | Anti-self-delete, supervisor guard, soft delete. |
| Mutation | `restoreUser` | `userId` | Restores soft-deleted user. |
| Mutation | `hardDeleteUser` | `userId` | Permanently deletes an already soft-deleted user. |
| ResolveField | `User.subordinates` | parent | Users whose `supervisorIds` contain the parent user. |
| ResolveField | `User.milestones` | parent | Calls `FIND_MILESTONE_TO_RESOURCE_BY_USER_ID` and returns `MilestoneToResource` stubs. |
| ResolveField | `User.rates` | parent | Calls `rates.RESOLVE_RATE`. |
| ResolveField | `AdditionalFieldsData.seniorityLevel` | parent | Calls Organization bulk lookup. |
| ResolveField | `AdditionalFieldsData.jobRoles` | parent | Calls Organization bulk lookup. |
| ResolveField | `AdditionalFieldsData.company` | parent | Calls Organization bulk lookup. |
| ResolveField | `AdditionalFieldsData.supervisors` | parent | Resolves users by ids locally. |

## RPC API

| Pattern | Purpose |
|---|---|
| `USER_EXISTS` | Tenant-aware existence check. |
| `CREATE_USER` | Bootstrap-only user creation. |
| `FIND_USER_RATE_CONTEXT_BY_IDS` | Role/seniority context for Rates. |
| `FIND_USERS_BASIC_BY_IDS` | Basic user and capacity data for resource/Gantt lookups. |
| `FIND_USER_BY_EMAIL` | Lookup by email; `forAuth=true` is legacy. |
| `FIND_USER_WITH_PASSWORD` | Password hash + email for Auth password change. |
| `UPDATE_USER` | Bootstrap-only update; rejects calls with user context. |
| `UPDATE_USER_PASSWORD` | Sync a pre-hashed password from Auth. |
| `FIND_GROUPIDS_BY_USERID` | Reads live assignments from GroupAssignments. |
| `GET_ORG_ENTITY_USAGE_COUNT` | Referential usage counts for Organization. |
| `GET_SUPERVISOR_CHAIN` | Recursive upward supervisor chain. |
| `GET_ALL_SUBORDINATE_IDS` | Recursive downward subordinate graph. |
| `GET_USER_SUPERVISOR_IDS` | Direct supervisors only. |

## Events

Inbound:

| Pattern | Effect |
|---|---|
| `USER_DELETED` | No-op to avoid event loops. |
| `USER_GROUPS_CHANGED` | Re-read group assignments and sync `authData.groupIds`. |
| `PERMISSIONS_CHANGED` | Invalidate permission cache. |

Outbound:

| Pattern | Target | When |
|---|---|---|
| `USER_CREATED` | MilestoneToResource, GroupAssignments | After create. |
| `USER_UPDATED` | MilestoneToResource, GroupAssignments | When assignments/groups change. |
| `USER_DELETED` | MilestoneToResource, GroupAssignments | After soft delete. |
| `USER_HARD_DELETED` | MilestoneToResource, GroupAssignments | After hard delete. |
| `REVOKE_ALL_SESSIONS` | Auth | When a user is deactivated. |
| `RESOURCE_USER_UPSERT` | Resources | After create/update. |
| `RESOURCE_USER_DELETED` | Resources | After delete. |

## Core Business Rules

- Password fields are stripped from all user responses.
- Ordinary user updates cannot write `authData.password`.
- Internal RPC without user context may bypass field grants; user-context calls remain filtered.
- A deactivated user can only be reactivated before other updates are allowed.
- A user cannot be deactivated or deleted while still supervising other users.
- A user cannot delete themself through GraphQL.
- Capacity periods must be date-only, non-overlapping, max 24 entries, and use daily hours between 0 and 24.
- Supervisor traversal uses visited sets to avoid infinite loops.

## Failure Modes

- Duplicate active email fails through the unique email/deletedAt index.
- Updates that try to write `authData.password` through ordinary People flows are rejected; password change is Auth-owned.
- Deactivation/delete is blocked when the user supervises other users.
- Internal event emissions to downstream services are best effort in several paths; the local user mutation can complete while sync logs an error.
- `USER_GROUPS_CHANGED` re-reads GroupAssignments; if that lookup fails, `authData.groupIds` mirror can lag the source of truth.
- Deactivation emits `REVOKE_ALL_SESSIONS` to Auth fire-and-forget. Auth session validation does not re-read the Users active/deleted state, so a missed revoke event can leave active sessions until expiry or manual revocation.
- Password change writes the legacy `authData.password` mirror through Auth, but login uses Tenants `user_identities.passwordHash`; partial divergence is possible if the later Tenants sync fails.

## Example

```graphql
query User($id: String!) {
  findOneUser(userId: $id) {
    _id
    authData { name surname email }
    additionalFieldsData { active supervisorIds dailyCapacityHours }
  }
}
```

## Relevant Tests

- `apps/users/tests/users-controller.spec.ts`
- `apps/users/tests/users-service.spec.ts`
- `apps/users/tests/users-resolver.spec.ts`

## Notes and Risks

- Older docs referenced `milestone-to-user`/`MilestoneToUser`; the current code uses `milestone-to-resource` and `MilestoneToResource`.
- `User.subordinates` has a TODO for DataLoader batching.
- `authData.groupIds` is a mirror, not the source of truth.
- `authData.password` remains for compatibility and Auth password-change sync, but login verification is Universal Auth in Tenants.
- User deactivation/session revocation reliability is tracked in CUC-270..CUC-276.
- Auth group-cache invalidation and Users mirror consistency are tracked in CUC-277..CUC-284.
- Password-change atomicity/reconciliation is tracked in CUC-285..CUC-292.

## Source References

- `apps/users/src/users.module.ts`
- `apps/users/src/users.controller.ts`
- `apps/users/src/users.resolver.ts`
- `apps/users/src/users.service.ts`
- `apps/users/src/additional-fields.resolver.ts`
- `apps/users/src/user-rates.resolver.ts`
- `apps/users/src/schemas/user.schema.ts`
