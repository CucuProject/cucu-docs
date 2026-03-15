# Milestone to User Service

The MilestoneToUser service manages **N:N relationships between Users and Milestones** with assignment dates and resource allocations.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 3006 |
| **Database** | milestone-to-user-db (MongoDB, port 9006) |
| **Role** | User ↔ Milestone relationships, daily allocations |
| **Dependencies** | Users, Milestones |

## Schema

### MilestoneToUser

```typescript
interface MilestoneToUser {
  _id: ID;
  userId?: ID;             // Reference to User (null for draft slots)
  milestoneId: ID;         // Reference to Milestone
  roleCategoryId?: ID;     // Role category for draft slots
  isDraft: boolean;        // Whether this is a draft placeholder
  startDate?: string;      // Override milestone start date
  endDate?: string;        // Override milestone end date
  user?: User;             // Resolved via federation
  milestone?: Milestone;   // Resolved via federation
  roleCategory?: RoleCategory; // Resolved via federation
  createdAt: Date;
  updatedAt: Date;
}
```

### ResourceDailyAllocation

```typescript
interface ResourceDailyAllocation {
  _id: ID;
  m2uId: ID;          // Reference to MilestoneToUser
  date: string;       // ISO 8601 date (YYYY-MM-DD)
  hours: number;      // Hours allocated for this day
  m2u?: MilestoneToUser; // Resolved via federation
  createdAt: Date;
  updatedAt: Date;
}
```

## API Reference

### GraphQL Queries

#### findAllMilestoneToUser

```graphql
query FindAllMilestoneToUser(
  $pagination: PaginationInput
  $filter: MilestoneToUserFilterInput
  $sort: SortInput
) {
  findAllMilestoneToUser(pagination: $pagination, filter: $filter, sort: $sort) {
    items {
      _id
      userId
      milestoneId
      isDraft
      startDate
      endDate
      user { _id authData { name } }
      milestone { _id milestoneBasicData { name } }
    }
    totalCount
    hasNextPage
  }
}
```

**Filter Options:**
```typescript
interface MilestoneToUserFilterInput {
  userId?: ID;          // Filter by user ID
  milestoneId?: ID;     // Filter by milestone ID
  isDraft?: boolean;    // Filter draft slots vs real allocations
  roleCategoryId?: ID;  // Filter by role category (draft slots)
}
```

#### findMilestoneToUserByUserId

```graphql
query FindMilestoneToUserByUserId(
  $userId: ID!
  $pagination: PaginationInput
  $sort: SortInput
) {
  findMilestoneToUserByUserId(userId: $userId, pagination: $pagination, sort: $sort) {
    items {
      _id
      milestoneId
      milestone { _id milestoneBasicData { name } }
      startDate
      endDate
    }
    totalCount
  }
}
```

This query is **scope-aware**: users with `scope: 'self'` can only query their own assignments.

#### findMilestoneToUserByMilestoneId

```graphql
query FindMilestoneToUserByMilestoneId(
  $milestoneId: ID!
  $pagination: PaginationInput
  $sort: SortInput
) {
  findMilestoneToUserByMilestoneId(milestoneId: $milestoneId, pagination: $pagination, sort: $sort) {
    items {
      _id
      userId
      user { _id authData { name } }
      startDate
      endDate
    }
    totalCount
  }
}
```

#### getMilestoneToUser

```graphql
query GetMilestoneToUser($id: String!) {
  getMilestoneToUser(id: $id) {
    _id
    userId
    milestoneId
    isDraft
    roleCategoryId
    startDate
    endDate
  }
}
```

#### findM2UIdsByMilestones

Get assignment IDs for multiple milestones (useful for bulk operations):

```graphql
query FindM2UIdsByMilestones($milestoneIds: [ID!]!) {
  findM2UIdsByMilestones(milestoneIds: $milestoneIds) {
    _id
    milestoneId
  }
}
```

### Resource Allocation Queries

#### findAllocationsByM2U

```graphql
query FindAllocationsByM2U($m2uId: ID!) {
  findAllocationsByM2U(m2uId: $m2uId) {
    _id
    date
    hours
  }
}
```

#### findAllocationsByMilestone

```graphql
query FindAllocationsByMilestone($milestoneId: ID!, $m2uIds: [ID!]!) {
  findAllocationsByMilestone(milestoneId: $milestoneId, m2uIds: $m2uIds) {
    _id
    m2uId
    date
    hours
  }
}
```

