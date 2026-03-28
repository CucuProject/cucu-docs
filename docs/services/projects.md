# Projects Service

The Projects service manages **projects**, **project templates**, **template phases**, and **template sharing**. It's one of the richer services with multiple sub-domains.

## Overview

| Property | Value |
|----------|-------|
| Port | 3003 |
| Database | `projects_{tenantSlug}` |
| Collections | `projectdocuments`, `projecttemplates`, `projecttemplatephases`, `projecttemplateshares` |
| Module | `ProjectsModule` |
| Context | `ProjectsContext` (request-scoped) |

## Schemas

### Project

```typescript
@Directive('@key(fields: "_id")')
class Project {
  _id: string
  projectBasicData: ProjectBasicData {
    name: string
    description: string
    startDate: string
    endDate: string
    status: ProjectStatus        // ACTIVE | COMPLETED | ON_HOLD | ARCHIVED
    excludeWeekends: boolean     // default: false
    countryCode?: string         // ISO 3166-1 alpha-2 for holiday calendar lookup
  }
  milestones?: MilestoneToProject[]  // Federation
  tenantId?: string
  deletedAt?: Date
}

// Indexes: name+deletedAt, status+deletedAt, startDate+deletedAt, endDate+deletedAt, deletedAt
```

### ProjectTemplate

```typescript
class ProjectTemplate {
  _id: string
  name: string
  description?: string
  scope: ProjectTemplateScope    // SYSTEM | PRIVATE | SHARED
  createdBy?: string             // User ID who created the template
  phases?: ProjectTemplatePhase[]  // Resolved via ResolveField
  shares?: ProjectTemplateShare[]  // Resolved via ResolveField
}
```

### ProjectTemplatePhase

```typescript
class ProjectTemplatePhase {
  _id: string
  templateId: string
  name: string
  orderIndex: number
  isRequired: boolean
  percentage?: number            // % of project effort
  roleCategoryId?: string        // → RoleCategory (organization)
}
```

## GraphQL Schema

### Project Queries & Mutations

| Operation | Type | Args | Return |
|-----------|------|------|--------|
| `findAllProjects` | Query | `pagination?, filter?: ProjectFilterInput, sort?` | `PaginatedProjects!` |
| `findOneProject` | Query | `projectId: ID!` | `Project!` |
| `createProject` | Mutation | `createProjectInput` | `Project!` |
| `updateProject` | Mutation | `updateProjectInput` | `Project!` |
| `removeProject` | Mutation | `projectId: ID!` | `DeleteProjectOutput!` |

### Template Queries & Mutations

| Operation | Type | Args | Return |
|-----------|------|------|--------|
| `findAllProjectTemplates` | Query | `scope?: ProjectTemplateScope` | `[ProjectTemplate]!` |
| `findOneProjectTemplate` | Query | `templateId: ID!` | `ProjectTemplate!` |
| `createProjectTemplate` | Mutation | `input` | `ProjectTemplate!` |
| `updateProjectTemplate` | Mutation | `input` | `ProjectTemplate!` |
| `deleteProjectTemplate` | Mutation | `templateId: ID!` | `DeleteProjectTemplateOutput!` |
| `shareProjectTemplate` | Mutation | `input: ShareProjectTemplateInput!` | `[ProjectTemplateShare]!` |
| `unshareProjectTemplate` | Mutation | `input: UnshareProjectTemplateInput!` | `Boolean!` |

### Phase Queries & Mutations

| Operation | Type | Args | Return |
|-----------|------|------|--------|
| `findPhasesByTemplate` | Query | `templateId: ID!` | `[ProjectTemplatePhase]!` |
| `createProjectTemplatePhase` | Mutation | `input` | `ProjectTemplatePhase!` |
| `updateProjectTemplatePhase` | Mutation | `input` | `ProjectTemplatePhase!` |
| `deleteProjectTemplatePhase` | Mutation | `phaseId: ID!` | `DeleteProjectTemplateOutput!` |

### ResolveField

| Field | On | Returns | Description |
|-------|-----|---------|-------------|
| `milestones` | `Project` | `[MilestoneToProject]` | Via `FIND_MILESTONE_TO_PROJECT_BY_PROJECT_ID` RPC |
| `phases` | `ProjectTemplate` | `[ProjectTemplatePhase]` | Direct DB query |
| `shares` | `ProjectTemplate` | `[ProjectTemplateShare]` | Direct DB query |

## RPC Patterns

| Pattern | Input | Output | Purpose |
|---------|-------|--------|---------|
| `PROJECT_EXISTS` | `string \| {id}` | `boolean` | Check existence |
| `GET_PROJECT_DATES` | `string` | `{startDate, endDate}` | Get project date range |
| `FIND_PROJECT_BY_NAME` | `string` | `Project \| null` | Find by name (bootstrap) |
| `CREATE_PROJECT` | `{projectBasicData, assignedMilestoneIds?}` | `Project` | Create (bootstrap) |
| `CREATE_PROJECT_TEMPLATE` | `{name, description?, scope, createdBy?}` | `ProjectTemplate` | Create template (bootstrap) |
| `FIND_PROJECT_TEMPLATE_BY_NAME` | `string` | `ProjectTemplate \| null` | Find template (bootstrap) |
| `FIND_TEMPLATE_PHASES_BY_TEMPLATE_ID` | `string` | `ProjectTemplatePhase[]` | Get phases (bootstrap) |
| `CREATE_PROJECT_TEMPLATE_PHASE` | `{templateId, name, orderIndex, ...}` | `ProjectTemplatePhase` | Create phase (bootstrap) |
| `SEED_PROJECT_TEMPLATES` | — | `void` | Trigger template seeding (called by bootstrap) |
| `GET_PROJECTS_STATUS` | `{ ids: string[] }` | `Array<{ projectId: string, status: string }>` | Batch status check (returns `NOT_FOUND` for missing IDs) |

### Outbound Events

| Target | Pattern | When |
|--------|---------|------|
| MilestoneToProject | `PROJECT_CREATED` | After project creation |
| MilestoneToProject | `PROJECT_UPDATED` | After project update |
| MilestoneToProject | `PROJECT_DELETED` | After project deletion |

## Template Seeding

The `seedTemplates()` function is now exposed as a `SEED_PROJECT_TEMPLATES` RPC endpoint. The Bootstrap service calls this RPC per tenant to seed default project templates:

```typescript
@MessagePattern('SEED_PROJECT_TEMPLATES')
async seedProjectTemplates() {
  await this.projectTemplateService.seedTemplates();
}
```

This change allows template seeding to run with proper tenant context, rather than requiring `onModuleInit` to guess the tenant.

### Template Visibility

Templates have three scopes:
- **SYSTEM** — visible to all users (seeded at startup)
- **PRIVATE** — visible only to the creator
- **SHARED** — visible to specific users/groups via `ProjectTemplateShare`

The `findAllProjectTemplates` resolver filters by scope, `currentUserId`, and group memberships.
