# MilestoneToProject Service

The MilestoneToProject service manages the **N:N relationship between milestones and projects**. Each assignment can have its own start/end dates that may differ from the parent milestone's dates.

## Overview

| Property | Value |
|----------|-------|
| Port | 3006 |
| Database | `milestone-to-project_{tenantSlug}` |
| Collection | `milestonetoproject` |
| Module | `MilestoneToProjectModule` |
| Context | `M2pContext` (request-scoped) |

## Schema

```typescript
@Directive('@key(fields: "_id")')
@Schema({ timestamps: true })
class MilestoneToProject {
  _id: string
  projectId: string            // required
  milestoneId: string          // required
  startDate?: string           // Assignment-specific dates
  endDate?: string
  tenantId?: string
}
```

## GraphQL Schema

### Queries

| Query | Args | Return |
|-------|------|--------|
| `findAllMilestoneToProject` | `pagination?, filter?, sort?` | `PaginatedMilestoneToProjects!` |
| `findMilestoneToProjectByProjectId` | `projectId: ID!, pagination?, sort?` | `PaginatedMilestoneToProjects!` |
| `findMilestoneToProjectByMilestoneId` | `milestoneId: ID!, pagination?, sort?` | `PaginatedMilestoneToProjects!` |
| `getMilestoneToProject` | `id: ID!` | `MilestoneToProject!` |

### Mutations

| Mutation | Args | Return |
|----------|------|--------|
| `createMilestoneToProject` | `input` | `MilestoneToProject!` |
| `updateMilestoneToProject` | `input` | `MilestoneToProject!` |
| `removeMilestoneToProject` | `id: ID!` | `MilestoneToProject!` |
| `createAssignmentsForProject` | `projectId, milestoneIds, startDates?, endDates?` | `Boolean!` |
| `createMilestoneToProjectForProject` | `milestoneId, projectIds, startDates?, endDates?` | `Boolean!` |
| `updateAssignmentsForProject` | `projectId, milestoneIds, startDates?, endDates?` | `Boolean!` |
| `updateMilestoneToProjectForProject` | `milestoneId, projectIds, startDates?, endDates?` | `Boolean!` |
| `deleteAssignmentsForProject` | `projectId` | `Boolean!` |
| `deleteMilestoneToProjectForProject` | `milestoneId` | `Boolean!` |

### ResolveField

| Field | On | Returns | Description |
|-------|-----|---------|-------------|
| `project` | `MilestoneToProject` | `Project` (stub) | `@CheckFieldView` enforced |
| `milestone` | `MilestoneToProject` | `Milestone` (stub) | `@CheckFieldView` enforced |

## RPC Patterns

### MessagePattern Handlers

| Pattern | Input | Output |
|---------|-------|--------|
| `FIND_MILESTONE_TO_PROJECT_BY_PROJECT_ID` | `string` | assignments |
| `FIND_MILESTONE_TO_PROJECT_BY_MILESTONE_ID` | `string` | assignments |
| `FIND_MILESTONE_TO_PROJECT_BY_MILESTONE_IDS` | `string[]` | assignments |
| `CREATE_MILESTONE_TO_PROJECT` | `{milestoneId, projectId, startDate?, endDate?}` | assignment |

### EventPattern Handlers

| Pattern | Input | Action |
|---------|-------|--------|
| `PROJECT_CREATED` | `{projectId, assignedMilestoneIds}` | Create assignments |
| `PROJECT_UPDATED` | `{projectId, assignedMilestoneIds}` | Sync assignments |
| `PROJECT_DELETED` | `{projectId}` | Delete all assignments |
| `MILESTONE_CREATED` | `{milestoneId, assignedProjectIds, startDates?, endDates?}` | Create assignments |
| `MILESTONE_UPDATED` | `{milestoneId, assignedProjectIds, startDates?, endDates?}` | Sync assignments |
| `MILESTONE_DELETED` | `{milestoneId}` | Delete all assignments |
| `PERMISSIONS_CHANGED` | `{groupIds}` | Invalidate cache |

## Business Logic

### Assignment Sync

When milestones or projects are updated with new assignment lists, the service performs a **diff-based sync**:
1. Find current assignments
2. Delete assignments not in the new list
3. Create assignments for new IDs
4. Preserve existing assignments that remain

### Date Override

Each M2P record can have its own `startDate` and `endDate` that differ from the parent milestone's planned dates. This allows flexible scheduling when the same milestone participates in multiple projects with different timelines.
