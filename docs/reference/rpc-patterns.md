# RPC Patterns Reference

Complete catalog of all RPC message and event patterns in the Cucu platform.

## Pattern Types

| Type | Description | Response |
|------|-------------|----------|
| **MessagePattern** | Request-Response | Returns value |
| **EventPattern** | Fire-and-Forget | No response |

## Gateway Service

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `INTROSPECT_GATEWAY` | Message | `void` | `{ success: boolean, data: IntrospectionData }` |

## Auth Service

### Orchestrator Patterns (Gateway → Auth)

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `VERIFY_FROM_TOKEN` | Message | `{ refreshToken }` | `{ valid, userId, groups, isPlatformAdmin, memberships }` |
| `GET_ME` | Message | `{ refreshToken }` | `{ authenticated, user, permissions }` |
| `REFRESH_FROM_TOKEN` | Message | `{ refreshToken }` | `{ accessToken, refreshToken, expiresIn }` |
| `SWITCH_FROM_TOKEN` | Message | `{ refreshToken, targetTenantSlug }` | `{ accessToken, refreshToken, userId, tenantSlug }` |

### Session Patterns (Internal)

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `LOGIN` | Message | `{ email, password, ip, deviceName, browserName, deviceFingerprint }` | `{ accessToken, refreshToken, userId, sessionId, expiresIn }` |
| `CREATE_AUTHENTICATED_SESSION` | Message | `{ userId, email, tenantSlug?, tenantId?, ip, deviceName, browserName, deviceFingerprint }` | `{ accessToken, refreshToken, userId, sessionId, expiresIn }` |
| `CHECK_SESSION` | Message | `{ sessionId }` | `{ isValid, userId?, groupIds?, reason? }` |
| `REFRESH_SESSION` | Message | `{ refreshToken }` | `{ accessToken, newRefreshToken, userId, sessionId, expiresIn }` |
| `REVOKE_SESSION` | Message | `{ sessionId, requestUserId, force }` | `void` |
| `SWITCH_SESSION_TENANT` | Message | `{ sessionId, userId, tenantSlug, tenantId, email }` | `{ accessToken, refreshToken }` |
| `USER_DELETED` | Event | `{ userId }` | N/A |
| `REVOKE_ALL_SESSIONS` | Event | `{ userId }` | N/A |

## Users Service

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `USER_EXISTS` | Message | `userId: string` | `boolean` |
| `CREATE_USER` | Message | `CreateUserInput` | `User` |
| `FIND_USER_BY_EMAIL` | Message | `{ email, forAuth? }` | `{ _id, password?, groupIds }` or `null` |
| `FIND_USER_WITH_PASSWORD` | Message | `{ userId }` | `{ _id, password }` or `null` |
| `UPDATE_USER` | Message | `UpdateUserInput` | `User` |
| `UPDATE_USER_PASSWORD` | Message | `{ userId, newPassword }` | `void` |
| `FIND_GROUPIDS_BY_USERID` | Message | `{ userId }` | `{ groupIds: string[] }` |
| `GET_ORG_ENTITY_USAGE_COUNT` | Message | `{ field, id }` | `number` |
| `USER_GROUPS_CHANGED` | Event | `{ userId }` | N/A |
| `PERMISSIONS_CHANGED` | Event | `{ groupIds }` | N/A |

## Grants Service

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `GROUP_EXISTS` | Message | `groupId: string` | `boolean` |
| `FIND_GROUP_BY_NAME` | Message | `name: string` | `Group` or `null` |
| `CREATE_GROUP` | Message | `CreateGroupInput` | `Group` |
| `CREATE_PERMISSION` | Message | `CreatePermissionInput` | `Permission` |
| `UPSERT_PERMISSION` | Message | `CreatePermissionInput` | `Permission` |
| `CREATE_OPERATION_PERMISSION` | Message | `CreateOperationPermissionInput` | `OperationPermission` |
| `UPSERT_OPERATION_PERMISSION` | Message | `CreateOperationPermissionInput` | `OperationPermission` |
| `UPSERT_PAGE_PERMISSION` | Message | `CreatePagePermissionInput` | `PagePermission` |
| `FIND_OP_PERMISSIONS_BY_GROUP` | Message | `{ groupId }` | `OperationPermission[]` |
| `FIND_PERMISSIONS_BY_GROUP` | Message | `{ groupId, entityName? }` | `Permission[]` |
| `FIND_BULK_PERMISSIONS_MULTI` | Message | `{ groupIds, entityNames }` | `BulkPermissionsDTO` |
| `FIND_PAGE_PERMISSIONS_BY_GROUP` | Message | `{ groupId }` | `PagePermission[]` |

