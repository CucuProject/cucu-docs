# Projects Service

The Projects service manages **project entities** and **project templates** in the Cucu platform.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 3003 |
| **Database** | projects-db (MongoDB, port 9003) |
| **Role** | Project CRUD, templates, holiday calendars |
| **Dependencies** | MilestoneToProject |

## Schema

### Project

```typescript
interface Project {
  _id: ID;
  projectBasicData: {
    name: string;              // Required
    description: string;       // Required
    startDate: string;         // ISO 8601 date
    endDate: string;           // ISO 8601 date, must be >= startDate
    status: ProjectStatus;     // DRAFT, ACTIVE, ARCHIVED
    excludeWeekends?: boolean; // Whether to exclude weekends from calculations
    countryCode?: string;      // Country code for holiday calendar
  };
  milestones?: MilestoneToProject[];  // Resolved via federation
  deletedAt?: Date;            // Soft delete timestamp
  createdAt: Date;
  updatedAt: Date;
}

enum ProjectStatus {
  DRAFT = 'DRAFT'
  ACTIVE = 'ACTIVE'
  ARCHIVED = 'ARCHIVED'
}
```

### ProjectTemplate

```typescript
interface ProjectTemplate {
  _id: ID;
  name: string;
  description?: string;
  createdBy: string;                // User ID who created the template
  scope: ProjectTemplateScope;      // SYSTEM, PUBLIC, PERSONAL, SHARED
  customColors?: string[];          // Custom color palette for milestones
  minAllocation?: number;           // Minimum allocation percentage
  phases: ProjectTemplatePhase[];   // Template phases
  shares: ProjectTemplateShare[];   // Sharing configuration
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

enum ProjectTemplateScope {
  SYSTEM = 'SYSTEM'     // Admin/seed templates
  PUBLIC = 'PUBLIC'     // Visible to all users
  PERSONAL = 'PERSONAL' // Private to creator
  SHARED = 'SHARED'     // Shared with specific users/groups
}
```

### ProjectTemplatePhase

```typescript
interface ProjectTemplatePhase {
  _id: ID;
  templateId: ID;
  name: string;
  orderIndex: number;      // Sort order
  isRequired: boolean;     // Whether phase is mandatory
  percentage?: number;     // Percentage of project duration
  roleCategoryId?: ID;     // Associated role category
  color?: string;          // Hex color for UI
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

## API Reference

### GraphQL Queries

#### findAllProjects

```graphql
query FindAllProjects(
  $pagination: PaginationInput
  $filter: ProjectFilterInput
  $sort: SortInput
) {
  findAllProjects(pagination: $pagination, filter: $filter, sort: $sort) {
    items {
      _id
      projectBasicData {
        name
        description
        startDate
        endDate
        status
      }
      milestones { _id }
    }
    totalCount
    hasNextPage
  }
}
```

**Filter Options:**
```typescript
interface ProjectFilterInput {
  name?: string;          // Case-insensitive substring match
  startDateFrom?: string; // Filter by start date range (inclusive)
  startDateTo?: string;
  endDateFrom?: string;   // Filter by end date range (inclusive)
  endDateTo?: string;
  status?: ProjectStatus; // Filter by status
}
```

#### findOneProject

```graphql
query FindOneProject($projectId: String!) {
  findOneProject(projectId: $projectId) {
    _id
    projectBasicData {
      name
      description
      startDate
      endDate
      status
      excludeWeekends
      countryCode
    }
    milestones {
      _id
      milestone { _id name }
      startDate
      endDate
    }
  }
}
```

#### findAllProjectTemplates

```graphql
query FindAllProjectTemplates($scope: ProjectTemplateScope) {
  findAllProjectTemplates(scope: $scope) {
    _id
    name
    description
    scope
    phases {
      _id
      name
      orderIndex
      isRequired
      percentage
    }
  }
}
```

#### holidayCalendars

```graphql
query HolidayCalendars(
  $countryCodes: [String!]!
  $startYear: Int!
  $endYear: Int!
) {
  holidayCalendars(
    countryCodes: $countryCodes
    startYear: $startYear
    endYear: $endYear
  ) {
    _id
    countryCode
    countryName
    year
    holidays {
      date
      name
    }
  }
}
```

#### availableHolidayCountries

```graphql
query AvailableHolidayCountries {
  availableHolidayCountries {
    countryCode
    countryName
  }
}
```

### GraphQL Mutations

#### createProject

```graphql
mutation CreateProject($input: CreateProjectInput!) {
  createProject(createProjectInput: $input) {
    _id
    projectBasicData {
      name
      status
    }
  }
}

