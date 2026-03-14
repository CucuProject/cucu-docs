# Project Access Service

The ProjectAccess service manages **per-project access control** in the Cucu platform, providing role-based permissions for individual projects.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 3008 |
| **Database** | project-access-db (MongoDB, port 9008) |
| **Role** | Per-project role-based access control |
| **Dependencies** | Users, Projects |

## Schema

### ProjectAccess

```typescript
interface ProjectAccess {
  _id: ID;
  projectId: string;       // Reference to Project
  userId: string;          // Reference to User
  role: ProjectAccessRole; // OWNER, PM, MEMBER, VIEWER
  project?: Project;       // Resolved via federation
  user?: User;             // Resolved via federation
  createdAt: Date;
  updatedAt: Date;
}

enum ProjectAccessRole {
  OWNER = 'owner'    // Full access including delete
  PM = 'pm'          // Project manager - edit and manage members
  MEMBER = 'member'  // Can view and edit project
  VIEWER = 'viewer'  // Read-only access
}
```

### Database Indexes

```typescript
// Unique compound index: one role per user-project pair
ProjectAccessSchema.index({ projectId: 1, userId: 1 }, { unique: true });
```

## API Reference

### GraphQL Queries

#### findAllProjectAccess

```graphql
query FindAllProjectAccess(
  $pagination: PaginationInput
  $filter: ProjectAccessFilterInput
  $sort: SortInput
) {
  findAllProjectAccess(pagination: $pagination, filter: $filter, sort: $sort) {
    items {
      _id
      projectId
      userId
      role
      project { _id projectBasicData { name } }
      user { _id authData { name } }
    }
    totalCount
    hasNextPage
  }
}
```

**Filter Options:**
```typescript
interface ProjectAccessFilterInput {
  projectId?: ID;           // Filter by project ID
  userId?: ID;              // Filter by user ID
  role?: ProjectAccessRole; // Filter by role
}
```

#### findProjectAccessByProjectId

```graphql
query FindProjectAccessByProjectId(
  $projectId: String!
  $pagination: PaginationInput
  $sort: SortInput
) {
  findProjectAccessByProjectId(projectId: $projectId, pagination: $pagination, sort: $sort) {
    items {
      _id
      userId
      role
      user { _id authData { name surname email } }
    }
    totalCount
  }
}
```

#### findProjectAccessByUserId

```graphql
query FindProjectAccessByUserId(
  $userId: String!
  $pagination: PaginationInput
  $sort: SortInput
) {
  findProjectAccessByUserId(userId: $userId, pagination: $pagination, sort: $sort) {
    items {
      _id
      projectId
      role
      project { _id projectBasicData { name status } }
    }
    totalCount
  }
}
```

This query is **scope-aware**: users with `scope: 'self'` can only query their own access entries.

#### findOneProjectAccess

```graphql
query FindOneProjectAccess($id: String!) {
  findOneProjectAccess(id: $id) {
    _id
    projectId
    userId
    role
    createdAt
    updatedAt
  }
}
```

### GraphQL Mutations

#### createProjectAccess

```graphql
mutation CreateProjectAccess($input: CreateProjectAccessInput!) {
  createProjectAccess(createProjectAccessInput: $input) {
    _id
    projectId
    userId
    role
  }
}

# Variables
{
  "input": {
    "projectId": "project-123",
    "userId": "user-456",
    "role": "MEMBER"
  }
}
```

#### updateProjectAccess

```graphql
mutation UpdateProjectAccess($input: UpdateProjectAccessInput!) {
  updateProjectAccess(updateProjectAccessInput: $input) {
    _id
    role
  }
}

# Variables
{
  "input": {
    "_id": "access-123",
    "role": "PM"
  }
}
```

#### removeProjectAccess

```graphql
mutation RemoveProjectAccess($id: String!) {
  removeProjectAccess(id: $id) {
    _id
    projectId
    userId
  }
}
```

## RPC Patterns

### Message Patterns

