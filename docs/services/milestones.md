# Milestones Service

The Milestones service manages **milestones** (work packages with status tracking) and **milestone dependencies** (predecessor/successor relationships).

## Overview

| Property | Value |
|----------|-------|
| Port | 3004 |
| Database | `milestones_{tenantSlug}` |
| Collections | `milestonedocuments`, `milestonedependencies` |
| Module | `MilestonesModule` |
| Context | `MilestonesContext` (request-scoped) |

## Schemas

### Milestone

```typescript
@Directive('@key(fields: "_id")')
class Milestone {
  _id: string
  color?: string                     // Hex color for UI (auto-assigned)
  isLocked?: boolean                 // Prevents modification when true
  milestoneBasicData: MilestoneBasicDataSchema {
    name: string
    description: string
    plannedStartDate: string
    plannedEndDate: string
    status: number                   // 0-100 (percentage completion)
    effort?: number                  // Working days (person-days)
  }
  users?: MilestoneToUser[]         // Federation
  projects?: MilestoneToProject[]   // Federation
  deletedAt?: Date
  tenantId?: string
}

// Indexes: milestoneBasicData.name+deletedAt, milestoneBasicData.status+deletedAt, deletedAt
```

### MilestoneDependency

```typescript
class MilestoneDependency {
  _id: string
  projectId: string
  sourceMilestoneId: string         // predecessor
  targetMilestoneId: string         // successor
  type: string                      // "finish-to-start", etc.
}
```

## GraphQL Schema

### Milestone Queries & Mutations

| Operation | Type | Args | Return |
|-----------|------|------|--------|
| `findAllMilestones` | Query | `pagination?, filter?: MilestoneFilterInput, sort?` | `PaginatedMilestones!` |
| `findOneMilestone` | Query | `milestoneId: ID!` | `Milestone!` |
| `createMilestone` | Mutation | `createMilestoneInput` | `Milestone!` |
| `createMilestones` | Mutation | `inputs: [CreateMilestoneInput]!` | `[Milestone]!` |
| `updateMilestone` | Mutation | `updateMilestoneInput` | `Milestone!` |
| `removeMilestone` | Mutation | `milestoneId: ID!` | `DeleteMilestoneOutput!` |
| `updateMilestoneStatus` | Mutation | `milestoneId: ID!, status: Float!` | `Milestone!` |

### Dependency Queries & Mutations

| Operation | Type | Args | Return |
|-----------|------|------|--------|
| `findDependenciesByProject` | Query | `projectId: ID!` | `[MilestoneDependency]!` |
| `findDependenciesByMilestone` | Query | `milestoneId: ID!` | `[MilestoneDependency]!` |
| `createMilestoneDependency` | Mutation | `input` | `MilestoneDependency!` |
| `removeMilestoneDependency` | Mutation | `dependencyId: ID!` | `Boolean!` |

### ResolveField

| Field | On | Returns | Description |
|-------|-----|---------|-------------|
| `users` | `Milestone` | `[MilestoneToUser]` | Via `FIND_MILESTONE_TO_USER_BY_MILESTONE_ID` RPC → federation stubs |
| `projects` | `Milestone` | `[MilestoneToProject]` | Via `FIND_MILESTONE_TO_PROJECT_BY_MILESTONE_ID` RPC → federation stubs |

## RPC Patterns

### MessagePattern Handlers

| Pattern | Input | Output | Purpose |
|---------|-------|--------|---------|
| `MILESTONE_EXISTS` | `string \| {id}` | `boolean` | Check existence |
| `FIND_MILESTONE_BY_NAME` | `{name}` | `Milestone \| null` | Find by name |
| `GET_MILESTONE_DATES` | `string` | `{startDate, endDate}` | Get date range |
| `CREATE_MILESTONE` | `CreateMilestoneInput` | `Milestone` | Create (bootstrap) |
| `UPDATE_MILESTONE` | `UpdateMilestoneInput` | `Milestone` | Update |
| `UPDATE_MILESTONE_STATUS` | `{milestoneId, status}` | `Milestone` | Update status |
| `DELETE_MILESTONE` | `string` | `Milestone` | Delete |