# Variables
{
  "input": {
    "projectBasicData": {
      "name": "Q1 2024 Release",
      "description": "First quarter product release",
      "startDate": "2024-01-01",
      "endDate": "2024-03-31",
      "status": "ACTIVE",
      "excludeWeekends": true,
      "countryCode": "IT"
    },
    "assignedMilestoneIds": ["milestone-1", "milestone-2"]
  }
}
```

#### updateProject

```graphql
mutation UpdateProject($input: UpdateProjectInput!) {
  updateProject(updateProjectInput: $input) {
    _id
    projectBasicData {
      name
      status
    }
  }
}

# Variables
{
  "input": {
    "_id": "project-123",
    "projectBasicData": {
      "status": "ARCHIVED"
    },
    "assignedMilestoneIds": ["milestone-3"]
  }
}
```

#### removeProject

Soft deletes a project:

```graphql
mutation RemoveProject($projectId: String!) {
  removeProject(projectId: $projectId) {
    name
    description
  }
}
```

### Project Template Mutations

#### createProjectTemplate

```graphql
mutation CreateProjectTemplate($input: CreateProjectTemplateInput!) {
  createProjectTemplate(input: $input) {
    _id
    name
    scope
  }
}

# Variables
{
  "input": {
    "name": "Standard Sprint",
    "description": "Two-week sprint template",
    "scope": "PUBLIC",
    "customColors": ["#FF5733", "#33FF57"],
    "minAllocation": 0.5
  }
}
```

#### createProjectTemplatePhase

```graphql
mutation CreateProjectTemplatePhase($input: CreateProjectTemplatePhaseInput!) {
  createProjectTemplatePhase(input: $input) {
    _id
    name
    orderIndex
  }
}

# Variables
{
  "input": {
    "templateId": "template-123",
    "name": "Development",
    "orderIndex": 1,
    "isRequired": true,
    "percentage": 60,
    "color": "#4287f5"
  }
}
```

#### shareProjectTemplate

```graphql
mutation ShareProjectTemplate($input: ShareProjectTemplateInput!) {
  shareProjectTemplate(input: $input) {
    _id
    targetType
    targetId
  }
}

