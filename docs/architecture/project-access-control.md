# Project Access Control

This document explains the full access model for projects: how access levels are computed, the difference between explicit and implicit access, the Share API, ownership transfer, and the solution to the circular dependency problem.

## Access Levels

Each user's effective access level on a project is one of:

| Level | Value | Capabilities |
|-------|-------|-------------|
| `owner` | `OWNER` | Full control — view, edit, share, transfer ownership |
| `editor+` | `EDITOR_PLUS` | View + edit + share with others |
| `editor` | `EDITOR` | View + edit |
| `viewer` | `VIEWER` | View only |
| (none) | `null` | No access |

In addition to the per-project level, two system-wide overrides exist:

| Override | Effective access |
|----------|-----------------|
| Supervisor chain of the project owner | `editor` level on any project owned by a subordinate |
| SUPERADMIN group | Unrestricted — bypasses all access checks |

## Access Sources and Priority

A user can gain access to a project through four sources. The effective level is the **highest** across all matching sources:

```
owner > editor+ > editor > viewer
```

| Priority | Source | Level granted |
|----------|--------|--------------|
| 1 (highest) | Explicit DB record (`ProjectAccess`) | As stored |
| 2 | Supervisor chain of project owner | `editor` |
| 3 | M2U implicit (allocated to a milestone of the project) | `viewer` |
| 4 | SUPERADMIN group | unrestricted |

> **Example:** A user with an explicit `viewer` record who is also a supervisor of the project owner will have effective level `editor` (supervisor takes precedence over the explicit viewer record).

### How `getAccessLevel` resolves the effective level

The `GET_PROJECT_ACCESS_LEVEL` RPC runs the following checks in sequence and returns the highest:

1. **Explicit record** — query `{projectId, userId}` in DB → level as stored
2. **Supervisor check** — call `GET_SUPERVISOR_CHAIN` on Users service; if the current user appears in the chain of the project's owner → `editor`
3. **M2U implicit** — call `HAS_M2U_FOR_USER_IN_PROJECT` on MilestoneToUser; if true → `viewer`
4. **SUPERADMIN** — if user is in SUPERADMIN group → return unrestricted

All four checks are performed; the maximum result is returned.

## Explicit Access

Explicit access is a `ProjectAccess` record stored in the `project-access_{tenantSlug}` database with fields `{projectId, userId, role}`.

### Owner record auto-creation

When a project is created, the Projects service emits `PROJECT_OWNER_CREATED`. The ProjectAccess service listens and automatically creates an `OWNER` record for the creator (`createdBy` field). This record is the canonical source of truth for project ownership.

### Share API

The Share API allows users with sufficient access to grant access to others.

| Mutation | Input | Who can call | Notes |
|----------|-------|-------------|-------|
| `shareProject` | `ShareProjectInput` | Owner, `editor+`, or supervisor of owner | Creates or updates a `ProjectAccess` record for the target user |
| `transferOwnership` | `TransferOwnershipInput` | Supervisor of current owner, or SUPERADMIN | Previous owner becomes `EDITOR`; new owner becomes `OWNER`; `UPDATE_PROJECT_CREATED_BY` sent to Projects |
| `revokeAccess` | `RevokeAccessInput` | Owner, `editor+`, or supervisor of owner | Cannot revoke the owner record |
| `getProjectShares` | `projectId` | — (query, access-checked) | Returns all explicit `ProjectAccess` records for the project |

## Implicit Access via M2U

When a user is allocated to a milestone that belongs to a project (via a `MilestoneToUser` record), they automatically gain **viewer-level access** to that project. No `ProjectAccess` record is created — this is resolved dynamically at query time.

This implicit access means:
- Allocated users can always view the project and its data
- Revoking explicit access does not remove implicit access (the M2U allocation must be removed separately)
- **ARCHIVED projects:** allocated users retain their implicit viewer access even after a project is archived

## The Circular Dependency Problem

When filtering queries by accessible projects, a circular dependency can form:

```
findAllMilestones (M2U service)
  → GET_ALL_ACCESSIBLE_PROJECT_IDS (project-access)
    → HAS_M2U_FOR_USER_IN_PROJECT (M2U service)   ← M2U calling back into M2U!
```

This would cause a deadlock or infinite loop.

### Solution: `GET_EXPLICIT_ACCESSIBLE_PROJECT_IDS`

The `GET_EXPLICIT_ACCESSIBLE_PROJECT_IDS` RPC exists specifically to break this cycle:

- Returns accessible projects from **explicit DB records + supervisor chain only**
- Does **not** call MilestoneToUser
- Safe to call from M2P and M2U without risk of circular dependency

```
findAllMilestones (M2U service)
  → GET_EXPLICIT_ACCESSIBLE_PROJECT_IDS (project-access)  ← safe: no M2U call
    → GET_MILESTONE_IDS_BY_PROJECT_IDS (M2P)
      → return filtered milestones
```

### Usage Rule

| RPC | When to use |
|-----|------------|
| `GET_ALL_ACCESSIBLE_PROJECT_IDS` | From Projects service; from any downstream consumer that does NOT feed back into M2P or M2U |
| `GET_EXPLICIT_ACCESSIBLE_PROJECT_IDS` | From M2P and M2U (avoids circular call) |

The trade-off: `GET_EXPLICIT` may miss implicit viewer access (M2U allocations) when filtering M2P/M2U queries. This is intentional — a user filtering their own milestones will naturally see what they're assigned to through the M2U query itself.

## ARCHIVED Projects

When a project is archived (`status: ARCHIVED`):

- The `ProjectAccess` records are preserved — explicit access is not revoked
- Implicit M2U viewer access is preserved — allocated users can still view
- **No write operations** are allowed on the project or its milestones/assignments (see individual service docs for guard details)
- The only allowed change on the project itself is a status update back to `ACTIVE`

Access and visibility are intentionally kept intact during archiving so that historical data remains accessible to all users who previously had access.