#### findAllResourceDailyAllocations

Aggregated allocations view with pagination:

```graphql
query FindAllResourceDailyAllocations(
  $pagination: PaginationInput
  $filter: FilterAllocationsInput
) {
  findAllResourceDailyAllocations(pagination: $pagination, filter: $filter) {
    items {
      m2uId
      fromDate
      toDate
      totalHours
      m2u { _id userId milestone { _id } }
    }
    totalCount
  }
}
```

**Filter Options:**
```typescript
interface FilterAllocationsInput {
  projectId?: ID;    // Filter by project ID
  fromDate?: string; // Start date filter (YYYY-MM-DD)
  toDate?: string;   // End date filter (YYYY-MM-DD)
}
```

### GraphQL Mutations

#### createMilestoneToUser

```graphql
mutation CreateMilestoneToUser($input: CreateMilestoneToUserInput!) {
  createMilestoneToUser(createMilestoneToUserInput: $input) {
    _id
    userId
    milestoneId
  }
}

# Variables
{
  "input": {
    "userId": "user-123",
    "milestoneId": "milestone-456",
    "startDate": "2024-01-01",
    "endDate": "2024-06-30",
    "isDraft": false
  }
}
```

#### updateMilestoneToUser

```graphql
mutation UpdateMilestoneToUser($input: UpdateMilestoneToUserInput!) {
  updateMilestoneToUser(updateMilestoneToUserInput: $input) {
    _id
    startDate
    endDate
  }
}
```

#### removeMilestoneToUser

```graphql
mutation RemoveMilestoneToUser($id: ID!) {
  removeMilestoneToUser(id: $id) {
    _id
    userId
    milestoneId
  }
}
```

### Batch Mutations

#### createAssignmentsForUser

```graphql
mutation CreateAssignmentsForUser(
  $userId: ID!
  $milestoneIds: [ID!]!
  $startDates: [String!]
  $endDates: [String!]
) {
  createAssignmentsForUser(
    userId: $userId
    milestoneIds: $milestoneIds
    startDates: $startDates
    endDates: $endDates
  )
}
```

#### updateAssignmentsForUser

Replaces all milestone assignments for a user:

```graphql
mutation UpdateAssignmentsForUser(
  $userId: ID!
  $milestoneIds: [ID!]!
  $startDates: [String!]
  $endDates: [String!]
) {
  updateAssignmentsForUser(
    userId: $userId
    milestoneIds: $milestoneIds
    startDates: $startDates
    endDates: $endDates
  )
}
```

#### deleteAssignmentsForUser

```graphql
mutation DeleteAssignmentsForUser($userId: ID!) {
  deleteAssignmentsForUser(userId: $userId)
}
```

#### createMilestoneToUserForMilestone

```graphql
mutation CreateMilestoneToUserForMilestone(
  $milestoneId: ID!
  $userIds: [ID!]!
  $startDates: [String!]
  $endDates: [String!]
) {
  createMilestoneToUserForMilestone(
    milestoneId: $milestoneId
    userIds: $userIds
    startDates: $startDates
    endDates: $endDates
  )
}
```

### Resource Allocation Mutations

#### upsertResourceDailyAllocation

```graphql
mutation UpsertResourceDailyAllocation($input: UpsertResourceDailyAllocationInput!) {
  upsertResourceDailyAllocation(input: $input) {
    _id
    m2uId
    date
    hours
  }
}

# Variables
{
  "input": {
    "m2uId": "m2u-123",
    "date": "2024-03-15",
    "hours": 8
  }
}
```

#### bulkUpsertResourceDailyAllocations

```graphql
mutation BulkUpsertResourceDailyAllocations(
  $ops: [UpsertResourceDailyAllocationInput!]!
) {
  bulkUpsertResourceDailyAllocations(ops: $ops)
}
```

#### shiftAllocations

Shifts allocations when milestone dates change:

```graphql
mutation ShiftAllocations($input: ShiftAllocationsInput!) {
  shiftAllocations(input: $input)
}

# Variables
{
  "input": {
    "m2uIds": ["m2u-1", "m2u-2"],
    "deltaCalendarDays": 7,
    "newMilestoneStart": "2024-02-01",
    "newMilestoneEnd": "2024-04-30",
    "excludeWeekends": true,
    "holidayDates": ["2024-02-14"]
  }
}
```

