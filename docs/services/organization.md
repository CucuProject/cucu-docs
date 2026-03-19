# Organization Service

The Organization service manages **lookup tables** for the platform: SeniorityLevel, JobRole, Company, and RoleCategory. These are referenced by the Users service and MilestoneToUser service via GraphQL Federation.

## Overview

| Property | Value |
|----------|-------|
| Port | 3012 |
| Database | `organization_{tenantSlug}` |
| Collections | `senioritylevels`, `jobroles`, `companies`, `rolecategories` |
| Module | `OrganizationModule` |
| Context | `OrganizationContext` (request-scoped) |

## Schemas

### SeniorityLevel

```typescript
@Directive('@key(fields: "_id")')
@Schema({ timestamps: true })
class SeniorityLevel {
  _id: string
  name: string               // required
  order: number              // For display ordering
  description?: string
  tenantId?: string
}
```

### JobRole

```typescript
@Directive('@key(fields: "_id")')
@Schema({ timestamps: true })
class JobRole {
  _id: string
  name: string
  order: number
  description?: string
  roleCategoryId?: string    // → RoleCategory._id
  tenantId?: string
}
```

### Company

```typescript
@Directive('@key(fields: "_id")')
@Schema({ timestamps: true })
class Company {
  _id: string
  name: string
  description?: string
  tenantId?: string
}
```

### RoleCategory

```typescript
@Directive('@key(fields: "_id")')
@Schema({ timestamps: true })
class RoleCategory {
  _id: string
  name: string
  description?: string
  tenantId?: string
}
```

## GraphQL Schema

Each entity has the same CRUD pattern:

### SeniorityLevel

| Operation | Type | Args | Return |
|-----------|------|------|--------|
| `findAllSeniorityLevels` | Query | `filter?` | `[SeniorityLevel]!` |
| `findOneSeniorityLevel` | Query | `id: ID!` | `SeniorityLevel!` |
| `createSeniorityLevel` | Mutation | `input` | `SeniorityLevel!` |
| `updateSeniorityLevel` | Mutation | `input` | `SeniorityLevel!` |
| `removeSeniorityLevel` | Mutation | `id: ID!` | `SeniorityLevel!` |

ResolveField: `usageCount: Int` — count of users with this seniority level (via `GET_ORG_ENTITY_USAGE_COUNT` RPC to Users)

### JobRole

| Operation | Type | Args | Return |
|-----------|------|------|--------|
| `findAllJobRoles` | Query | `filter?` | `[JobRole]!` |
| `findOneJobRole` | Query | `id: ID!` | `JobRole!` |
| `createJobRole` | Mutation | `input` | `JobRole!` |
| `updateJobRole` | Mutation | `input` | `JobRole!` |
| `removeJobRole` | Mutation | `id: ID!` | `JobRole!` |

ResolveFields:
- `roleCategory: RoleCategory` — resolved via `RoleCategoryService.findById()`
- `usageCount: Int` — count of users with this job role

### Company

Same CRUD pattern with `usageCount` ResolveField.

### RoleCategory

Same CRUD pattern (no `usageCount`).

## RPC Patterns

### Batch Lookups

| Pattern | Input | Output | Purpose |
|---------|-------|--------|---------|
| `FIND_SENIORITY_LEVELS_BY_IDS` | `string[]` | `SeniorityLevel[]` | Batch lookup for federation |
| `FIND_JOB_ROLES_BY_IDS` | `string[]` | `JobRole[]` | Batch lookup for federation |
| `FIND_COMPANIES_BY_IDS` | `string[]` | `Company[]` | Batch lookup for federation |
| `FIND_ROLE_CATEGORIES_BY_IDS` | `string[]` | `RoleCategory[]` | Batch lookup for federation |

### Existence Checks

| Pattern | Input | Output |
|---------|-------|--------|
| `JOB_ROLE_EXISTS` | `string` | `boolean` |

### Bootstrap Seeders

| Pattern | Input | Output |
|---------|-------|--------|
| `CREATE_SENIORITY_LEVEL` | `{name, order, description?}` | `SeniorityLevel` |
| `FIND_SENIORITY_LEVEL_BY_NAME` | `string` | `SeniorityLevel \| null` |
| `CREATE_JOB_ROLE` | `{name, order, description?}` | `JobRole` |
| `FIND_JOB_ROLE_BY_NAME` | `string` | `JobRole \| null` |
| `CREATE_ROLE_CATEGORY` | `{name, description?}` | `RoleCategory` |
| `FIND_ROLE_CATEGORY_BY_NAME` | `string` | `RoleCategory \| null` |

## Business Logic

### Referential Integrity

Before deleting a lookup entity, the service checks if it's in use via `GET_ORG_ENTITY_USAGE_COUNT` RPC to the Users service:

```typescript
async remove(id: string): Promise<Entity> {
  const usageCount = await this.getUsageCount(id);
  if (usageCount > 0) {
    throw new ConflictException(`Cannot delete: used by ${usageCount} users`);
  }
  return this.model.findByIdAndDelete(id);
}
```

### Usage Count

The `usageCount` ResolveField queries the Users service to count how many users reference each lookup entity:

```typescript
@ResolveField(() => Int, { name: 'usageCount', nullable: true })
async resolveUsageCount(@Parent() parent: Entity): Promise<number> {
  return this.service.getUsageCount(parent._id);
}
```

The Users service handles this via `GET_ORG_ENTITY_USAGE_COUNT`, which counts documents matching the relevant field path (e.g., `additionalFieldsData.seniorityLevelId`).
