# Users Service

The Users service owns the **User** entity — the central domain object representing people in the system. Users have nested sub-documents for authentication data, personal information, employment details, and organizational metadata.

## Overview

| Property | Value |
|----------|-------|
| Port | 3002 |
| Database | `users_{tenantSlug}` |
| Collection | `users` |
| Module | `UsersModule` |
| Context | `UsersContext` (request-scoped) |

### Domain Entities

| Entity | Description |
|--------|-------------|
| `User` | Core user record with nested AuthData, PersonalData, EmploymentData, AdditionalFieldsData |
| `AuthDataSchema` | Name, surname, email, password (deprecated — now in platform DB), groupIds |
| `PersonalDataSchema` | Date of birth, place of birth, citizenship, languages |
| `EmploymentDataSchema` | Employment dates, costs, RAL, rates, location |
| `AdditionalFieldsDataSchema` | Job roles, seniority level, supervisors, company, active status, avatar color, billable |

## Architecture

### Module Structure

```
UsersModule
├── TenantDatabaseModule.forService('users')
├── ConfigModule (global)
├── RedisClientsModule
│   ├── GRANTS_SERVICE
│   ├── MILESTONE_TO_USER_SERVICE
│   ├── GROUP_ASSIGNMENTS_SERVICE
│   ├── AUTH_SERVICE
│   └── ORGANIZATION_SERVICE
├── KeycloakM2MModule
├── MicroservicesOrchestratorModule
└── GraphQLModule (ApolloFederationDriver)
    └── orphanedTypes: [JobRole, SeniorityLevel, Company]

Controllers: UsersController
Resolvers: UsersResolver, AdditionalFieldsResolver
```

## User Schema

```typescript
@Directive('@key(fields: "_id")')
@Schema({ timestamps: true })
class User {
  _id: string                              // Federation key
  authData: AuthDataSchema                 // name, surname, email, password (nested)
  personalData?: PersonalDataSchema        // DOB, citizenship, languages (nested)
  employmentData?: EmploymentDataSchema    // dates, costs, RAL (nested)
  additionalFieldsData?: AdditionalFieldsDataSchema  // roles, seniority, supervisors (nested)
  milestones?: MilestoneToUser[]          // Federation — resolved via RPC
  subordinates?: User[]                    // Self-reference — supervisor hierarchy
  tenantId?: string                        // Defence-in-depth
  deletedAt?: Date                         // Soft delete timestamp
  deletedBy?: string                       // Who deleted this user
  updatedBy?: string                       // Last updater
  createdAt?: Date
  updatedAt?: Date
}
```

### Nested Schemas

**AuthDataSchema:**
```
name: string (required)
surname: string (required)
email: string (required, unique with deletedAt index)
password: string (required — @deprecated, kept for backward compat)
groupIds: string[] (virtual — resolved via GroupAssignments RPC)
```

**PersonalDataSchema:**
```
dateOfBirth?: string
placeOfBirth?: string
citizenship?: string
languages?: [{code: string, level: number}]  // ISO 639-1, proficiency 1-5
dateOfCreation?: string
```

**EmploymentDataSchema:**
```
dateOfEmployment?: string
endDate?: string
companyCosts?: number
RAL?: number
rates?: number
location?: string
```

**AdditionalFieldsDataSchema:**
```
jobRoleIds: ObjectId[]         → resolved via Federation to JobRole[]
seniorityLevelId?: ObjectId    → resolved via Federation to SeniorityLevel
supervisorIds: ObjectId[]      → resolved to User[] via self-query
companyId?: ObjectId           → resolved via Federation to Company
active?: boolean
avatarColor?: number           // 1-10, assigned at creation
billable: boolean              // default: false
```

### Indexes

| Fields | Type | Purpose |
|--------|------|---------|
| `{additionalFieldsData.supervisorIds, deletedAt}` | Compound | Subordinate queries |
| `{authData.groupIds, deletedAt}` | Compound | Filter by group |
| `{authData.email, deletedAt}` | Compound unique | Email uniqueness |

## GraphQL Schema

### Queries

| Query | Args | Return | Description |
|-------|------|--------|-------------|
| `findAllUsers` | `pagination?, filter?: UserFilterInput, sort?: SortInput` | `PaginatedUsers!` | List users with optional filtering/pagination |
| `findOneUser` | `userId: ID!, includeDeleted?: Boolean` | `User!` | Get single user. `@ScopeCapable('userId')` — scope=SELF restricts to own profile |
| `getUserFilterCounts` | — | `UserFilterCounts!` | Aggregated counts for filter sidebar (status, seniority, jobRole, supervisor, company) |
| `findDeletedUsers` | `filter?, sort?` | `PaginatedUsers!` | List soft-deleted users |

### Mutations

