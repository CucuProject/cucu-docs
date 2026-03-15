# Group Assignments Service

The GroupAssignments service manages **N:N relationships between Users and Groups** in the Cucu platform.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 3008 |
| **Database** | group-assignments-db (MongoDB, port 9008) |
| **Role** | User ↔ Group relationship management |
| **Dependencies** | Users, Grants |

## Schema

### GroupAssignment

```typescript
interface GroupAssignment {
  _id: ID;
  userId: ID;       // Reference to User
  groupId: ID;      // Reference to Group
  user?: User;      // Resolved via federation
  group?: Group;    // Resolved via federation
}
```

### Database Indexes

```typescript
// Unique compound index: one assignment per user-group pair
GroupAssignmentSchema.index({ userId: 1, groupId: 1 }, { unique: true });
```

## API Reference

### GraphQL Queries

#### findAllGroupAssignments

```graphql
query FindAllGroupAssignments(
  $pagination: PaginationInput
  $filter: GroupAssignmentFilterInput
  $sort: SortInput
) {
  findAllGroupAssignments(pagination: $pagination, filter: $filter, sort: $sort) {
    items {
      _id
      userId
      groupId
      user { _id authData { name } }
      group { _id name }
    }
    totalCount
    page
    limit
    totalPages
    hasNextPage
    hasPreviousPage
  }
}
```

**Filter Options:**
```typescript
interface GroupAssignmentFilterInput {
  userId?: ID;    // Filter by user ID
  groupId?: ID;   // Filter by group ID
}
```

#### findGroupAssignmentsByUserId

```graphql
query FindGroupAssignmentsByUserId(
  $userId: ID!
  $pagination: PaginationInput
  $sort: SortInput
) {
  findGroupAssignmentsByUserId(userId: $userId, pagination: $pagination, sort: $sort) {
    items {
      _id
      groupId
      group { _id name }
    }
    totalCount
  }
}
```

This query is **scope-aware**: users with `scope: 'self'` can only query their own assignments.

#### findGroupAssignmentsByGroupId

```graphql
query FindGroupAssignmentsByGroupId(
  $groupId: ID!
  $pagination: PaginationInput
  $sort: SortInput
) {
  findGroupAssignmentsByGroupId(groupId: $groupId, pagination: $pagination, sort: $sort) {
    items {
      _id
      userId
      user { _id authData { name } }
    }
    totalCount
  }
}
```

#### getGroupAssignment

```graphql
query GetGroupAssignment($id: ID!) {
  getGroupAssignment(id: $id) {
    _id
    userId
    groupId
    user { _id authData { name } }
    group { _id name }
  }
}
```

### GraphQL Mutations

#### createGroupAssignment

```graphql
mutation CreateGroupAssignment($input: CreateGroupAssignmentInput!) {
  createGroupAssignment(createGroupAssignmentInput: $input) {
    _id
    userId
    groupId
  }
}

# Variables
{
  "input": {
    "userId": "user-123",
    "groupId": "group-456"
  }
}
```

#### updateGroupAssignment

```graphql
mutation UpdateGroupAssignment($input: UpdateGroupAssignmentInput!) {
  updateGroupAssignment(updateGroupAssignmentInput: $input) {
    _id
    userId
    groupId
  }
}

# Variables
{
  "input": {
    "_id": "assignment-123",
    "userId": "user-123",
    "groupId": "group-789"
  }
}
```

#### removeGroupAssignment

```graphql
mutation RemoveGroupAssignment($id: ID!) {
  removeGroupAssignment(id: $id) {
    _id
    userId
    groupId
  }
}
```

### Batch Mutations

#### createGroupAssignmentsForUser

Creates multiple assignments for a single user:

```graphql
mutation CreateGroupAssignmentsForUser($userId: ID!, $groupIds: [ID!]!) {
  createGroupAssignmentsForUser(userId: $userId, groupIds: $groupIds)
}
```

#### createAssignmentsForGroup

Creates assignments for multiple users in a single group:

```graphql
mutation CreateAssignmentsForGroup($groupId: ID!, $userIds: [ID!]!) {
  createAssignmentsForGroup(groupId: $groupId, userIds: $userIds)
}
```

#### updateGroupAssignmentsForUser

Replaces all group assignments for a user:

```graphql
mutation UpdateGroupAssignmentsForUser($userId: ID!, $groupIds: [ID!]!) {
  updateGroupAssignmentsForUser(userId: $userId, groupIds: $groupIds)
}
```

#### updateAssignmentsForGroup

Replaces all user assignments for a group:

```graphql
mutation UpdateAssignmentsForGroup($groupId: ID!, $userIds: [ID!]!) {
  updateAssignmentsForGroup(groupId: $groupId, userIds: $userIds)
}
```

#### deleteGroupAssignmentsForUser

Deletes all assignments for a user:

```graphql
mutation DeleteGroupAssignmentsForUser($userId: ID!) {
  deleteGroupAssignmentsForUser(userId: $userId)
}
```

#### deleteAssignmentsForGroup

Deletes all assignments for a group:

```graphql
mutation DeleteAssignmentsForGroup($groupId: ID!) {
  deleteAssignmentsForGroup(groupId: $groupId)
}
```

## RPC Patterns