# Variables
{
  "input": {
    "templateId": "template-123",
    "targets": [
      { "targetType": "USER", "targetId": "user-456" },
      { "targetType": "GROUP", "targetId": "group-789" }
    ]
  }
}
```

## RPC Patterns

### Message Patterns

| Pattern | Payload | Response |
|---------|---------|----------|
| `PROJECT_EXISTS` | `projectId: string` | `boolean` |
| `GET_PROJECT_DATES` | `projectId: string` | `{ startDate, endDate }` |
| `FIND_PROJECT_BY_NAME` | `name: string` | `Project` or `null` |
| `CREATE_PROJECT` | `CreateProjectInput` | `Project` |
| `CREATE_PROJECT_TEMPLATE` | `CreateProjectTemplateInput` | `ProjectTemplate` |
| `FIND_PROJECT_TEMPLATE_BY_NAME` | `name: string` | `ProjectTemplate` or `null` |
| `CREATE_PROJECT_TEMPLATE_PHASE` | `CreateProjectTemplatePhaseInput` | `ProjectTemplatePhase` |
| `FIND_TEMPLATE_PHASES_BY_TEMPLATE_ID` | `templateId: string` | `ProjectTemplatePhase[]` |

### Event Patterns

| Pattern | Payload | Purpose |
|---------|---------|---------|
| `PERMISSIONS_CHANGED` | `{ groupIds }` | Invalidate permission cache |

## Events Emitted

### PROJECT_CREATED

```typescript
this.milestoneToProjectClient.emit('PROJECT_CREATED', {
  projectId,
  assignedMilestoneIds: createProjectInput.assignedMilestoneIds || [],
});
```

### PROJECT_UPDATED

```typescript
this.milestoneToProjectClient.emit('PROJECT_UPDATED', {
  projectId,
  assignedMilestoneIds: updateProjectInput.assignedMilestoneIds,
});
```

### PROJECT_DELETED

```typescript
this.milestoneToProjectClient.emit('PROJECT_DELETED', {
  projectId,
});
```

## Business Rules

### Validation

| Rule | Description |
|------|-------------|
| **Date Range** | `endDate` must be >= `startDate` |
| **Required Fields** | `name`, `description`, `startDate`, `endDate` are required |
| **Status** | Defaults to `ACTIVE` if not specified |

### Soft Delete

Projects are soft-deleted by setting `deletedAt` timestamp. All queries filter out deleted projects by default.

## Field Resolvers

### milestones

Fetches milestone assignments via RPC:

```typescript
@ResolveField('milestones', () => [MilestoneToProject])
async milestones(@Parent() project: Project): Promise<MilestoneToProject[]> {
  const assignments = await lastValueFrom(
    this.milestoneToProject.send(
      'FIND_MILESTONE_TO_PROJECT_BY_PROJECT_ID',
      project._id
    )
  );
  return assignments.map(a => ({
    __typename: 'MilestoneToProject',
    _id: a._id,
    projectId: a.projectId,
    milestoneId: a.milestoneId,
    startDate: a.startDate,
    endDate: a.endDate,
  }));
}
```

## Configuration

### Environment Variables

```ini
# Service Config
PROJECTS_SERVICE_NAME=projects
PROJECTS_SERVICE_PORT=3003
PROJECTS_DB_HOST=projects-db
PROJECTS_DB_PORT=9003

# MongoDB
MONGODB_URI=mongodb://projects-db:27017/projects

# Dependencies
PROJECTS_DEPENDENCIES=[]

# Redis
REDIS_SERVICE_HOST=redis
REDIS_SERVICE_TLS_PORT=6380
```

## File Structure

```
apps/projects/
├── src/
│   ├── main.ts
│   ├── projects.module.ts
│   ├── projects.controller.ts           # RPC handlers
│   ├── projects.resolver.ts             # GraphQL queries/mutations
│   ├── projects.service.ts              # Business logic
│   ├── projects-context.ts              # Subgraph context
│   ├── project-template.resolver.ts     # Template CRUD
│   ├── project-template.service.ts      # Template business logic
│   ├── holiday-calendar.resolver.ts     # Holiday queries
│   ├── holiday-calendar.service.ts      # Holiday data
│   ├── schemas/
│   │   ├── project.schema.ts
│   │   ├── project-template.schema.ts
│   │   ├── project-template-phase.schema.ts
│   │   └── project-template-share.schema.ts
│   ├── entities/
│   │   └── milestone-to-project.entity.ts
│   ├── enums/
│   │   ├── project-status.enum.ts
│   │   └── project-template-scope.enum.ts
│   ├── dto/
│   │   ├── create-project.input.ts
│   │   ├── update-project.input.ts
│   │   ├── filter-project.input.ts
│   │   └── paginated-project.output.ts
│   └── seeds/
│       └── holiday-data.ts
├── Dockerfile
└── README.md
```

## Next Steps

- [Milestones Service](/services/milestones) - Milestone management
- [MilestoneToProject Service](/services/milestone-to-project) - Project-milestone relationships
- [Project Access Service](/services/project-access) - Project access control
