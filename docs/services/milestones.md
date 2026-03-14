# Milestones Service

The Milestones service manages **milestone entities** in the Cucu platform.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 3004 |
| **Database** | milestones-db (MongoDB, port 9004) |
| **Role** | Milestone CRUD and status tracking |
| **Dependencies** | Users |

## Schema

### Milestone

```typescript
interface Milestone {
  _id: ID;
  name: string;
  description?: string;
  status: number;           // 0-100 (percentage complete)
  color?: string;           // Hex color code
  startDate?: string;
  endDate?: string;
  users?: MilestoneToUser[];
  projects?: MilestoneToProject[];
  createdAt: Date;
  updatedAt: Date;
}
```

## API Reference

### GraphQL Queries

```graphql
query {
  findAllMilestones {
    _id
    name
    status
    color
  }
}

query {
  findOneMilestone(milestoneId: "milestone-123") {
    _id
    name
    description
    users {
      _id
      user { _id authData { name } }
      startDate
      endDate
    }
  }
}
```

### GraphQL Mutations

```graphql
mutation {
  createMilestone(createMilestoneInput: {
    name: "Q1 Release"
    description: "First quarter release milestone"
    status: 0
    color: "#FF5733"
  }) {
    _id
    name
  }
}

mutation {
  updateMilestone(updateMilestoneInput: {
    _id: "milestone-123"
    status: 50
  }) {
    _id
    status
  }
}
```

## RPC Patterns

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `MILESTONE_EXISTS` | Message | `milestoneId: string` | `boolean` |

## Events Emitted

| Event | Payload | Purpose |
|-------|---------|---------|
| `MILESTONE_CREATED` | `{ milestoneId, userIds?, projectIds? }` | Notify relationship services |
| `MILESTONE_UPDATED` | `{ milestoneId }` | Update relationships |
| `MILESTONE_DELETED` | `{ milestoneId }` | Cleanup relationships |

---

::: warning Coming Soon - Phase 2
Full documentation with implementation details, status tracking, color assignment, and code examples will be added in Phase 2.
:::