### Message Patterns

| Pattern | Payload | Response |
|---------|---------|----------|
| `FIND_GROUP_ASSIGNMENTS_BY_USER_ID` | `userId: string` | `GroupAssignment[]` |
| `FIND_GROUP_ASSIGNMENTS_BY_GROUP_ID` | `groupId: string` | `GroupAssignment[]` |
| `CREATE_GROUP_ASSIGNMENT` | `{ userId, groupId }` | `GroupAssignment` |
| `GROUP_CREATED` | `{ groupId, userIds }` | `void` |
| `GROUP_UPDATED` | `{ groupId, userIds }` | `void` |
| `GROUP_DELETED` | `{ groupId }` | `void` |

### Event Patterns

| Pattern | Payload | Source |
|---------|---------|--------|
| `USER_CREATED` | `{ userId, groupIds }` | Users |
| `USER_UPDATED` | `{ userId, groupIds }` | Users |
| `USER_DELETED` | `{ userId }` | Users |
| `USER_HARD_DELETED` | `{ userId }` | Users |
| `PERMISSIONS_CHANGED` | `{ groupIds }` | Grants |

## Events Emitted

### USER_GROUPS_CHANGED

Emitted when a user's group assignments change:

```typescript
this.usersClient.emit('USER_GROUPS_CHANGED', { userId });
```

The Users service listens for this event to sync the `authData.groupIds` field.

## Service Logic

### Validation

- **User Exists**: Verifies user exists via `USER_EXISTS` RPC before creating assignment
- **Group Exists**: Verifies group exists via `GROUP_EXISTS` RPC before creating assignment
- **Duplicate Handling**: Duplicate assignments are silently ignored (returns existing document)

### Bulk Operations

Bulk operations use `insertMany` with `ordered: false` to skip duplicates:

```typescript
private async insertManyIgnoringDuplicates(docs: any[]) {
  try {
    const res = await this.model.insertMany(docs, { ordered: false });
  } catch (err: any) {
    if (err?.code === 11000 || err?.writeErrors?.length) {
      // Duplicates ignored - continue
    } else {
      throw err;
    }
  }
}
```

### Update vs Replace

The `updateGroupAssignmentsForUser` mutation performs a **full replacement**:

1. Deletes all existing assignments for the user
2. Creates new assignments for the provided group IDs
3. Emits `USER_GROUPS_CHANGED` event

## Field Resolvers

### user

Returns a federation reference to the User entity:

```typescript
@ResolveField(() => User, { nullable: true })
user(@Parent() assignment: GroupAssignment): User {
  if (!assignment.userId) return null;
  return { __typename: 'User', _id: assignment.userId } as User;
}
```

### group

Returns a federation reference to the Group entity:

```typescript
@ResolveField(() => Group, { nullable: true })
group(@Parent() assignment: GroupAssignment): Group {
  if (!assignment.groupId) return null;
  return { __typename: 'Group', _id: assignment.groupId } as Group;
}
```

## Configuration

### Environment Variables

```ini
# Service Config
GROUP_ASSIGNMENTS_SERVICE_NAME=group-assignments
GROUP_ASSIGNMENTS_SERVICE_PORT=3008
GROUP_ASSIGNMENTS_DB_HOST=group-assignments-db
GROUP_ASSIGNMENTS_DB_PORT=9008

# MongoDB
MONGODB_URI=mongodb://group-assignments-db:27017/group-assignments

# Dependencies
GROUP_ASSIGNMENTS_DEPENDENCIES=[]

# Redis
REDIS_SERVICE_HOST=redis
REDIS_SERVICE_TLS_PORT=6380
```

## Integration with Users Service

The GroupAssignments service maintains bidirectional sync with the Users service:

1. **Users → GroupAssignments**: When a user is created/updated with `groupIds`, the Users service emits `USER_CREATED`/`USER_UPDATED` events
2. **GroupAssignments → Users**: When assignments change, this service emits `USER_GROUPS_CHANGED`
3. **Users Service Sync**: Users service listens and updates `authData.groupIds` in the user document

This ensures group membership is always consistent between the join table (GroupAssignments) and the denormalized field in User.

## File Structure

```
apps/group-assignments/
├── src/
│   ├── main.ts
│   ├── group-assignments.module.ts
│   ├── group-assignments.controller.ts   # RPC handlers
│   ├── group-assignments.resolver.ts     # GraphQL queries/mutations
│   ├── group-assignments.service.ts      # Business logic
│   ├── ga-context.ts                     # Subgraph context
│   ├── group.resolver.ts                 # Group federation resolver
│   ├── schemas/
│   │   └── group-assignment.schema.ts    # Mongoose schema
│   ├── entities/
│   │   ├── user.entity.ts                # Federation stub
│   │   └── group.entity.ts               # Federation stub
│   └── dto/
│       ├── create-group-assignment.input.ts
│       ├── update-group-assignment.input.ts
│       ├── filter-group-assignment.input.ts
│       └── paginated-group-assignment.output.ts
├── Dockerfile
└── README.md
```

## Next Steps

- [Users Service](/services/users) - User management
- [Grants Service](/services/grants) - Group and permission management
- [Permission System](/architecture/permissions) - How permissions are applied