## GroupAssignments Service

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `FIND_GROUP_ASSIGNMENTS_BY_USER_ID` | Message | `userId: string` | `GroupAssignment[]` |
| `FIND_GROUP_ASSIGNMENTS_BY_GROUP_ID` | Message | `groupId: string` | `GroupAssignment[]` |
| `USER_CREATED` | Event | `{ userId, groupIds? }` | N/A |
| `USER_UPDATED` | Event | `{ userId, groupIds? }` | N/A |
| `USER_DELETED` | Event | `{ userId }` | N/A |
| `GROUP_CREATED` | Event | `{ groupId, userIds? }` | N/A |
| `GROUP_UPDATED` | Event | `{ groupId, userIds? }` | N/A |
| `GROUP_DELETED` | Event | `{ groupId }` | N/A |
| `PERMISSIONS_CHANGED` | Event | `{ groupIds }` | N/A |

## Organization Service

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `JOB_ROLE_EXISTS` | Message | `id: string` | `boolean` |
| `FIND_JOB_ROLES_BY_IDS` | Message | `ids: string[]` | `JobRole[]` |
| `FIND_SENIORITY_LEVELS_BY_IDS` | Message | `ids: string[]` | `SeniorityLevel[]` |
| `FIND_COMPANIES_BY_IDS` | Message | `ids: string[]` | `Company[]` |
| `FIND_ROLE_CATEGORIES_BY_IDS` | Message | `ids: string[]` | `RoleCategory[]` |
| `CREATE_SENIORITY_LEVEL` | Message | `{ name, order, description? }` | `SeniorityLevel` |
| `FIND_SENIORITY_LEVEL_BY_NAME` | Message | `name: string` | `SeniorityLevel` or `null` |
| `CREATE_JOB_ROLE` | Message | `{ name, order, description? }` | `JobRole` |
| `FIND_JOB_ROLE_BY_NAME` | Message | `name: string` | `JobRole` or `null` |
| `CREATE_ROLE_CATEGORY` | Message | `{ name, description? }` | `RoleCategory` |
| `FIND_ROLE_CATEGORY_BY_NAME` | Message | `name: string` | `RoleCategory` or `null` |
| `PERMISSIONS_CHANGED` | Event | `{ groupIds }` | N/A |

## Projects Service

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `PROJECT_EXISTS` | Message | `projectId: string` | `boolean` |
| `GET_PROJECT_DATES` | Message | `projectId: string` | `{ startDate, endDate }` |
| `FIND_PROJECT_BY_NAME` | Message | `name: string` | `Project` or `null` |
| `CREATE_PROJECT` | Message | `{ projectBasicData, assignedMilestoneIds? }` | `Project` |
| `CREATE_PROJECT_TEMPLATE` | Message | `{ name, description?, scope, createdBy? }` | `ProjectTemplate` |
| `FIND_PROJECT_TEMPLATE_BY_NAME` | Message | `name: string` | `ProjectTemplate` or `null` |
| `FIND_TEMPLATE_PHASES_BY_TEMPLATE_ID` | Message | `templateId: string` | `ProjectTemplatePhase[]` |
| `CREATE_PROJECT_TEMPLATE_PHASE` | Message | `{ templateId, name, orderIndex, isRequired, percentage?, roleCategoryId? }` | `ProjectTemplatePhase` |
| `PERMISSIONS_CHANGED` | Event | `{ groupIds }` | N/A |

## Milestones Service

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `MILESTONE_EXISTS` | Message | `milestoneId: string` | `boolean` |
| `FIND_MILESTONE_BY_NAME` | Message | `{ name: string }` | `Milestone` or `null` |
| `GET_MILESTONE_DATES` | Message | `milestoneId: string` | `{ startDate, endDate }` |
| `CREATE_MILESTONE` | Message | `CreateMilestoneInput` | `Milestone` |
| `UPDATE_MILESTONE` | Message | `UpdateMilestoneInput` | `Milestone` |
| `UPDATE_MILESTONE_STATUS` | Message | `{ milestoneId, status }` | `Milestone` |
| `DELETE_MILESTONE` | Message | `milestoneId: string` | `Milestone` |
| `PERMISSIONS_CHANGED` | Event | `{ groupIds }` | N/A |

