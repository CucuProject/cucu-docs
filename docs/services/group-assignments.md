# GroupAssignments Service

The GroupAssignments service manages the **N:N relationship between users and groups**. It serves as the source of truth for which users belong to which permission groups.

## Overview

| Property | Value |
|----------|-------|
| Port | 3007 |
| Database | `group-assignments_{tenantSlug}` |
| Collection | `groupassignments` |
| Module | `GroupAssignmentsModule` |
| Context | `GaContext` (request-scoped) |

## Schema

```typescript
@Directive('@key(fields: "_id")')
@Schema({ timestamps: true, versionKey: false })
class GroupAssignment {
  _id: string
  userId: ObjectId             // required, ref: 'User'
  groupId: ObjectId            // required, ref: 'Group'
  tenantId?: string
}

// Unique index: { userId, groupId } — prevents duplicate assignments
```

## GraphQL Schema

### Queries

| Query | Args | Return | Description |
|-------|------|--------|-------------|
| `findAllGroupAssignments` | `pagination?, filter?, sort?` | `PaginatedGroupAssignments!` | All assignments |
| `findGroupAssignmentsByUserId` | `userId: ID!, pagination?, sort?` | `PaginatedGroupAssignments!` | By user. `@ScopeCapable('userId')` |
| `findGroupAssignmentsByGroupId` | `groupId: ID!, pagination?, sort?` | `PaginatedGroupAssignments!` | By group |
| `getGroupAssignment` | `id: ID!` | `GroupAssignment!` | Single record |

### Mutations — Single

| Mutation | Args | Return |
|----------|------|--------|
| `createGroupAssignment` | `input` | `GroupAssignment!` |
| `updateGroupAssignment` | `input` | `GroupAssignment!` |
| `removeGroupAssignment` | `id: ID!` | `GroupAssignment!` |

### Mutations — Batch

| Mutation | Args | Return | Description |
|----------|------|--------|-------------|
| `createGroupAssignmentsForUser` | `userId, groupIds` | `Boolean!` | Assign user to multiple groups |
| `createAssignmentsForGroup` | `groupId, userIds` | `Boolean!` | Assign multiple users to a group |
| `updateGroupAssignmentsForUser` | `userId, groupIds` | `Boolean!` | Sync user's groups |
| `updateAssignmentsForGroup` | `groupId, userIds` | `Boolean!` | Sync group's users |
| `deleteGroupAssignmentsForUser` | `userId` | `Boolean!` | Remove user from all groups |
| `deleteAssignmentsForGroup` | `groupId` | `Boolean!` | Remove all users from group |

### ResolveField

| Field | On | Returns | Description |
|-------|-----|---------|-------------|
| `user` | `GroupAssignment` | `User` (stub) | `@CheckFieldView` enforced |
| `group` | `GroupAssignment` | `Group` (stub) | `@CheckFieldView` enforced |

### GroupResolver (Federation Extension)

The service extends the `Group` entity (owned by Grants) with a computed field:

```typescript
@Resolver(() => Group)
class GroupResolver {
  @ResolveField(() => Int, { name: 'usageCount', nullable: true })
  async resolveUsageCount(@Parent() group: Group): Promise<number> {
    return this.service.countByGroupId(group._id);
  }
}
```

This means when you query a Group from the Grants service, the `usageCount` field is resolved by GroupAssignments.

## RPC Patterns

### MessagePattern Handlers

| Pattern | Input | Output | Purpose |
|---------|-------|--------|---------|
| `FIND_GROUP_ASSIGNMENTS_BY_USER_ID` | `string` | `GroupAssignment[]` | User's groups |
| `FIND_GROUP_ASSIGNMENTS_BY_GROUP_ID` | `string` | `GroupAssignment[]` | Group's users |
| `CREATE_GROUP_ASSIGNMENT` | `{userId, groupId}` | `GroupAssignment` | Direct create (emits USER_GROUPS_CHANGED) |
| `GROUP_CREATED` | `{groupId, userIds}` | — | Create assignments for new group |
| `GROUP_UPDATED` | `{groupId, userIds}` | — | Sync assignments |
| `GROUP_DELETED` | `{groupId}` | — | Delete all assignments |

### EventPattern Handlers

| Pattern | Input | Action |
|---------|-------|--------|
| `USER_CREATED` | `{userId, groupIds}` | Create assignments for new user |
| `USER_UPDATED` | `{userId, groupIds}` | Sync user's group assignments |
| `USER_DELETED` | `{userId}` | Delete all assignments |
| `USER_HARD_DELETED` | `{userId}` | Delete all assignments |
| `PERMISSIONS_CHANGED` | `{groupIds}` | Invalidate cache |

### Outbound Events

| Target | Pattern | When |
|--------|---------|------|
| Users | `USER_GROUPS_CHANGED` | After assignment create/update/delete |

## Business Logic

### USER_GROUPS_CHANGED Propagation

When group assignments change, the service emits `USER_GROUPS_CHANGED` to the Users service, which syncs `authData.groupIds` in the user document. This keeps the denormalized `groupIds` array up to date.

### Batch Sync Logic

The `updateGroupAssignmentsForUser(userId, groupIds)` method:
1. Find current assignments for the user
2. Compute diff: which to add, which to remove
3. Delete removed assignments
4. Create new assignments (with unique index preventing duplicates)
5. Emit `USER_GROUPS_CHANGED`

### Unique Index

The `{ userId, groupId }` unique index prevents duplicate assignments. If a user is already in a group, attempting to re-add them will fail gracefully.
