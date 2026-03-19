# ProjectAccess Service

The ProjectAccess service manages **project-level role-based access control**. It defines which users have access to which projects and with what role (owner, PM, member, viewer).

## Overview

| Property | Value |
|----------|-------|
| Port | 3008 |
| Database | `project-access_{tenantSlug}` |
| Collection | `projectaccessdocuments` |
| Module | `ProjectAccessModule` |
| Context | `ProjectAccessContext` (request-scoped) |

## Schema

```typescript
@Directive('@key(fields: "_id")')
class ProjectAccess {
  _id: string
  projectId: string            // required
  userId: string               // required
  role: ProjectAccessRole      // OWNER | PM | MEMBER | VIEWER
  tenantId?: string
}

// Unique index: { projectId, userId } — one role per user per project
```

### ProjectAccessRole Enum

| Value | Description |
|-------|-------------|
| `OWNER` | Full control over project |
| `PM` | Project manager — can edit project and manage assignments |
| `MEMBER` | Can view and contribute to milestones |
| `VIEWER` | Read-only access |

## GraphQL Schema

### Queries

| Query | Args | Return |
|-------|------|--------|
| `findAllProjectAccess` | `pagination?, filter?, sort?` | `PaginatedProjectAccess!` |
| `findProjectAccessByProjectId` | `projectId!, pagination?, sort?` | `PaginatedProjectAccess!` |
| `findProjectAccessByUserId` | `userId!, pagination?, sort?` | `PaginatedProjectAccess!` `@ScopeCapable('userId')` |
| `findOneProjectAccess` | `id: ID!` | `ProjectAccess!` |

### Mutations

| Mutation | Args | Return |
|----------|------|--------|
| `createProjectAccess` | `input` | `ProjectAccess!` |
| `updateProjectAccess` | `input` | `ProjectAccess!` |
| `removeProjectAccess` | `id: ID!` | `ProjectAccess!` |

### ResolveField

| Field | On | Returns |
|-------|-----|---------|
| `project` | `ProjectAccess` | `Project` (federation stub) |
| `user` | `ProjectAccess` | `User` (federation stub) |

## RPC Patterns

| Pattern | Type | Input | Output |
|---------|------|-------|--------|
| `HAS_PROJECT_ACCESS` | Message | `{userId, projectId}` | `boolean` |
| `GET_ACCESSIBLE_PROJECT_IDS` | Message | `string` (userId) | `string[]` |
| `PROJECT_ACCESS_EXISTS` | Message | `string` (id) | `boolean` |
| `PERMISSIONS_CHANGED` | Event | `{groupIds}` | Cache invalidation |

## Business Logic

### Access Check

The `HAS_PROJECT_ACCESS` pattern checks if a specific user has any role in a specific project. Used by other services to enforce project-level access before returning data.

### Accessible Projects

`GET_ACCESSIBLE_PROJECT_IDS` returns all project IDs that a user has access to. Used for filtering project lists.