| Pattern | Payload | Response |
|---------|---------|----------|
| `HAS_PROJECT_ACCESS` | `{ userId, projectId }` | `boolean` |
| `GET_ACCESSIBLE_PROJECT_IDS` | `userId: string` | `string[]` |
| `PROJECT_ACCESS_EXISTS` | `id: string` | `boolean` |

### Event Patterns

| Pattern | Payload | Purpose |
|---------|---------|---------|
| `PERMISSIONS_CHANGED` | `{ groupIds }` | Invalidate permission cache |

## Role Permissions Matrix

| Capability | OWNER | PM | MEMBER | VIEWER |
|------------|-------|-----|--------|--------|
| View project | ✓ | ✓ | ✓ | ✓ |
| Edit project | ✓ | ✓ | ✓ | - |
| Manage milestones | ✓ | ✓ | ✓ | - |
| Manage team members | ✓ | ✓ | - | - |
| Change project settings | ✓ | ✓ | - | - |
| Delete project | ✓ | - | - | - |
| Transfer ownership | ✓ | - | - | - |

## Service Logic

### Access Checking

The `hasAccess` method checks if a user has any access to a project:

```typescript
async hasAccess(userId: string, projectId: string): Promise<boolean> {
  const access = await this.model.findOne({
    userId,
    projectId,
  });
  return !!access;
}
```

### Getting Accessible Projects

Returns all project IDs a user has access to:

```typescript
async getAccessibleProjectIds(userId: string): Promise<string[]> {
  const entries = await this.model.find({ userId }).select('projectId').lean();
  return entries.map(e => e.projectId);
}
```

## Field Resolvers

### project

Returns a federation reference to the Project entity:

```typescript
@ResolveField('project', () => Project)
async project(@Parent() projectAccess: ProjectAccess) {
  return {
    __typename: 'Project',
    _id: projectAccess.projectId,
  };
}
```

### user

Returns a federation reference to the User entity:

```typescript
@ResolveField('user', () => User)
async user(@Parent() projectAccess: ProjectAccess) {
  return {
    __typename: 'User',
    _id: projectAccess.userId,
  };
}
```

## Configuration

### Environment Variables

```ini
# Service Config
PROJECT_ACCESS_SERVICE_NAME=project-access
PROJECT_ACCESS_SERVICE_PORT=3008
PROJECT_ACCESS_DB_HOST=project-access-db
PROJECT_ACCESS_DB_PORT=9008

# MongoDB
MONGODB_URI=mongodb://project-access-db:27017/project-access

# Dependencies
PROJECT_ACCESS_DEPENDENCIES=[]

# Redis
REDIS_SERVICE_HOST=redis
REDIS_SERVICE_TLS_PORT=6380
```

## Integration with Permission System

The ProjectAccess service works alongside the global permission system:

1. **Global permissions** (from Grants) determine what operations a user can perform system-wide
2. **Project access** determines which specific projects a user can access
3. Both checks are combined: a user needs both global permission AND project access

Example flow:
1. User calls `findOneProject(projectId)`
2. OperationGuard checks global `canExecute('findOneProject')`
3. ProjectAccess is checked via `HAS_PROJECT_ACCESS` RPC
4. Field-level permissions filter the response

## File Structure

```
apps/project-access/
├── src/
│   ├── main.ts
│   ├── project-access.module.ts
│   ├── project-access.controller.ts      # RPC handlers
│   ├── project-access.resolver.ts        # GraphQL queries/mutations
│   ├── project-access.service.ts         # Business logic
│   ├── project-access-context.ts         # Subgraph context
│   ├── schemas/
│   │   └── project-access.schema.ts      # Mongoose schema + enum
│   ├── entities/
│   │   ├── project.entity.ts
│   │   └── user.entity.ts
│   └── dto/
│       ├── create-project-access.input.ts
│       ├── update-project-access.input.ts
│       ├── filter-project-access.input.ts
│       └── paginated-project-access.output.ts
├── Dockerfile
└── README.md
```

## Next Steps

- [Projects Service](/services/projects) - Project management
- [Users Service](/services/users) - User management
- [Permission System](/architecture/permissions) - Global permissions
