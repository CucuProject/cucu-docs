# Project Access Service

The ProjectAccess service manages **project-level access control** in the Cucu platform.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 3008 |
| **Database** | project-access-db (MongoDB, port 9008) |
| **Role** | Per-project access control |
| **Dependencies** | Users, Projects |

## Schema

### ProjectAccess

```typescript
interface ProjectAccess {
  _id: ID;
  projectId: ID;
  userId: ID;
  role: ProjectRole;       // OWNER, MANAGER, MEMBER, VIEWER
  grantedBy?: ID;          // User who granted access
  grantedAt: Date;
  project?: Project;       // Resolved via federation
  user?: User;             // Resolved via federation
}

enum ProjectRole {
  OWNER = 'OWNER'
  MANAGER = 'MANAGER'
  MEMBER = 'MEMBER'
  VIEWER = 'VIEWER'
}
```

## API Reference

### GraphQL Queries

```graphql
query {
  findProjectAccess(projectId: "project-123") {
    _id
    role
    user { _id authData { name } }
  }
}

query {
  findUserProjects(userId: "user-123") {
    _id
    role
    project { _id name }
  }
}
```

### GraphQL Mutations

```graphql
mutation {
  grantProjectAccess(input: {
    projectId: "project-123"
    userId: "user-456"
    role: MEMBER
  }) {
    _id
  }
}

mutation {
  updateProjectAccess(input: {
    _id: "access-123"
    role: MANAGER
  }) {
    _id
    role
  }
}

mutation {
  revokeProjectAccess(accessId: "access-123") {
    _id
  }
}
```

## Role Permissions

| Role | View | Edit | Manage Members | Delete |
|------|------|------|----------------|--------|
| OWNER | ✓ | ✓ | ✓ | ✓ |
| MANAGER | ✓ | ✓ | ✓ | - |
| MEMBER | ✓ | ✓ | - | - |
| VIEWER | ✓ | - | - | - |

---

::: warning Coming Soon - Phase 2
Full documentation with role hierarchy, access validation, and integration with the main permission system will be added in Phase 2.
:::