#### rescaleAllocations

Rescales allocations when milestone duration changes:

```graphql
mutation RescaleAllocations($input: RescaleAllocationsInput!) {
  rescaleAllocations(input: $input)
}

# Variables
{
  "input": {
    "m2uIds": ["m2u-1"],
    "oldStart": "2024-01-01",
    "oldEnd": "2024-03-31",
    "newStart": "2024-01-15",
    "newEnd": "2024-04-15",
    "excludeWeekends": true,
    "holidayDates": []
  }
}
```

#### deleteAllAllocationsByM2U

```graphql
mutation DeleteAllAllocationsByM2U($m2uId: ID!) {
  deleteAllAllocationsByM2U(m2uId: $m2uId)
}
```

## RPC Patterns

### Message Patterns

| Pattern | Payload | Response |
|---------|---------|----------|
| `FIND_MILESTONE_TO_USER_BY_USER_ID` | `userId: string` | `MilestoneToUser[]` |
| `FIND_MILESTONE_TO_USER_BY_MILESTONE_ID` | `milestoneId: string` | `MilestoneToUser[]` |

### Event Patterns

| Pattern | Payload | Source |
|---------|---------|--------|
| `USER_CREATED` | `{ userId, assignedMilestoneIds }` | Users |
| `USER_UPDATED` | `{ userId, assignedMilestoneIds }` | Users |
| `USER_DELETED` | `{ userId }` | Users |
| `USER_HARD_DELETED` | `{ userId }` | Users |
| `MILESTONE_CREATED` | `{ milestoneId, assignedUserIds, assignmentStartDates, assignmentEndDates }` | Milestones |
| `MILESTONE_UPDATED` | `{ milestoneId, assignedUserIds, assignmentStartDates, assignmentEndDates }` | Milestones |
| `MILESTONE_DELETED` | `{ milestoneId }` | Milestones |
| `PERMISSIONS_CHANGED` | `{ groupIds }` | Grants |

## Business Rules

### Draft Slots

Draft slots are placeholder assignments without a specific user:
- `isDraft: true`
- `userId` is null
- `roleCategoryId` specifies the required role
- Used for planning before assigning specific resources

### Date Overrides

Each assignment can override the milestone's default dates:
- `startDate` and `endDate` are optional
- If not specified, the milestone's dates are used
- Allows per-user date ranges within the same milestone

## Configuration

### Environment Variables

```ini
# Service Config
MILESTONE_TO_USER_SERVICE_NAME=milestone-to-user
MILESTONE_TO_USER_SERVICE_PORT=3006
MILESTONE_TO_USER_DB_HOST=milestone-to-user-db
MILESTONE_TO_USER_DB_PORT=9006

# MongoDB
MONGODB_URI=mongodb://milestone-to-user-db:27017/milestone-to-user

# Dependencies
MILESTONE_TO_USER_DEPENDENCIES=[]

# Redis
REDIS_SERVICE_HOST=redis
REDIS_SERVICE_TLS_PORT=6380
```

## File Structure

```
apps/milestone-to-user/
├── src/
│   ├── main.ts
│   ├── milestone-to-user.module.ts
│   ├── milestone-to-user.controller.ts   # RPC handlers
│   ├── milestone-to-user.resolver.ts     # GraphQL queries/mutations
│   ├── milestone-to-user.service.ts      # Business logic
│   ├── m2u-context.ts                    # Subgraph context
│   ├── schemas/
│   │   ├── milestone-to-user.schema.ts
│   │   └── resource-daily-allocation.schema.ts
│   ├── entities/
│   │   ├── user.entity.ts
│   │   ├── milestone.entity.ts
│   │   └── role-category.entity.ts
│   └── dto/
│       ├── create-milestone-to-user.input.ts
│       ├── update-milestone-to-user.input.ts
│       ├── filter-milestone-to-user.input.ts
│       ├── upsert-resource-daily-allocation.input.ts
│       ├── shift-allocations.input.ts
│       ├── rescale-allocations.input.ts
│       ├── aggregated-allocation.output.ts
│       └── paginated-milestone-to-user.output.ts
├── Dockerfile
└── README.md
```

## Next Steps

- [Users Service](/services/users) - User management
- [Milestones Service](/services/milestones) - Milestone management
- [MilestoneToProject Service](/services/milestone-to-project) - Project-milestone relationships
