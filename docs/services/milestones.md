# Milestones Service

The Milestones service manages **milestone entities** and **milestone dependencies** in the Cucu platform.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 3004 |
| **Database** | milestones-db (MongoDB, port 9004) |
| **Role** | Milestone CRUD, status tracking, dependencies |
| **Dependencies** | MilestoneToUser, MilestoneToProject |

## Schema

### Milestone

```typescript
interface Milestone {
  _id: ID;
  color?: string;           // Hex color for UI (auto-assigned if not provided)
  milestoneBasicData: {
    name: string;
    description: string;
    plannedStartDate: string;   // ISO 8601 date
    plannedEndDate: string;     // ISO 8601 date
    status: number;             // 0-100 (percentage complete)
    effort?: number;            // Effort in working days (person-days)
  };
  users?: MilestoneToUser[];    // Resolved via federation
  projects?: MilestoneToProject[]; // Resolved via federation
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### MilestoneDependency

```typescript
interface MilestoneDependency {
  _id: ID;
  projectId: string;      // Project that owns both milestones
  milestoneIdA: string;   // Source milestone
  milestoneIdB: string;   // Target milestone
  offsetDays: number;     // Working-day offset (can be negative or zero)
  createdAt: Date;
  updatedAt: Date;
}
```

## API Reference

### GraphQL Queries

#### findAllMilestones

```graphql
query FindAllMilestones(
  $pagination: PaginationInput
  $filter: MilestoneFilterInput
  $sort: SortInput
) {
  findAllMilestones(pagination: $pagination, filter: $filter, sort: $sort) {
    items {
      _id
      color
      milestoneBasicData {
        name
        description
        plannedStartDate
        plannedEndDate
        status
        effort
      }
    }
    totalCount
    hasNextPage
  }
}
```

**Filter Options:**
```typescript
interface MilestoneFilterInput {
  name?: string;       // Case-insensitive substring match
  statusMin?: number;  // Minimum status percentage
  statusMax?: number;  // Maximum status percentage
}
```

#### findOneMilestone

```graphql
query FindOneMilestone($milestoneId: ID!) {
  findOneMilestone(milestoneId: $milestoneId) {
    _id
    color
    milestoneBasicData {
      name
      description
      plannedStartDate
      plannedEndDate
      status
      effort
    }
    users {
      _id
      user { _id authData { name } }
      startDate
      endDate
    }
    projects {
      _id
      project { _id projectBasicData { name } }
    }
  }
}
```

#### findDependenciesByProject

```graphql
query FindDependenciesByProject($projectId: ID!) {
  findDependenciesByProject(projectId: $projectId) {
    _id
    milestoneIdA
    milestoneIdB
    offsetDays
  }
}
```

#### findDependenciesByMilestone

```graphql
query FindDependenciesByMilestone($milestoneId: ID!) {
  findDependenciesByMilestone(milestoneId: $milestoneId) {
    _id
    projectId
    milestoneIdA
    milestoneIdB
    offsetDays
  }
}
```

### GraphQL Mutations

#### createMilestone

```graphql
mutation CreateMilestone($input: CreateMilestoneInput!) {
  createMilestone(createMilestoneInput: $input) {
    _id
    color
    milestoneBasicData {
      name
      status
    }
  }
}

# Variables
{
  "input": {
    "milestoneBasicData": {
      "name": "Q1 Release",
      "description": "First quarter release milestone",
      "plannedStartDate": "2024-01-01",
      "plannedEndDate": "2024-03-31",
      "status": 0,
      "effort": 20
    },
    "color": "#FF5733",
    "assignedUserIds": ["user-1", "user-2"],
    "assignmentStartDates": ["2024-01-01", "2024-01-15"],
    "assignmentEndDates": ["2024-02-28", "2024-03-15"]
  }
}
```

#### createMilestones (Bulk)

```graphql
mutation CreateMilestones($inputs: [CreateMilestoneInput!]!) {
  createMilestones(inputs: $inputs) {
    _id
    milestoneBasicData { name }
  }
}
```

#### updateMilestone

```graphql
mutation UpdateMilestone($input: UpdateMilestoneInput!) {
  updateMilestone(updateMilestoneInput: $input) {
    _id
    milestoneBasicData {
      name
      status
    }
  }
}

# Variables
{
  "input": {
    "_id": "milestone-123",
    "milestoneBasicData": {
      "status": 50
    },
    "assignedUserIds": ["user-3"],
    "assignmentStartDates": ["2024-02-01"],
    "assignmentEndDates": ["2024-04-30"]
  }
}
```

#### updateMilestoneStatus

Quick status update without full input:

```graphql
mutation UpdateMilestoneStatus($milestoneId: ID!, $status: Float!) {
  updateMilestoneStatus(milestoneId: $milestoneId, status: $status) {
    _id
    milestoneBasicData { status }
  }
}
```

#### removeMilestone

Soft deletes a milestone:

```graphql
mutation RemoveMilestone($milestoneId: ID!) {
  removeMilestone(milestoneId: $milestoneId) {
    name
    description
  }
}
```

#### createMilestoneDependency

```graphql
mutation CreateMilestoneDependency($input: CreateMilestoneDependencyInput!) {
  createMilestoneDependency(input: $input) {
    _id
    milestoneIdA
    milestoneIdB
    offsetDays
  }
}

