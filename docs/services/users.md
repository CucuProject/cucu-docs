# Users Service

The Users service manages **user profiles, authentication data, and organizational assignments** in the Cucu platform.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 3002 |
| **Database** | users-db (MongoDB, port 9002) |
| **Role** | User CRUD, profiles, lookup tables |
| **Dependencies** | Grants |

## Schema

### User Entity

```typescript
interface User {
  _id: ID;

  authData: {
    name: string;              // Max 100 chars
    surname: string;           // Max 100 chars
    email: string;             // Unique, valid email
    password: string;          // Hashed, NOT exposed via GraphQL
    groupIds: string[];        // Synced from GroupAssignments
  };

  personalData?: {
    dateOfBirth: string;       // ISO 8601, min 16 years old
    placeOfBirth: string;
    citizenship: string;
    languages?: {
      code: string;            // ISO 639-1 (e.g., "en", "it")
      level: number;           // 1-5
    }[];
    dateOfCreation: string;    // Auto-set if not provided
  };

  employmentData?: {
    dateOfEmployment: string;  // ISO 8601
    endDate?: string;          // Must be after dateOfEmployment
    companyCosts: number;      // 0-10,000,000
    RAL: number;               // 0-10,000,000
    rates?: number;            // 0-10,000, only if billable=true
    location: string;          // Max 200 chars
  };

  additionalFieldsData?: {
    jobRoleIds: string[];      // Max 10 items
    active: boolean;           // Required
    seniorityLevelId?: string;
    supervisorIds?: string[];  // Max 10, validated for circular deps
    companyId?: string;
    avatarColor?: number;      // 1-10, auto-assigned
    billable: boolean;         // Default false
  };

  // Resolved via field resolvers
  milestones?: MilestoneToUser[];
  subordinates?: User[];

  // Audit fields
  deletedAt?: Date;
  deletedBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

## API Reference

### GraphQL Queries

#### findAllUsers

```graphql
query FindAllUsers(
  $pagination: PaginationInput
  $filter: UserFilterInput
  $sort: SortInput
) {
  findAllUsers(pagination: $pagination, filter: $filter, sort: $sort) {
    items {
      _id
      authData { name surname email }
      additionalFieldsData {
        active
        seniorityLevel { _id name }
        jobRoles { _id name }
        supervisors { _id authData { name } }
      }
    }
    totalCount
    hasNextPage
  }
}
```

**Filter Options:**
```typescript
interface UserFilterInput {
  name?: string;           // Case-insensitive substring
  surname?: string;        // Case-insensitive substring
  email?: string;          // Case-insensitive substring
  active?: boolean;
  seniorityLevelId?: string;
  jobRoleIds?: string[];   // Users with any of these roles
  supervisorId?: string;   // Users with this supervisor
  groupId?: string;        // Users in this group
  companyId?: string;
  search?: string;         // Full-text search across name, surname, email
}
```

#### findOneUser

```graphql
query FindOneUser($userId: String!, $includeDeleted: Boolean) {
  findOneUser(userId: $userId, includeDeleted: $includeDeleted) {
    _id
    authData { name surname email }
    personalData { dateOfBirth citizenship }
    employmentData { dateOfEmployment location RAL }
    additionalFieldsData {
      active
      billable
      avatarColor
    }
    subordinates { _id authData { name } }
    milestones { _id startDate endDate }
  }
}
```

#### getUserFilterCounts

```graphql
query {
  getUserFilterCounts {
    activeCount
    inactiveCount
    totalCount
    bySeniority { seniorityLevelId count }
    byJobRole { jobRoleId count }
    bySupervisor { supervisorId count }
    byCompany { companyId count }
  }
}
```

### GraphQL Mutations

#### createUser

```graphql
mutation CreateUser($input: CreateUserInput!) {
  createUser(createUserInput: $input) {
    _id
    authData { name email }
  }
}
```

**Input:**
```json
{
  "input": {
    "authData": {
      "name": "John",
      "surname": "Doe",
      "email": "john.doe@example.com",
      "password": "SecurePass123!"
    },
    "personalData": {
      "dateOfBirth": "1990-05-15",
      "placeOfBirth": "Rome",
      "citizenship": "Italian"
    },
    "employmentData": {
      "dateOfEmployment": "2023-01-01",
      "location": "Milan"
    },
    "additionalFieldsData": {
      "active": true,
      "seniorityLevelId": "seniority-123",
      "jobRoleIds": ["role-456"]
    }
  }
}
```

#### updateUser

```graphql
mutation UpdateUser($input: UpdateUserInput!) {
  updateUser(updateUserInput: $input) {
    _id
    authData { name email }
  }
}
```

**Note:** This mutation is **scope-aware**. Users with `scope: 'self'` can only update their own record.

#### removeUser (Soft Delete)

```graphql
mutation RemoveUser($userId: String!) {
  removeUser(userId: $userId) {
    name
    surname
  }
}
```

#### restoreUser

```graphql
mutation RestoreUser($userId: String!) {
  restoreUser(userId: $userId) {
    _id
    authData { name }
    deletedAt
  }
}
```

#### hardDeleteUser

```graphql
mutation HardDeleteUser($userId: String!) {
  hardDeleteUser(userId: $userId) {
    name
    surname
  }
}
```

## RPC Patterns

### Message Patterns

| Pattern | Payload | Response |
|---------|---------|----------|
| `USER_EXISTS` | `userId: string` | `boolean` |
| `CREATE_USER` | `CreateUserInput` | `User` |
| `FIND_USER_BY_EMAIL` | `{ email, forAuth? }` | `{ _id, password?, groupIds }` or `null` |
| `FIND_USER_WITH_PASSWORD` | `{ userId }` | `{ _id, password }` or `null` |
| `UPDATE_USER` | `UpdateUserInput` | `User` |
| `UPDATE_USER_PASSWORD` | `{ userId, newPassword }` | `void` |
| `FIND_GROUPIDS_BY_USERID` | `{ userId }` | `{ groupIds: string[] }` |
| `GET_ORG_ENTITY_USAGE_COUNT` | `{ field, id }` | `number` |

### Event Patterns

| Pattern | Payload | Source |
|---------|---------|--------|
| `USER_GROUPS_CHANGED` | `{ userId }` | GroupAssignments |
| `PERMISSIONS_CHANGED` | `{ groupIds }` | Grants |

## Business Rules

### Validation Rules

| Rule | Description |
|------|-------------|
| **Minimum Age** | User must be at least 16 years old |
| **Employment Date** | Must be at least 16 years after birth date |
| **End Date** | Must be after employment date |
| **Rates** | Only allowed when `billable: true` |
| **Supervisor Chain** | No self-reference, no circular dependencies (10 levels max) |
| **Email Uniqueness** | Unique across non-deleted users |

### Soft Delete Behavior

- Sets `deletedAt` timestamp
- Sets `active: false`
- Emits `USER_DELETED` event
- Sessions are revoked
- Assignments are cleaned up by downstream services

### Deactivation Rules

- Cannot deactivate a user with subordinates
- Deactivated users can only be reactivated
- Sessions are revoked on deactivation

## Scope-Aware Operations

The Users service implements scope-aware field filtering:

```typescript
// Resolver with scope enforcement
@ScopeCapable('userId')
@UseGuards(ScopeGuard)
@UseInterceptors(createViewFieldsInterceptor(['User']))
@Query(() => User)
async findOneUser(
  @Args('userId') userId: string,
  @ViewableFields('User') viewable: Set<string>,
): Promise<User>
```

When a user has `scope: 'self'` for an operation:
- They can only access their own record
- Attempting to access another user's record throws `ForbiddenException`

Field-level scoping works similarly:
- Fields with `scope: 'self'` are only visible on the user's own record
- When viewing another user, self-scoped fields are excluded

## Field Resolvers

### subordinates

Returns users who have this user as a supervisor:

```typescript
@ResolveField(() => [User])
async subordinates(@Parent() user: User): Promise<User[]> {
  return this.usersService.findSubordinates(user._id);
}
```

### milestones

Fetches milestone assignments via RPC:

```typescript
@ResolveField(() => [MilestoneToUser])
async milestones(@Parent() user: User): Promise<MilestoneToUser[]> {
  const rows = await lastValueFrom(
    this.milestoneToUserClient.send(
      'FIND_MILESTONE_TO_USER_BY_USER_ID',
      user._id
    )
  );
  return rows.map(r => ({ __typename: 'MilestoneToUser', _id: r._id }));
}
```

### groupIds

Fetches group IDs from GroupAssignments service:

```typescript
@ResolveField(() => [ID])
async groupIds(@Parent() auth: AuthDataSchema): Promise<string[]> {
  const assignments = await lastValueFrom(
    this.groupAssignmentsClient.send(
      'FIND_GROUP_ASSIGNMENTS_BY_USER_ID',
      auth._userId
    )
  );
  return assignments.map(a => a.groupId);
}
```

## Configuration

### Environment Variables

```ini
# Service Config
USERS_SERVICE_NAME=users
USERS_SERVICE_PORT=3002
USERS_DB_HOST=users-db
USERS_DB_PORT=9002