## MilestoneToUser Service

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `FIND_MILESTONE_TO_USER_BY_USER_ID` | Message | `userId: string` | `MilestoneToUser[]` |
| `FIND_MILESTONE_TO_USER_BY_MILESTONE_ID` | Message | `milestoneId: string` | `MilestoneToUser[]` |
| `USER_CREATED` | Event | `{ userId, assignedMilestoneIds?, assignmentStartDates?, assignmentEndDates? }` | N/A |
| `USER_UPDATED` | Event | `{ userId, assignedMilestoneIds?, assignmentStartDates?, assignmentEndDates? }` | N/A |
| `USER_DELETED` | Event | `{ userId }` | N/A |
| `USER_HARD_DELETED` | Event | `{ userId }` | N/A |
| `MILESTONE_CREATED` | Event | `{ milestoneId, assignedUserIds?, assignmentStartDates?, assignmentEndDates? }` | N/A |
| `MILESTONE_UPDATED` | Event | `{ milestoneId, assignedUserIds?, assignmentStartDates?, assignmentEndDates? }` | N/A |
| `MILESTONE_DELETED` | Event | `{ milestoneId }` | N/A |
| `PERMISSIONS_CHANGED` | Event | `{ groupIds }` | N/A |

## MilestoneToProject Service

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `FIND_MILESTONE_TO_PROJECT_BY_PROJECT_ID` | Message | `projectId: string` | `MilestoneToProject[]` |
| `FIND_MILESTONE_TO_PROJECT_BY_MILESTONE_ID` | Message | `milestoneId: string` | `MilestoneToProject[]` |
| `FIND_MILESTONE_TO_PROJECT_BY_MILESTONE_IDS` | Message | `milestoneIds: string[]` | `MilestoneToProject[]` |
| `CREATE_MILESTONE_TO_PROJECT` | Message | `{ milestoneId, projectId, startDate?, endDate? }` | `MilestoneToProject` |
| `PROJECT_CREATED` | Event | `{ projectId, assignedMilestoneIds }` | N/A |
| `PROJECT_UPDATED` | Event | `{ projectId, assignedMilestoneIds }` | N/A |
| `PROJECT_DELETED` | Event | `{ projectId }` | N/A |
| `MILESTONE_CREATED` | Event | `{ milestoneId, assignedProjectIds, assignmentStartDates?, assignmentEndDates? }` | N/A |
| `MILESTONE_UPDATED` | Event | `{ milestoneId, assignedProjectIds, assignmentStartDates?, assignmentEndDates? }` | N/A |
| `MILESTONE_DELETED` | Event | `{ milestoneId }` | N/A |
| `PERMISSIONS_CHANGED` | Event | `{ groupIds }` | N/A |

## ProjectAccess Service

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `HAS_PROJECT_ACCESS` | Message | `{ userId, projectId }` | `boolean` |
| `GET_ACCESSIBLE_PROJECT_IDS` | Message | `userId: string` | `string[]` |
| `PROJECT_ACCESS_EXISTS` | Message | `id: string` | `boolean` |
| `PERMISSIONS_CHANGED` | Event | `{ groupIds }` | N/A |

## Global Events

These events are broadcast to all services that need to invalidate permission caches:

| Event | Payload | Purpose |
|-------|---------|---------|
| `PERMISSIONS_CHANGED` | `{ groupIds: string[] }` | Invalidate permission cache |

**Services listening to PERMISSIONS_CHANGED:**
- Users
- Grants
- GroupAssignments
- Organization
- Projects
- Milestones
- MilestoneToUser
- MilestoneToProject
- ProjectAccess

## Payload Types

### BulkPermissionsDTO

```typescript
interface BulkPermissionsDTO {
  canExecuteOps: string[];
  canViewByEntity: {
    [entityName: string]: string[];
  };
  scopeByEntity: {
    [entityName: string]: {
      [fieldPath: string]: string[];
    };
  };
  operationScopeByOp: {
    [operationName: string]: string;
  };
}
```

