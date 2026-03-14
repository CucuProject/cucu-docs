# Projects Service

The Projects service manages **project entities** in the Cucu platform.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 3003 |
| **Database** | projects-db (MongoDB, port 9003) |
| **Role** | Project CRUD and lifecycle management |
| **Dependencies** | Users |

## Schema

### Project

```typescript
interface Project {
  _id: ID;
  name: string;
  description?: string;
  status: ProjectStatus;     // DRAFT, ACTIVE, COMPLETED, ARCHIVED
  startDate?: string;
  endDate?: string;
  clientId?: string;
  managerId?: string;        // Reference to User
  milestones?: MilestoneToProject[];
  createdAt: Date;
  updatedAt: Date;
}
```

## API Reference

### GraphQL Queries

```graphql
query {
  findAllProjects {
    _id
    name
    status
    manager { _id authData { name } }
  }
}

query {
  findOneProject(projectId: "project-123") {
    _id
    name
    description
    milestones {
      _id
      milestone { _id name }
    }
  }
}
```

### GraphQL Mutations

```graphql
mutation {
  createProject(createProjectInput: {
    name: "New Project"
    description: "Project description"
    status: DRAFT
  }) {
    _id
    name
  }
}

mutation {
  updateProject(updateProjectInput: {
    _id: "project-123"
    status: ACTIVE
  }) {
    _id
    status
  }
}
```

## RPC Patterns

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `PROJECT_EXISTS` | Message | `projectId: string` | `boolean` |

## Events Emitted

| Event | Payload | Purpose |
|-------|---------|---------|
| `PROJECT_CREATED` | `{ projectId, milestoneIds? }` | Notify relationship services |
| `PROJECT_UPDATED` | `{ projectId, milestoneIds? }` | Update relationships |
| `PROJECT_DELETED` | `{ projectId }` | Cleanup relationships |

---

::: warning Coming Soon - Phase 2
Full documentation with implementation details, status lifecycle, validation rules, and code examples will be added in Phase 2.
:::
