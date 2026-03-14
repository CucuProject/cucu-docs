# Milestone to Project Service

The MilestoneToProject service manages **N:N relationships between Projects and Milestones** with assignment dates.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 3006 |
| **Database** | milestone-to-project-db (MongoDB, port 9006) |
| **Role** | Project ↔ Milestone relationships |
| **Dependencies** | Projects, Milestones |

## Schema

### MilestoneToProject

```typescript
interface MilestoneToProject {
  _id: ID;
  projectId: ID;           // Reference to Project
  milestoneId: ID;         // Reference to Milestone
  startDate?: string;      // Override milestone start date
  endDate?: string;        // Override milestone end date
  project?: Project;       // Resolved via federation
  milestone?: Milestone;   // Resolved via federation
  createdAt: Date;
  updatedAt: Date;
}
```

## API Reference

### GraphQL Queries

#### findAllMilestoneToProject

```graphql
query FindAllMilestoneToProject(
  $pagination: PaginationInput
  $filter: MilestoneToProjectFilterInput
  $sort: SortInput
) {
  findAllMilestoneToProject(pagination: $pagination, filter: $filter, sort: $sort) {
    items {
      _id
      projectId
      milestoneId
      startDate
      endDate
      project { _id projectBasicData { name } }
      milestone { _id milestoneBasicData { name } }
    }
    totalCount
    hasNextPage
  }
}
```

**Filter Options:**
```typescript
interface MilestoneToProjectFilterInput {
  projectId?: ID;     // Filter by project ID
  milestoneId?: ID;   // Filter by milestone ID
}
```

#### findMilestoneToProjectByProjectId

```graphql
query FindMilestoneToProjectByProjectId(
  $projectId: ID!
  $pagination: PaginationInput
  $sort: SortInput
) {
  findMilestoneToProjectByProjectId(projectId: $projectId, pagination: $pagination, sort: $sort) {
    items {
      _id
      milestoneId
      milestone { _id milestoneBasicData { name status } }
      startDate
      endDate
    }
    totalCount
  }
}
```

#### findMilestoneToProjectByMilestoneId

```graphql
query FindMilestoneToProjectByMilestoneId(
  $milestoneId: ID!
  $pagination: PaginationInput
  $sort: SortInput
) {
  findMilestoneToProjectByMilestoneId(milestoneId: $milestoneId, pagination: $pagination, sort: $sort) {
    items {
      _id
      projectId
      project { _id projectBasicData { name } }
      startDate
      endDate
    }
    totalCount
  }
}
```

#### getMilestoneToProject

```graphql
query GetMilestoneToProject($id: ID!) {
  getMilestoneToProject(id: $id) {
    _id
    projectId
    milestoneId
    startDate
    endDate
  }
}
```

### GraphQL Mutations

#### createMilestoneToProject

```graphql
mutation CreateMilestoneToProject($input: CreateMilestoneToProjectInput!) {
  createMilestoneToProject(createMilestoneToProjectInput: $input) {
    _id
    projectId
    milestoneId
  }
}

# Variables
{
  "input": {
    "projectId": "project-123",
    "milestoneId": "milestone-456",
    "startDate": "2024-01-01",
    "endDate": "2024-06-30"
  }
}
```

#### updateMilestoneToProject

```graphql
mutation UpdateMilestoneToProject($input: UpdateMilestoneToProjectInput!) {
  updateMilestoneToProject(updateMilestoneToProjectInput: $input) {
    _id
    startDate
    endDate
  }
}

# Variables
{
  "input": {
    "_id": "m2p-123",
    "startDate": "2024-02-01",
    "endDate": "2024-07-31"
  }
}
```

#### removeMilestoneToProject

```graphql
mutation RemoveMilestoneToProject($id: ID!) {
  removeMilestoneToProject(id: $id) {
    _id
    projectId
    milestoneId
  }
}
```

### Batch Mutations

#### createAssignmentsForProject

Creates multiple milestone assignments for a project:

```graphql
mutation CreateAssignmentsForProject(
  $projectId: ID!
  $milestoneIds: [ID!]!
  $startDates: [String!]
  $endDates: [String!]
) {
  createAssignmentsForProject(
    projectId: $projectId
    milestoneIds: $milestoneIds
    startDates: $startDates
    endDates: $endDates
  )
}
```

#### createMilestoneToProjectForProject

Creates project assignments for a milestone:

```graphql
mutation CreateMilestoneToProjectForProject(
  $milestoneId: ID!
  $projectIds: [ID!]!
  $startDates: [String!]
  $endDates: [String!]
) {
  createMilestoneToProjectForProject(
    milestoneId: $milestoneId
    projectIds: $projectIds
    startDates: $startDates
    endDates: $endDates
  )
}
```

#### updateAssignmentsForProject

Replaces all milestone assignments for a project:

```graphql
mutation UpdateAssignmentsForProject(
  $projectId: ID!
  $milestoneIds: [ID!]!
  $startDates: [String!]
  $endDates: [String!]
) {
  updateAssignmentsForProject(
    projectId: $projectId
    milestoneIds: $milestoneIds
    startDates: $startDates
    endDates: $endDates
  )
}
```

