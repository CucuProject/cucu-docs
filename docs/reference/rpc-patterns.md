# RPC Patterns Reference

Complete catalog of all RPC message and event patterns in the Cucu platform.

## Pattern Types

| Type | Description | Response |
|------|-------------|----------|
| **MessagePattern** | Request-Response | Returns value |
| **EventPattern** | Fire-and-Forget | No response |

## Auth Service

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `LOGIN` | Message | `{ email, password, ip, deviceName, browserName, deviceFingerprint }` | `{ accessToken, refreshToken, userId, sessionId, expiresIn }` |
| `CHECK_SESSION` | Message | `{ sessionId }` | `{ isValid, userId?, groupIds?, reason? }` |
| `REFRESH_SESSION` | Message | `{ refreshToken }` | `{ accessToken, newRefreshToken, userId, sessionId, expiresIn }` |
| `REVOKE_SESSION` | Message | `{ sessionId, requestUserId, force }` | `void` |
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
| `FIND_BULK_PERMISSIONS_MULTI` | Message | `{ groupIds }` | `BulkPermissionsDTO` |
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

## MilestoneToUser Service

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `FIND_MILESTONE_TO_USER_BY_USER_ID` | Message | `userId: string` | `{ _id: string }[]` |
| `FIND_MILESTONE_TO_USER_BY_MILESTONE_ID` | Message | `milestoneId: string` | `{ _id: string }[]` |
| `USER_CREATED` | Event | `{ userId, milestoneIds? }` | N/A |
| `USER_UPDATED` | Event | `{ userId, milestoneIds? }` | N/A |
| `USER_DELETED` | Event | `{ userId }` | N/A |
| `MILESTONE_CREATED` | Event | `{ milestoneId, userIds? }` | N/A |
| `MILESTONE_UPDATED` | Event | `{ milestoneId, userIds? }` | N/A |
| `MILESTONE_DELETED` | Event | `{ milestoneId }` | N/A |

## MilestoneToProject Service

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `FIND_MILESTONE_TO_PROJECT_BY_PROJECT_ID` | Message | `projectId: string` | `{ _id: string }[]` |
| `FIND_MILESTONE_TO_PROJECT_BY_MILESTONE_ID` | Message | `milestoneId: string` | `{ _id: string }[]` |
| `PROJECT_CREATED` | Event | `{ projectId, milestoneIds? }` | N/A |
| `PROJECT_UPDATED` | Event | `{ projectId, milestoneIds? }` | N/A |
| `PROJECT_DELETED` | Event | `{ projectId }` | N/A |
| `MILESTONE_CREATED` | Event | `{ milestoneId, projectIds? }` | N/A |
| `MILESTONE_DELETED` | Event | `{ milestoneId }` | N/A |

## Organization Service

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `FIND_SENIORITY_LEVELS_BY_IDS` | Message | `ids: string[]` | `SeniorityLevel[]` |
| `FIND_JOB_ROLES_BY_IDS` | Message | `ids: string[]` | `JobRole[]` |
| `FIND_COMPANIES_BY_IDS` | Message | `ids: string[]` | `Company[]` |
| `FIND_ROLE_CATEGORIES_BY_IDS` | Message | `ids: string[]` | `RoleCategory[]` |

## Projects Service

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `PROJECT_EXISTS` | Message | `projectId: string` | `boolean` |

## Milestones Service

| Pattern | Type | Payload | Response |
|---------|------|---------|----------|
| `MILESTONE_EXISTS` | Message | `milestoneId: string` | `boolean` |

## Global Events

These events are broadcast to all services:

| Event | Payload | Purpose |
|-------|---------|---------|
| `PERMISSIONS_CHANGED` | `{ groupIds: string[] }` | Invalidate permission cache |

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
