# MilestoneToUser Service

The MilestoneToUser service manages the **N:N relationship between milestones and users** (resource assignments). It also owns the **ResourceDailyAllocation** entity for granular day-by-day resource planning.

## Overview

| Property | Value |
|----------|-------|
| Port | 3005 |
| Database | `milestone-to-user_{tenantSlug}` |
| Collections | `milestonetousers`, `resourcedailyallocations` |
| Module | `MilestoneToUserModule` |
| Context | `M2uContext` (request-scoped) |

## Schemas

### MilestoneToUser

```typescript
@Directive('@key(fields: "_id")')
@Schema({ timestamps: true })
class MilestoneToUser {
  _id: string
  userId?: string              // null for draft slots (planned resources without assignment)
  milestoneId: string          // required
  roleCategoryId?: string      // → RoleCategory (organization) for draft slots
  isDraft: boolean             // true = planned slot, false = real allocation
  startDate?: string           // Assignment-specific dates (may differ from milestone dates)
  endDate?: string
  tenantId?: string
}

// Indexes: { milestoneId, isDraft }, { userId, isDraft }
```

**Draft slots**: When `userId` is null and `isDraft` is true, the record represents a **planned resource need** (e.g., "we need a Backend Developer for this milestone"). The `roleCategoryId` identifies the type of resource needed, inherited from `ProjectTemplatePhase.roleCategoryId` when created via the project wizard.

### ResourceDailyAllocation

```typescript
@Directive('@key(fields: "_id")')
@Schema({ timestamps: true })
class ResourceDailyAllocation {
  _id: string
  m2uId: string                // → MilestoneToUser._id
  milestoneId: string          // Denormalized for efficient queries
  date: string                 // YYYY-MM-DD
  hours: number                // Hours allocated on this day
  tenantId?: string
}
```

## GraphQL Schema

### Queries

| Query | Args | Return | Description |
|-------|------|--------|-------------|
| `findAllMilestoneToUser` | `pagination?, filter?, sort?` | `PaginatedMilestoneToUsers!` | All assignments |
| `findMilestoneToUserByUserId` | `userId: ID!, pagination?, sort?` | `PaginatedMilestoneToUsers!` | By user. `@ScopeCapable('userId')` |
| `findMilestoneToUserByMilestoneId` | `milestoneId: ID!, pagination?, sort?` | `PaginatedMilestoneToUsers!` | By milestone |
| `getMilestoneToUser` | `id: ID!` | `MilestoneToUser!` | Single record |
| `findM2UIdsByMilestones` | `milestoneIds: [ID]!` | `[MilestoneToUserLite]!` | Lightweight batch lookup |
| `findAllocationsByM2U` | `m2uId: ID!` | `[ResourceDailyAllocation]!` | Daily allocations for an assignment |
| `findAllocationsByMilestone` | `milestoneId: ID!, m2uIds: [ID]!` | `[ResourceDailyAllocation]!` | Allocations for a milestone |
| `findAllResourceDailyAllocations` | `pagination?, filter?: FilterAllocationsInput` | `PaginatedAggregatedAllocations!` | Aggregated allocation view |

### Mutations

| Mutation | Args | Return | Description |
|----------|------|--------|-------------|
| `createMilestoneToUser` | `createMilestoneToUserInput` | `MilestoneToUser!` | Create single assignment |
| `updateMilestoneToUser` | `updateMilestoneToUserInput` | `MilestoneToUser!` | Update single assignment |
| `removeMilestoneToUser` | `id: ID!` | `MilestoneToUser!` | Delete single assignment |
| `createAssignmentsForUser` | `userId, milestoneIds, startDates?, endDates?` | `Boolean!` | Batch create |
| `updateAssignmentsForUser` | `userId, milestoneIds, startDates?, endDates?` | `Boolean!` | Batch sync |
| `deleteAssignmentsForUser` | `userId` | `Boolean!` | Delete all for user |
| `createMilestoneToUserForMilestone` | `milestoneId, userIds, startDates?, endDates?` | `Boolean!` | Batch create |
| `updateMilestoneToUserForMilestone` | `milestoneId, userIds, startDates?, endDates?` | `Boolean!` | Batch sync |
| `deleteMilestoneToUserForMilestone` | `milestoneId` | `Boolean!` | Delete all for milestone |
| `upsertResourceDailyAllocation` | `input` | `ResourceDailyAllocation!` | Upsert daily allocation |
| `bulkUpsertResourceDailyAllocations` | `ops: [UpsertResourceDailyAllocationInput]!` | `Boolean!` | Batch upsert |
| `deleteAllAllocationsByM2U` | `m2uId` | `Boolean!` | Clear all allocations for assignment |
| `shiftAllocations` | `input: ShiftAllocationsInput!` | `Boolean!` | Shift allocations in time |
| `rescaleAllocations` | `input: RescaleAllocationsInput!` | `Boolean!` | Rescale allocation hours |

### ResolveField

| Field | On | Returns | Description |
|-------|-----|---------|-------------|
| `user` | `MilestoneToUser` | `User` (stub) | `{ __typename: 'User', _id: assignment.userId }` |
| `milestone` | `MilestoneToUser` | `Milestone` (stub) | `{ __typename: 'Milestone', _id: assignment.milestoneId }` |
| `roleCategory` | `MilestoneToUser` | `RoleCategory` (stub) | `{ __typename: 'RoleCategory', _id: assignment.roleCategoryId }` |
| `m2u` | `AggregatedAllocation` | `MilestoneToUser` | Direct DB query |

## RPC Patterns

### MessagePattern Handlers

| Pattern | Input | Output | Purpose |
|---------|-------|--------|---------|
| `FIND_MILESTONE_TO_USER_BY_USER_ID` | `string` | `{_id}[]` | User's milestone assignments |
| `FIND_MILESTONE_TO_USER_BY_MILESTONE_ID` | `string` | `{_id}[]` | Milestone's user assignments |

### EventPattern Handlers

| Pattern | Input | Action |
|---------|-------|--------|
| `USER_CREATED` | `{userId, assignedMilestoneIds}` | Create assignments |
| `USER_UPDATED` | `{userId, assignedMilestoneIds}` | Sync assignments |
| `USER_DELETED` | `{userId}` | Delete all assignments |
| `USER_HARD_DELETED` | `{userId}` | Delete all assignments |
| `MILESTONE_CREATED` | `{milestoneId, assignedUserIds, startDates?, endDates?}` | Create assignments |
| `MILESTONE_UPDATED` | `{milestoneId, assignedUserIds, startDates?, endDates?}` | Sync assignments |
| `MILESTONE_DELETED` | `{milestoneId}` | Delete all assignments |
| `PERMISSIONS_CHANGED` | `{groupIds}` | Invalidate cache |

## Business Logic

### Resource Planning with Draft Slots

The draft slot concept enables resource planning before people are assigned:

1. **Create milestone from template** → template phases with `roleCategoryId` generate draft M2U records (`isDraft: true`, `userId: null`)
2. **Plan capacity** → add `ResourceDailyAllocation` records to draft slots
3. **Assign person** → set `userId`, `isDraft: false`
4. **Allocations preserved** — daily allocations link to `m2uId`, not `userId`

### Shift & Rescale Allocations

- **Shift**: moves all allocations for a set of M2U records by N days (positive or negative)
- **Rescale**: multiplies all allocation hours by a factor (e.g., 0.5 for half-time)
