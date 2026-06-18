# GroupAssignments Service

The GroupAssignments service owns the tenant-scoped many-to-many relationship between Users and Groups. It is the source of truth for group membership. `users.authData.groupIds` is a synchronized mirror, not the authoritative state.

## Service Profile

| Property | Value |
|---|---|
| Runtime | NestJS subgraph + Redis RPC/events |
| Database | `group_assignments_{tenantSlug}` |
| Collection | `groupassignments` |
| App module | `apps/group-assignments/src/group-assignments.module.ts` |
| Main service | `apps/group-assignments/src/group-assignments.service.ts` |

## Responsibilities

- Persist `userId` to `groupId` assignments.
- Handle user and group lifecycle synchronization events.
- Verify users and groups for non-internal calls.
- Emit `USER_GROUPS_CHANGED` to Users after assignment changes.
- Extend the federated `Group` entity with `usageCount`.
- Apply operation and field-level permission checks on GraphQL operations.

## Data Model

`groupassignments` fields:

| Field | Purpose |
|---|---|
| `_id` | Federation key. |
| `userId` | User reference. |
| `groupId` | Group reference. |
| `tenantId` | Defense-in-depth metadata. |

Unique index:

```ts
{ userId: 1, groupId: 1 }
```

Duplicate inserts are tolerated in bulk paths by ignoring duplicate key errors.

## GraphQL API

| Type | Name | Args | Notes |
|---|---|---|---|
| Query | `findAllGroupAssignments` | `pagination?`, `filter?`, `sort?` | List or paginated assignments. |
| Query | `findGroupAssignmentsByUserId` | `userId`, `pagination?`, `sort?` | Scope-capable by `userId`. |
| Query | `findGroupAssignmentsByGroupId` | `groupId`, `pagination?`, `sort?` | Assignments for one group. |
| Query | `getGroupAssignment` | `id` | Single assignment. |
| Mutation | `createGroupAssignment` | input | Create one relation. |
| Mutation | `updateGroupAssignment` | input | Update one relation. |
| Mutation | `removeGroupAssignment` | id | Delete one relation. |
| Mutation | `createGroupAssignmentsForUser` | userId, groupIds | Append user assignments. |
| Mutation | `createAssignmentsForGroup` | groupId, userIds | Append group assignments. |
| Mutation | `updateGroupAssignmentsForUser` | userId, groupIds | Replace all user assignments. |
| Mutation | `updateAssignmentsForGroup` | groupId, userIds | Replace all group assignments. |
| Mutation | `deleteGroupAssignmentsForUser` | userId | Delete all user assignments. |
| Mutation | `deleteAssignmentsForGroup` | groupId | Delete all group assignments. |
| ResolveField | `GroupAssignment.user` | parent | Federated `User` stub. |
| ResolveField | `GroupAssignment.group` | parent | Federated `Group` stub. |
| ResolveField | `Group.usageCount` | parent group | Counts assignment rows for the group. |

## RPC and Events

Inbound:

| Pattern | Kind | Purpose |
|---|---|---|
| `USER_CREATED` | Event | Create assignments from the user's group ids. |
| `USER_UPDATED` | Event | Replace assignments for the user. |
| `USER_DELETED` | Event | Delete assignments for the user. |
| `USER_HARD_DELETED` | Event | Delete assignments for the user. |
| `GROUP_CREATED` | Message | Create assignments for group users. |
| `GROUP_UPDATED` | Message | Replace assignments for the group. |
| `GROUP_DELETED` | Message | Delete all group assignments. |
| `FIND_GROUP_ASSIGNMENTS_BY_USER_ID` | Message | Return assignments for a user. |
| `FIND_GROUP_ASSIGNMENTS_BY_GROUP_ID` | Message | Return assignments for a group. |
| `CREATE_GROUP_ASSIGNMENT` | Message | Bootstrap single assignment creation. |
| `PERMISSIONS_CHANGED` | Event | Invalidate local permission cache. |

Outbound:

| Pattern | Target | When |
|---|---|---|
| `USER_GROUPS_CHANGED` | Users | After create, update, delete, bulk replace, or batch changes. |

## Core Behavior

- `create()` verifies `USER_EXISTS` and `GROUP_EXISTS` unless the call is internal/provisioning.
- Duplicate create returns the existing assignment.
- `updateGroupAssignmentsForUser()` deletes all current user assignments, then inserts the requested list.
- `updateAssignmentsForGroup()` deletes all current group assignments, inserts the requested list, and notifies both old and new affected users.
- `insertManyIgnoringDuplicates()` uses unordered inserts and treats duplicate key errors as non-fatal.

## Invariants

- `(userId, groupId)` is unique.
- GraphQL reads and writes pass through operation and field permissions.
- `findGroupAssignmentsByUserId` supports self-scoped permissions.
- User/group existence checks are skipped only for internal provisioning/bootstrap style calls.
- Users is notified after every assignment mutation so its group mirror can stay current.

## Example

```json
{
  "userId": "665..."
}
```

`FIND_GROUP_ASSIGNMENTS_BY_USER_ID` response:

```json
[
  { "_id": "665...", "userId": "665...", "groupId": "665..." }
]
```

## Relevant Tests

- `apps/group-assignments/tests/group-assignments-controller.spec.ts`
- `apps/group-assignments/tests/group-assignments-service.spec.ts`

## Notes and Risks

- The batch update implementation is replace-style delete plus insert, not diff-based.
- `findById` can return `null`; GraphQL callers should treat missing records carefully.
- `Group.usageCount` is computed live with `countDocuments`.

## Source References

- `apps/group-assignments/src/group-assignments.module.ts`
- `apps/group-assignments/src/group-assignments.controller.ts`
- `apps/group-assignments/src/group-assignments.resolver.ts`
- `apps/group-assignments/src/group.resolver.ts`
- `apps/group-assignments/src/group-assignments.service.ts`
- `apps/group-assignments/src/schemas/group-assignment.schema.ts`