### CreateUserInput

```typescript
interface CreateUserInput {
  authData: {
    name: string;
    surname: string;
    email: string;
    password: string;
    groupIds?: string[];
  };
  personalData?: { /* ... */ };
  employmentData?: { /* ... */ };
  additionalFieldsData?: { /* ... */ };
  assignedMilestoneIds?: string[];
}
```

### CreateGroupInput

```typescript
interface CreateGroupInput {
  name: string;
  description?: string;
}
```

### CreatePermissionInput

```typescript
interface CreatePermissionInput {
  groupId: string;
  entityName: string;
  fieldPath: string;
  canView: boolean;
  canEdit: boolean;
  scope?: 'self' | 'all';
}
```

### CreateOperationPermissionInput

```typescript
interface CreateOperationPermissionInput {
  groupId: string;
  operationName: string;
  canExecute: boolean;
  scope?: 'self' | 'all';
}
```

### CreateMilestoneInput

```typescript
interface CreateMilestoneInput {
  milestoneBasicData: {
    name: string;
    description: string;
    plannedStartDate: string;
    plannedEndDate: string;
    status: number;
    effort?: number;
  };
  color?: string;
  assignedUserIds?: string[];
  assignmentStartDates?: string[];
  assignmentEndDates?: string[];
}
```

### UpdateMilestoneInput

```typescript
interface UpdateMilestoneInput {
  _id: string;
  milestoneBasicData?: Partial<MilestoneBasicData>;
  color?: string;
  assignedUserIds?: string[];
  assignmentStartDates?: string[];
  assignmentEndDates?: string[];
}
```

## Usage Examples

### Sending MessagePattern

```typescript
// Request-Response
const user = await lastValueFrom(
  this.usersClient.send<User>('FIND_USER_BY_EMAIL', {
    email: 'user@example.com',
    forAuth: true,
  })
);
```

### Sending EventPattern

```typescript
// Fire-and-Forget
this.authClient.emit('USER_DELETED', { userId: 'user-123' });
```

### Protected RPC Call

```typescript
// With internal secret
const group = await lastValueFrom(
  this.grantsClient.send('CREATE_GROUP', {
    name: 'ADMIN',
    description: 'Admin group',
    _internalSecret: process.env.INTERNAL_HEADER_SECRET,
  })
);
```

### Checking Project Access

```typescript
const hasAccess = await lastValueFrom(
  this.projectAccessClient.send<boolean>('HAS_PROJECT_ACCESS', {
    userId: 'user-123',
    projectId: 'project-456',
  })
);

if (!hasAccess) {
  throw new ForbiddenException('No access to this project');
}
```

### Getting Bulk Permissions

```typescript
const permissions = await lastValueFrom(
  this.grantsClient.send<BulkPermissionsDTO>('FIND_BULK_PERMISSIONS_MULTI', {
    groupIds: ['group-1', 'group-2'],
    entityNames: ['User', 'Project', 'Milestone'],
  })
);
```

## Event Flow Diagrams

### User Creation Flow

```
Users Service                GroupAssignments Service         MilestoneToUser Service
     │                              │                                │
     │  emit('USER_CREATED',        │                                │
     │  { userId, groupIds,         │                                │
     │    assignedMilestoneIds })   │                                │
     │─────────────────────────────►│                                │
     │                              │  Creates GroupAssignment       │
     │                              │  records for each groupId      │
     │                              │                                │
     │──────────────────────────────┼───────────────────────────────►│
     │                              │                                │
     │                              │         Creates MilestoneToUser│
     │                              │         records for each       │
     │                              │         milestoneId            │
```

### Permission Change Flow

```
Grants Service          All Services (Users, Projects, etc.)
     │                              │
     │  emit('PERMISSIONS_CHANGED', │
     │  { groupIds })               │
     │─────────────────────────────►│
     │                              │
     │                              │  PermissionsCacheService
     │                              │  .invalidateGroups(groupIds)
     │                              │
```

### Project Creation Flow

```
Projects Service         MilestoneToProject Service
     │                              │
     │  emit('PROJECT_CREATED',     │
     │  { projectId,                │
     │    assignedMilestoneIds })   │
     │─────────────────────────────►│
     │                              │
     │                              │  Creates MilestoneToProject
     │                              │  records for each milestoneId
```