#### updateMilestoneToProjectForProject

Replaces all project assignments for a milestone:

```graphql
mutation UpdateMilestoneToProjectForProject(
  $milestoneId: ID!
  $projectIds: [ID!]!
  $startDates: [String!]
  $endDates: [String!]
) {
  updateMilestoneToProjectForProject(
    milestoneId: $milestoneId
    projectIds: $projectIds
    startDates: $startDates
    endDates: $endDates
  )
}
```

#### deleteAssignmentsForProject

```graphql
mutation DeleteAssignmentsForProject($projectId: ID!) {
  deleteAssignmentsForProject(projectId: $projectId)
}
```

#### deleteMilestoneToProjectForProject

```graphql
mutation DeleteMilestoneToProjectForProject($milestoneId: ID!) {
  deleteMilestoneToProjectForProject(milestoneId: $milestoneId)
}
```

## RPC Patterns

### Message Patterns

| Pattern | Payload | Response |
|---------|---------|----------|
| `FIND_MILESTONE_TO_PROJECT_BY_PROJECT_ID` | `projectId: string` | `MilestoneToProject[]` |
| `FIND_MILESTONE_TO_PROJECT_BY_MILESTONE_ID` | `milestoneId: string` | `MilestoneToProject[]` |
| `FIND_MILESTONE_TO_PROJECT_BY_MILESTONE_IDS` | `milestoneIds: string[]` | `MilestoneToProject[]` |
| `CREATE_MILESTONE_TO_PROJECT` | `{ milestoneId, projectId, startDate?, endDate? }` | `MilestoneToProject` |

### Event Patterns

| Pattern | Payload | Source |
|---------|---------|--------|
| `PROJECT_CREATED` | `{ projectId, assignedMilestoneIds }` | Projects |
| `PROJECT_UPDATED` | `{ projectId, assignedMilestoneIds }` | Projects |
| `PROJECT_DELETED` | `{ projectId }` | Projects |
| `MILESTONE_CREATED` | `{ milestoneId, assignedProjectIds, assignmentStartDates, assignmentEndDates }` | Milestones |
| `MILESTONE_UPDATED` | `{ milestoneId, assignedProjectIds, assignmentStartDates, assignmentEndDates }` | Milestones |
| `MILESTONE_DELETED` | `{ milestoneId }` | Milestones |
| `PERMISSIONS_CHANGED` | `{ groupIds }` | Grants |

## Business Rules

### Date Overrides

Each assignment can override the milestone's default dates:
- `startDate` and `endDate` are optional
- If not specified, the milestone's dates are used
- Allows per-project date ranges for shared milestones

### Duplicate Handling

The service handles duplicates gracefully:
- Duplicate assignments are silently ignored on insert
- Uses `insertMany` with `ordered: false`

## Field Resolvers

### project

Returns a federation reference to the Project entity:

```typescript
@ResolveField(() => Project, { nullable: true })
async project(@Parent() assignment: MilestoneToProject): Promise<Project | null> {
  if (!assignment.projectId) return null;
  return { __typename: 'Project', _id: assignment.projectId } as Project;
}
```

### milestone

Returns a federation reference to the Milestone entity:

```typescript
@ResolveField(() => Milestone, { nullable: true })
async milestone(@Parent() assignment: MilestoneToProject): Promise<Milestone | null> {
  if (!assignment.milestoneId) return null;
  return { __typename: 'Milestone', _id: assignment.milestoneId } as Milestone;
}
```

## Configuration

### Environment Variables

```ini
# Service Config
MILESTONE_TO_PROJECT_SERVICE_NAME=milestone-to-project
MILESTONE_TO_PROJECT_SERVICE_PORT=3006
MILESTONE_TO_PROJECT_DB_HOST=milestone-to-project-db
MILESTONE_TO_PROJECT_DB_PORT=9006

# MongoDB
MONGODB_URI=mongodb://milestone-to-project-db:27017/milestone-to-project

# Dependencies
MILESTONE_TO_PROJECT_DEPENDENCIES=[]

# Redis
REDIS_SERVICE_HOST=redis
REDIS_SERVICE_TLS_PORT=6380
```

## File Structure

```
apps/milestone-to-project/
├── src/
│   ├── main.ts
│   ├── milestone-to-project.module.ts
│   ├── milestone-to-project.controller.ts   # RPC handlers
│   ├── milestone-to-project.resolver.ts     # GraphQL queries/mutations
│   ├── milestone-to-project.service.ts      # Business logic
│   ├── m2p-context.ts                       # Subgraph context
│   ├── schemas/
│   │   └── milestone-to-project.schema.ts
│   ├── entities/
│   │   ├── project.entity.ts
│   │   └── milestone.entity.ts
│   └── dto/
│       ├── create-milestone-to-project.input.ts
│       ├── update-milestone-to-project.input.ts
│       ├── filter-milestone-to-project.input.ts
│       └── paginated-milestone-to-project.output.ts
├── Dockerfile
└── README.md
```

## Next Steps

- [Projects Service](/services/projects) - Project management
- [Milestones Service](/services/milestones) - Milestone management
- [MilestoneToUser Service](/services/milestone-to-user) - User-milestone relationships