# MongoDB
MONGODB_URI=mongodb://users-db:27017/users

# Dependencies
USERS_DEPENDENCIES=["grants"]

# Redis
REDIS_SERVICE_HOST=redis
REDIS_SERVICE_TLS_PORT=6380
```

### Database Indexes

```typescript
UserSchema.index({ 'authData.email': 1, deletedAt: 1 }, { unique: true });
UserSchema.index({ 'additionalFieldsData.supervisorIds': 1, deletedAt: 1 });
UserSchema.index({ 'authData.groupIds': 1, deletedAt: 1 });
```

## Events Emitted

### USER_CREATED

```typescript
this.milestoneToUserClient.emit('USER_CREATED', {
  userId: user._id,
  milestoneIds: input.assignedMilestoneIds,
});

this.groupAssignmentsClient.emit('USER_CREATED', {
  userId: user._id,
  groupIds: input.authData.groupIds,
});
```

### USER_UPDATED

```typescript
this.milestoneToUserClient.emit('USER_UPDATED', {
  userId: user._id,
  milestoneIds: input.assignedMilestoneIds,
});
```

### USER_DELETED

```typescript
this.authClient.emit('USER_DELETED', { userId });
this.milestoneToUserClient.emit('USER_DELETED', { userId });
this.groupAssignmentsClient.emit('USER_DELETED', { userId });
```

## File Structure

```
apps/users/
├── src/
│   ├── main.ts
│   ├── users.module.ts
│   ├── users.controller.ts        # RPC handlers
│   ├── users.resolver.ts          # GraphQL queries/mutations
│   ├── users.service.ts           # Business logic
│   ├── users.context.ts           # Subgraph context
│   ├── schemas/
│   │   └── user.schema.ts         # Mongoose schema
│   ├── entities/
│   │   ├── user.entity.ts         # GraphQL types
│   │   ├── job-role.entity.ts     # Federation stub
│   │   ├── seniority-level.entity.ts
│   │   └── company.entity.ts
│   ├── dto/
│   │   ├── create-user.input.ts
│   │   ├── update-user.input.ts
│   │   └── user-filter.input.ts
│   └── resolvers/
│       └── additional-fields.resolver.ts
├── Dockerfile
└── README.md
```

## Next Steps

- [Grants Service](/services/grants) - Permission management
- [Permission System](/architecture/permissions) - How permissions apply to users
- [Add New Field Guide](/guides/add-new-field) - Adding fields to User
