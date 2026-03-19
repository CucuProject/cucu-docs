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