# Variables
{
  "input": {
    "projectId": "project-123",
    "milestoneIdA": "milestone-1",
    "milestoneIdB": "milestone-2",
    "offsetDays": 5
  }
}
```

#### removeMilestoneDependency

```graphql
mutation RemoveMilestoneDependency($dependencyId: ID!) {
  removeMilestoneDependency(dependencyId: $dependencyId)
}
```

## RPC Patterns

### Message Patterns

| Pattern | Payload | Response |
|---------|---------|----------|
| `MILESTONE_EXISTS` | `milestoneId: string` | `boolean` |
| `FIND_MILESTONE_BY_NAME` | `{ name: string }` | `Milestone` or `null` |
| `GET_MILESTONE_DATES` | `milestoneId: string` | `{ startDate, endDate }` |
| `CREATE_MILESTONE` | `CreateMilestoneInput` | `Milestone` |
| `UPDATE_MILESTONE` | `UpdateMilestoneInput` | `Milestone` |
| `UPDATE_MILESTONE_STATUS` | `{ milestoneId, status }` | `Milestone` |
| `DELETE_MILESTONE` | `milestoneId: string` | `Milestone` |

### Event Patterns

| Pattern | Payload | Purpose |
|---------|---------|---------|
| `PERMISSIONS_CHANGED` | `{ groupIds }` | Invalidate permission cache |

## Events Emitted

### MILESTONE_CREATED

```typescript
this.milestoneToUserClient.emit('MILESTONE_CREATED', {
  milestoneId,
  assignedUserIds: input.assignedUserIds || [],
  assignmentStartDates: input.assignmentStartDates,
  assignmentEndDates: input.assignmentEndDates,
});
```

### MILESTONE_UPDATED

```typescript
this.milestoneToUserClient.emit('MILESTONE_UPDATED', {
  milestoneId,
  assignedUserIds: input.assignedUserIds,
  assignmentStartDates: input.assignmentStartDates,
  assignmentEndDates: input.assignmentEndDates,
});
```

### MILESTONE_DELETED

```typescript
this.milestoneToUserClient.emit('MILESTONE_DELETED', { milestoneId });
this.milestoneToProjectClient.emit('MILESTONE_DELETED', { milestoneId });
```

## Business Rules

### Validation

| Rule | Description |
|------|-------------|
| **Date Range** | `plannedEndDate` must be >= `plannedStartDate` |
| **Status Range** | Status must be between 0 and 100 |
| **Effort** | Effort in working days (person-days), optional |

### Color Assignment

If no color is provided, a color is auto-assigned from a predefined palette.

### Soft Delete

Milestones are soft-deleted by setting `deletedAt` timestamp. All queries filter out deleted milestones by default.

## Field Resolvers

### users

Fetches user assignments via RPC:

```typescript
@ResolveField(() => [MilestoneToUser], { nullable: true })
async users(@Parent() m: Milestone) {
  const rows = await lastValueFrom(
    this.m2u.send<MilestoneToUser[]>(
      'FIND_MILESTONE_TO_USER_BY_MILESTONE_ID',
      m._id,
    ),
  );
  return rows.map(r => ({ __typename: 'MilestoneToUser', _id: r._id }));
}
```

### projects

Fetches project assignments via RPC:

```typescript
@ResolveField(() => [MilestoneToProject], { nullable: true })
async projects(@Parent() m: Milestone) {
  const rows = await lastValueFrom(
    this.m2p.send<MilestoneToProject[]>(
      'FIND_MILESTONE_TO_PROJECT_BY_MILESTONE_ID',
      m._id,
    ),
  );
  return rows.map(r => ({ __typename: 'MilestoneToProject', _id: r._id }));
}
```

## Configuration

### Environment Variables

```ini
# Service Config
MILESTONES_SERVICE_NAME=milestones
MILESTONES_SERVICE_PORT=3004
MILESTONES_DB_HOST=milestones-db
MILESTONES_DB_PORT=9004

# MongoDB
MONGODB_URI=mongodb://milestones-db:27017/milestones

# Dependencies
MILESTONES_DEPENDENCIES=[]

# Redis
REDIS_SERVICE_HOST=redis
REDIS_SERVICE_TLS_PORT=6380
```

## File Structure

```
apps/milestones/
├── src/
│   ├── main.ts
│   ├── milestones.module.ts
│   ├── milestones.controller.ts          # RPC handlers
│   ├── milestones.resolver.ts            # GraphQL queries/mutations
│   ├── milestones.service.ts             # Business logic
│   ├── milestones-context.ts             # Subgraph context
│   ├── milestone-dependency.resolver.ts  # Dependency CRUD
│   ├── milestone-dependency.service.ts   # Dependency business logic
│   ├── schemas/
│   │   ├── milestone.schema.ts
│   │   └── milestone-dependency.schema.ts
│   ├── entities/
│   │   ├── milestone-to-user.entity.ts
│   │   └── milestone-to-project.entity.ts
│   ├── helpers/
│   │   └── color-palette.ts
│   └── dto/
│       ├── create-milestone.input.ts
│       ├── update-milestone.input.ts
│       ├── filter-milestone.input.ts
│       ├── create-milestone-dependency.input.ts
│       └── paginated-milestone.output.ts
├── Dockerfile
└── README.md
```

## Next Steps

- [MilestoneToUser Service](/services/milestone-to-user) - User-milestone relationships
- [MilestoneToProject Service](/services/milestone-to-project) - Project-milestone relationships
- [Projects Service](/services/projects) - Project management
