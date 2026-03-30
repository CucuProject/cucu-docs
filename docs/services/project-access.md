# ProjectAccess Service

The ProjectAccess service manages **project-level access control**. It defines which users have access to which projects, at what level, and exposes APIs to share, transfer ownership, and revoke access.

## Overview

| Property | Value |
|----------|-------|
| Port | 3011 |
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
  role: ProjectAccessRole      // OWNER | COLLABORATOR | EDITOR | VIEWER
  tenantId?: string
}

// Unique index: { projectId, userId } — one role per user per project
```

### ProjectAccessRole Enum

| Value | String | Capabilities |
|-------|--------|-------------|
| `OWNER` | `owner` | Full control — view, edit, share, transfer ownership |
| `COLLABORATOR` | `collaborator` | View + edit + share with others |
| `EDITOR` | `editor` | View + edit |
| `VIEWER` | `viewer` | View only |

## Access Sources

A user may gain access to a project through multiple sources. The effective level is the **highest** across all sources:

| Source | Effective Level | Notes |
|--------|----------------|-------|
| Explicit DB record | As stored (`owner`/`collaborator`/`editor`/`viewer`) | Created via share or auto-created at project creation |
| Supervisor chain | `editor` | If the user is a supervisor (direct or indirect) of the project owner |
| M2U implicit | `viewer` | If the user is allocated to a milestone linked to the project (no DB record needed) |
| SUPERADMIN group | Full access | Members of the SUPERADMIN group bypass all access checks |

## GraphQL Schema

### Queries

| Query | Args | Return |
|-------|------|--------|
| `findAllProjectAccess` | `pagination?, filter?, sort?` | `PaginatedProjectAccess!` |
| `findProjectAccessByProjectId` | `projectId!, pagination?, sort?` | `PaginatedProjectAccess!` |
| `findProjectAccessByUserId` | `userId!, pagination?, sort?` | `PaginatedProjectAccess!` `@ScopeCapable('userId')` |
| `findOneProjectAccess` | `id: ID!` | `ProjectAccess!` |
| `getProjectShares` | `projectId: ID!` | `[ProjectAccess]!` |

### Mutations

| Mutation | Args | Return | Who Can Call |
|----------|------|--------|-------------|
| `shareProject` | `input: ShareProjectInput!` | `ProjectAccess!` | Owner, `collaborator`, or supervisor of owner |
| `transferOwnership` | `input: TransferOwnershipInput!` | `ProjectAccess!` | Supervisor of current owner, or SUPERADMIN |
| `revokeAccess` | `input: RevokeAccessInput!` | `Boolean!` | Owner, `collaborator`, or supervisor of owner. Cannot revoke the owner record. |

### ResolveField

| Field | On | Returns |
|-------|-----|---------|
| `project` | `ProjectAccess` | `Project` (federation stub) |
| `user` | `ProjectAccess` | `User` (federation stub) |

## RPC Patterns

### MessagePattern Handlers

| Pattern | Input | Output | Purpose |
|---------|-------|--------|---------|
| `GET_PROJECT_ACCESS_LEVEL` | `{projectId: string, userId: string}` | `{level: 'owner'\|'collaborator'\|'editor'\|'viewer'\|null}` | Effective access level for a user on a project (all sources combined) |
| `GET_ALL_ACCESSIBLE_PROJECT_IDS` | `{userId: string}` | `{projectIds: string[], isUnrestricted: boolean}` | All project IDs the user can access (explicit + supervisor + M2U). `isUnrestricted: true` for SUPERADMIN |
| `GET_EXPLICIT_ACCESSIBLE_PROJECT_IDS` | `{userId: string}` | `{projectIds: string[], isUnrestricted: boolean}` | Only explicit DB records + supervisor chain — **no M2U lookup** (see circular dependency note) |
| `HAS_PROJECT_ACCESS` | `{userId: string, projectId: string}` | `boolean` | Quick existence check (any access level) |
| `PROJECT_ACCESS_EXISTS` | `string` (id) | `boolean` | Check if a record exists by `_id` |

### EventPattern Handlers

| Pattern | Input | Action |
|---------|-------|--------|
| `PROJECT_OWNER_CREATED` | `{projectId: string, userId: string}` | Auto-creates an `OWNER` record for the creator when a project is created |
| `PERMISSIONS_CHANGED` | `{groupIds: string[]}` | Invalidate permission cache |

## Business Logic

### Effective Access Level Resolution

When `GET_PROJECT_ACCESS_LEVEL` is called, the service resolves the level across all sources and returns the **highest** one:

1. **Explicit record** — look up `{projectId, userId}` in DB
2. **Supervisor chain** — check if the user appears in the supervisor chain of the project's owner (via `GET_SUPERVISOR_CHAIN` on Users service). If yes → `editor` level
3. **M2U implicit** — check if the user has any M2U record for milestones linked to this project (via `HAS_M2U_FOR_USER_IN_PROJECT`). If yes → `viewer` level
4. **SUPERADMIN** — if the user is in the SUPERADMIN group → unrestricted

The returned level is the maximum across all matching sources (owner > collaborator > editor > viewer).

### Share API

`shareProject` creates or updates a `ProjectAccess` record for the target user:
- Caller must be the project owner, an `collaborator`, or a supervisor of the owner
- Cannot downgrade the owner's record via this mutation (use `transferOwnership` instead)
- If a record already exists for the target user, it is updated

`transferOwnership` moves the `OWNER` role to a new user:
- Caller must be a supervisor of the current owner, or a SUPERADMIN
- The previous owner's record is downgraded to `COLLABORATOR` (not `EDITOR` — preserves share capability)
- The new owner's record is created or updated to `OWNER`
- The Projects service is notified via `UPDATE_PROJECT_CREATED_BY`

`revokeAccess` removes a `ProjectAccess` record:
- Cannot revoke the project's owner record (returns error)
- Caller must be the project owner, an `collaborator`, or a supervisor of the owner

`getProjectShares` lists all explicit `ProjectAccess` records for a project.

### Authorization Assertions

Two internal assertion methods enforce who can share and who can transfer:

| Assertion | Allowed callers |
|-----------|----------------|
| `assertCanShare` | Owner, `collaborator`, supervisor chain of the owner, SUPERADMIN |
| `assertCanTransferOwnership` | Supervisor chain of the owner, SUPERADMIN **only** |

> **Note:** The project owner cannot transfer ownership to someone else directly — a supervisor or SUPERADMIN must perform the transfer.

### Implicit Viewer via M2U

When a user is allocated to a milestone that belongs to a project, they automatically gain `viewer` access to that project — no DB record is created. This is resolved at query time via `GET_ALL_ACCESSIBLE_PROJECT_IDS` (which internally calls M2U).

> **Note on ARCHIVED projects:** Users allocated via M2U retain their viewer access even when the project is ARCHIVED. Access is not revoked on archive.

## Circular Dependency: `GET_EXPLICIT` vs `GET_ALL`

A circular dependency exists between M2P/M2U and ProjectAccess when filtering queries by accessible projects:

```
findAllMilestones
  → GET_ALL_ACCESSIBLE_PROJECT_IDS (project-access)
    → HAS_M2U_FOR_USER_IN_PROJECT (milestone-to-user)   ← M2U calls back into M2U!
```

To break this cycle, `GET_EXPLICIT_ACCESSIBLE_PROJECT_IDS` exists as a **safe alternative**:
- It resolves explicit DB records + supervisor chain only
- It does **not** call M2U
- It is used by M2P and M2U when they need to filter their own queries by project access

```
findAllMilestones (M2U)
  → GET_EXPLICIT_ACCESSIBLE_PROJECT_IDS (project-access)  ← safe, no M2U call
    → GET_MILESTONE_IDS_BY_PROJECT_IDS (M2P)
      → return filtered milestones
```

Rule of thumb:
- `GET_ALL_ACCESSIBLE_PROJECT_IDS` — use from Projects service and downstream consumers that don't feed back into M2U/M2P
- `GET_EXPLICIT_ACCESSIBLE_PROJECT_IDS` — use from M2P and M2U to avoid circular calls
