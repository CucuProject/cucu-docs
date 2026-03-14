# Group Assignments Service

The GroupAssignments service manages **N:N relationships between Users and Groups**.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 3007 |
| **Database** | group-assignments-db (MongoDB, port 9007) |
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

## API Reference

### GraphQL Queries

```graphql
# Find all assignments
query {
  findAllGroupAssignments {
    _id
    userId
    groupId
    user { _id authData { name } }
    group { _id name }
  }
}

# Find by user
query {
  findGroupAssignmentsByUserId(userId: "user-123") {
    _id
    group { _id name }
  }
}

# Find by group
query {
  findGroupAssignmentsByGroupId(groupId: "group-123") {
    _id
    user { _id authData { name } }
  }
}
```

### GraphQL Mutations

```graphql
# Create single assignment
mutation {
  createGroupAssignment(createGroupAssignmentInput: {
    userId: "user-123"
    groupId: "group-456"
  }) {
    _id
  }
}

# Bulk create for user
mutation {
  createGroupAssignmentsForUser(
    userId: "user-123"
    groupIds: ["group-1", "group-2"]
  )
}

# Update assignments for user (replace all)
mutation {
  updateGroupAssignmentsForUser(
    userId: "user-123"
    groupIds: ["group-3", "group-4"]
  )
}

# Delete all assignments for user
mutation {
  deleteGroupAssignmentsForUser(userId: "user-123")
}
```

## RPC Patterns

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `FIND_GROUP_ASSIGNMENTS_BY_USER_ID` | Message | `userId: string` | `GroupAssignment[]` |
| `FIND_GROUP_ASSIGNMENTS_BY_GROUP_ID` | Message | `groupId: string` | `GroupAssignment[]` |

## Events Handled

| Event | Source | Action |
|-------|--------|--------|
| `USER_CREATED` | Users | Create initial assignments |
| `USER_UPDATED` | Users | Update assignments |
| `USER_DELETED` | Users | Delete all user assignments |
| `GROUP_CREATED` | Grants | Create initial assignments |
| `GROUP_UPDATED` | Grants | Update assignments |
| `GROUP_DELETED` | Grants | Delete all group assignments |

## Events Emitted

| Event | Payload | Purpose |
|-------|---------|---------|
| `USER_GROUPS_CHANGED` | `{ userId }` | Notify Users service to sync groupIds |

---

::: warning Coming Soon - Phase 2
Full documentation with implementation details, validation rules, and code examples will be added in Phase 2.
:::