### Outbound Events

| Target | Pattern | When |
|--------|---------|------|
| MilestoneToUser | `MILESTONE_CREATED` | After creation (with assignedUserIds) |
| MilestoneToUser | `MILESTONE_UPDATED` | After update |
| MilestoneToUser | `MILESTONE_DELETED` | After deletion |
| MilestoneToProject | `MILESTONE_CREATED` | After creation (with assignedProjectIds) |
| MilestoneToProject | `MILESTONE_UPDATED` | After update |
| MilestoneToProject | `MILESTONE_DELETED` | After deletion |

## Business Logic

### Bulk Create

`createMilestones` accepts an array of `CreateMilestoneInput` and creates them in sequence, returning all created milestones. Each milestone creation emits its own events.

### Status Updates

Status is a numeric percentage (0-100). The `updateMilestoneStatus` mutation accepts the milestone ID and the new status value, updating only the `milestoneBasicData.status` field.

### Color Assignment

Milestones can have an optional hex color for UI display. If not provided during creation, one may be auto-assigned.

## Date Architecture: Planned vs Actual

Milestones use a **dual-date system** to track plan vs reality:

| Field | Location | Purpose |
|-------|----------|---------|
| `plannedStartDate` | `Milestone.milestoneBasicData` | Baseline — the original plan |
| `plannedEndDate` | `Milestone.milestoneBasicData` | Baseline — the original plan |
| `startDate` | `MilestoneToProject` | Actual/operative — changes when Gantt bar is dragged |
| `endDate` | `MilestoneToProject` | Actual/operative — changes when Gantt bar is dragged |

**Lifecycle:**

1. **DRAFT project** — Both planned and actual dates are freely editable. The wizard creates the milestone with `plannedStartDate`/`plannedEndDate`, then creates the M2P record with the same dates as `startDate`/`endDate`.
2. **ACTIVE project** — Planned dates are **frozen** (read-only). Only M2P `startDate`/`endDate` can change via Gantt drag. This preserves the original baseline for variance analysis.
3. **Variance** — The deviation between plan and reality is computed as: `M2P.startDate - Milestone.plannedStartDate`.

> **Historical note:** `startDate`/`endDate` were originally on `MilestoneBasicData` but were removed in PR #218 (March 2026) to avoid data duplication. The M2P record is the single source of truth for operative dates.

### Planned Dates Freeze Guard

When updating a milestone, if the DTO contains `plannedStartDate` or `plannedEndDate`, the service checks via RPC whether any associated project is ACTIVE or ARCHIVED:

```
Milestones → M2P (HAS_ACTIVE_PROJECT_FOR_MILESTONE) → Projects (GET_PROJECTS_STATUS)
```

- Milestones service does **NOT** communicate directly with Projects — it always goes through M2P as intermediary.
- If any associated project is ACTIVE or ARCHIVED → `BadRequestException`.
- If all projects are DRAFT or no project is associated → update proceeds.

## Locked Milestone (`isLocked`)

When a milestone is locked:

**Backend guards:**
- `update()` — blocks ALL modifications except toggling `isLocked` itself. If `dto.isLocked` is defined, the guard is skipped (allows unlock). Otherwise, checks `isLocked` and throws `BadRequestException('Cannot modify a locked milestone. Unlock it first.')`.
- `remove()` — blocks deletion with `BadRequestException('Cannot delete a locked milestone. Unlock it first.')`.

**Frontend behavior (sidebar + drawer + context menu):**
- Lock icon is always visible next to the milestone name (sidebar row + drawer).
- Lock toggle button in sidebar is always visible and clickable.
- Edit (pencil) and Delete (trash) icons are **visible but disabled** (`opacity: 0.25`, `cursor: not-allowed`) — NOT hidden.
- Context menu: Edit and Delete entries are visible but disabled.
- MilestoneDrawer: all pencils disabled, color picker not clickable, delete button disabled.
- Gantt bar: not draggable, not resizable.

**Design principle:** Disabled ≠ Hidden. The user should always see that actions exist but are blocked by the lock state. This communicates intent clearly.
