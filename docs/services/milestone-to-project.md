# Milestone to Project Service

The MilestoneToProject service manages **N:N relationships between Projects and Milestones** with assignment dates.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 3009 |
| **Database** | milestone-to-project-db (MongoDB, port 9006) |
| **Role** | Project ↔ Milestone relationship with date overrides |
| **Dependencies** | Projects, Milestones |

## Schema

### ProjectAssignment (MilestoneToProject)

```typescript
interface MilestoneToProject {
  _id: ID;
  projectId: ID;
  milestoneId: ID;
  startDate?: string;      // Override milestone start date
  endDate?: string;        // Override milestone end date
  project?: Project;       // Resolved via federation
  milestone?: Milestone;   // Resolved via federation
}
```

## API Reference

### GraphQL Queries

```graphql
query {
  findAllMilestoneToProject {
    _id
    project { _id name }
    milestone { _id name }
    startDate
    endDate
  }
}

query {
  findMilestoneToProjectByProjectId(projectId: "project-123") {
    _id
    milestone { _id name }
    startDate
    endDate
  }
}

query {
  findMilestoneToProjectByMilestoneId(milestoneId: "milestone-123") {
    _id
    project { _id name }
    startDate
    endDate
  }
}
```

### GraphQL Mutations

```graphql
mutation {
  createProjectAssignment(createProjectAssignmentInput: {
    projectId: "project-123"
    milestoneId: "milestone-456"
    startDate: "2024-01-01"
    endDate: "2024-06-30"
  }) {
    _id
  }
}

mutation {
  createMilestoneToProjectForProject(
    projectId: "project-123"
    milestoneIds: ["milestone-1", "milestone-2"]
    startDates: ["2024-01-01", "2024-02-01"]
    endDates: ["2024-06-30", "2024-07-31"]
  )
}
```

## RPC Patterns

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `FIND_MILESTONE_TO_PROJECT_BY_PROJECT_ID` | Message | `projectId: string` | `{ _id: string }[]` |
| `FIND_MILESTONE_TO_PROJECT_BY_MILESTONE_ID` | Message | `milestoneId: string` | `{ _id: string }[]` |

## Events Handled

| Event | Source | Action |
|-------|--------|--------|
| `PROJECT_CREATED` | Projects | Create initial assignments |
| `PROJECT_UPDATED` | Projects | Update assignments |
| `PROJECT_DELETED` | Projects | Delete all project assignments |
| `MILESTONE_CREATED` | Milestones | Create initial assignments |
| `MILESTONE_DELETED` | Milestones | Delete all milestone assignments |

---

::: warning Coming Soon - Phase 2
Full documentation with date validation, default date handling, and code examples will be added in Phase 2.
:::