| Mutation | Args | Return | Description |
|----------|------|--------|-------------|
| `createUser` | `createUserInput: CreateUserInput!` | `User!` | Create user. Emits USER_CREATED to M2U + GA |
| `updateUser` | `updateUserInput: UpdateUserInput!` | `User!` | Update user. `@ScopeCapable('updateUserInput._id')`. Emits USER_UPDATED to M2U + GA |
| `removeUser` | `userId: ID!` | `DeleteUserOutput!` | Soft delete. Anti-self-delete guard. Emits USER_DELETED to Auth + M2U + GA |
| `restoreUser` | `userId: ID!` | `User!` | Restore soft-deleted user |
| `hardDeleteUser` | `userId: ID!` | `DeleteUserOutput!` | Permanent deletion |

### ResolveField

| Field | On | Returns | Description |
|-------|-----|---------|-------------|
| `subordinates` | `User` | `[User]` | Users where `supervisorIds` contains this user's `_id`. `@CheckFieldView` enforced |
| `milestones` | `User` | `[MilestoneToUser]` | Federation stubs via `FIND_MILESTONE_TO_USER_BY_USER_ID` RPC |
| `groupIds` | `AuthDataSchema` | `[ID]` | Live group IDs via `FIND_GROUP_ASSIGNMENTS_BY_USER_ID` RPC |

### Federation

- `@ResolveReference()` — resolves `User` entity by `_id`
- **orphanedTypes**: `JobRole`, `SeniorityLevel`, `Company` (stubs for organization entities)

## RPC Patterns

### MessagePattern Handlers

| Pattern | Input | Output | Purpose |
|---------|-------|--------|---------|
| `USER_EXISTS` | `string \| {id}` | `boolean` | Check if user exists |
| `CREATE_USER` | `CreateUserInput` | `User` | Create user (bootstrap) |
| `FIND_USER_BY_EMAIL` | `{email, forAuth?}` | `{_id, password?, groupIds} \| null` | Find by email. `forAuth=true` returns password hash (deprecated) |
| `FIND_USER_WITH_PASSWORD` | `{userId}` | `{_id, password, email} \| null` | Get password hash (for changePassword) |
| `UPDATE_USER` | `UpdateUserInput` | `User` | Update user (bootstrap) |
| `UPDATE_USER_PASSWORD` | `{userId, newPasswordHash}` | void | Update password hash (pre-hashed) |
| `FIND_GROUPIDS_BY_USERID` | `{userId}` | `{groupIds: string[]}` | Get group IDs for a user |
| `GET_ORG_ENTITY_USAGE_COUNT` | `{field, id}` | `number` | Count users referencing a lookup entity |

### EventPattern Handlers

| Pattern | Input | Action |
|---------|-------|--------|
| `USER_DELETED` | `{userId}` | No-op (service already notified dependents directly) |
| `USER_GROUPS_CHANGED` | `{userId}` | Sync `authData.groupIds` in user document from GroupAssignments |
| `PERMISSIONS_CHANGED` | `{groupIds}` | Invalidate local permission cache |

### Outbound Events

| Target | Pattern | When |
|--------|---------|------|
| Auth | `USER_DELETED` | After soft/hard delete |
| MilestoneToUser | `USER_CREATED`, `USER_UPDATED`, `USER_DELETED`, `USER_HARD_DELETED` | After CRUD |
| GroupAssignments | `USER_CREATED`, `USER_UPDATED`, `USER_DELETED`, `USER_HARD_DELETED` | After CRUD |

## Business Logic

### Soft Delete

```typescript
async remove(userId: string, viewable?: Set<string>, requestUserId?: string) {
  // 1. Find user, throw if not found
  // 2. Set deletedAt = now, deletedBy = requestUserId
  // 3. Set additionalFieldsData.active = false
  // 4. Emit USER_DELETED to auth, mt2u, ga
  // 5. Return deleted user (with field projection)
}
```

### Anti-Self-Delete

```typescript
if (requestUserId && requestUserId === userId) {
  throw new ForbiddenException('You cannot delete your own account');
}
```

### Supervisor Hierarchy

Users can have multiple supervisors via `additionalFieldsData.supervisorIds`. The `subordinates` ResolveField queries users where `supervisorIds` contains the parent user's `_id`.

### AdditionalFieldsResolver

Resolves organization references on `AdditionalFieldsDataSchema`:
- `seniorityLevel` → `{ __typename: 'SeniorityLevel', _id: data.seniorityLevelId }`
- `jobRoles` → `data.jobRoleIds.map(id => ({ __typename: 'JobRole', _id: id }))`
- `company` → `{ __typename: 'Company', _id: data.companyId }`
- `supervisors` → Direct DB query for users by IDs (same service)

### User Filter Counts

Single MongoDB aggregation that returns counts for the filter sidebar:
- Active/inactive/deleted counts
- Count per seniority level
- Count per job role
- Count per supervisor
- Count per company
