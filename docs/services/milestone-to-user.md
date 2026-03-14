# Milestone to User Service

The MilestoneToUser service manages **N:N relationships between Users and Milestones** with assignment dates.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 3008 |
| **Database** | milestone-to-user-db (MongoDB, port 9005) |
| **Role** | User ↔ Milestone relationship with date overrides |
| **Dependencies** | Users, Milestones |

## Schema

### UserAssignment (MilestoneToUser)

```typescript
interface MilestoneToUser {
  _id: ID;
  userId: ID;
  milestoneId: ID;
  startDate?: string;      // Override milestone start date
  endDate?: string;        // Override milestone end date
  user?: User;             // Resolved via federation
  milestone?: Milestone;   // Resolved via federation
}
```

## API Reference

### GraphQL Queries

```graphql
query {
  findAllMilestoneToUser {
    _id
    user { _id authData { name } }
    milestone { _id name }
    startDate
    endDate
  }
}

query {
  findMilestoneToUserByUserId(userId: "user-123") {
    _id
    milestone { _id name }
    startDate
    endDate
  }
}

query {
  findMilestoneToUserByMilestoneId(milestoneId: "milestone-123") {
    _id
    user { _id authData { name } }
    startDate
    endDate
  }
}
```

### GraphQL Mutations

```graphql
mutation {
  createUserAssignment(createUserAssignmentInput: {
    userId: "user-123"
    milestoneId: "milestone-456"
    startDate: "2024-01-01"
    endDate: "2024-06-30"
  }) {
    _id
  }
}

mutation {
  createAssignmentsForUser(
    userId: "user-123"
    milestoneIds: ["milestone-1", "milestone-2"]
    startDates: ["2024-01-01", "2024-02-01"]
    endDates: ["2024-06-30", "2024-07-31"]
  )
}

mutation {
  updateAssignmentsForUser(
    userId: "user-123"
    milestoneIds: ["milestone-3"]
    startDates: ["2024-03-01"]
    endDates: ["2024-08-31"]
  )
}
```

## RPC Patterns

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `FIND_MILESTONE_TO_USER_BY_USER_ID` | Message | `userId: string` | `{ _id: string }[]` |
| `FIND_MILESTONE_TO_USER_BY_MILESTONE_ID` | Message | `milestoneId: string` | `{ _id: string }[]` |

## Events Handled

| Event | Source | Action |
|-------|--------|--------|
| `USER_CREATED` | Users | Create initial assignments |
| `USER_UPDATED` | Users | Update assignments |
| `USER_DELETED` | Users | Delete all user assignments |
| `MILESTONE_CREATED` | Milestones | Create initial assignments |
| `MILESTONE_DELETED` | Milestones | Delete all milestone assignments |

---

::: warning Coming Soon - Phase 2
Full documentation with date validation, default date handling, and code examples will be added in Phase 2.
:::
