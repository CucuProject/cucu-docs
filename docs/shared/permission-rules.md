# Permission Rules

This document describes the permission rules, invariants, and best practices for the Cucu permission system.

## Permission Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PERMISSION EVALUATION                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Step 1: Is the operation allowed?                                          │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ OperationGuard checks OperationPermission                              │ │
│  │ Query: findAllUsers → canExecute: true/false                          │ │
│  │ If false → ForbiddenException                                          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Step 2: What scope applies to this operation?                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ ScopeGuard checks operation scope                                      │ │
│  │ scope: 'all' → proceed                                                 │ │
│  │ scope: 'self' → targetId must match currentUserId                     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Step 3: What fields can the user see?                                      │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ ViewFieldsInterceptor loads field permissions                         │ │
│  │ Builds MongoDB projection from viewable fields                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Step 4: Apply field-level scope                                            │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Service sanitizes response based on field scopes                       │ │
│  │ scope: 'self' fields excluded when viewing other users                │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Permission Invariants

### 1. No Permission = No Access

If no `OperationPermission` exists for an operation and user's groups, access is **denied**.

```typescript
// User in groups: ["VIEWER"]
// No OperationPermission for "createUser" + "VIEWER"
// Result: ForbiddenException("Operation 'createUser' not allowed")
```

### 2. Any Group Grants Access

If a user belongs to multiple groups, they get the **union** of permissions.

```typescript
// User in groups: ["MANAGER", "VIEWER"]

// MANAGER: canView('employmentData.RAL') = true
// VIEWER:  canView('employmentData.RAL') = false

// Result: canView = true (MANAGER grants it)
```

### 3. Most Permissive Scope Wins

When merging scopes across groups, the more permissive scope wins.

```typescript
// MANAGER: scope for 'findOneUser' = 'all'
// VIEWER:  scope for 'findOneUser' = 'self'

// Result: scope = 'all' (more permissive)
```

### 4. Self Scope Requires ID Match

Operations with `scope: 'self'` require the target ID to match the current user.

```typescript
// Operation: findOneUser(userId)
// scope: 'self'
// currentUserId: "user-123"
// targetUserId: "user-456"

// Result: ForbiddenException (IDs don't match)
```

### 5. Field Scope Filters Response

Fields with `scope: 'self'` are excluded when viewing another user's record.

```typescript
// User viewing their own record:
{
  authData: { name: "John", email: "john@example.com" },
  employmentData: { RAL: 50000 }  // Self-scoped, visible
}

// User viewing someone else's record:
{
  authData: { name: "Jane", email: "jane@example.com" },
  employmentData: { RAL: null }  // Self-scoped, excluded
}
```

### 6. RPC Bypasses Permission Checks

Internal RPC calls (MessagePattern/EventPattern) bypass permission checks.

```typescript
// Auth service calling Users service via RPC
const user = await this.usersClient.send('FIND_USER_BY_EMAIL', { email });
// OperationGuard is skipped for RPC context
```

### 7. Internal Calls Without User Context Skip Checks

Federation calls from gateway without user context skip permission checks.

```typescript
// Gateway resolving a reference:
// headers: { 'x-internal-federation-call': '1' }
// No x-user-id or x-user-groups
// Result: permission checks skipped
```

## Permission Cascade Rules

### Group Deletion

When a group is deleted:
1. All `GroupAssignment` records for that group are deleted
2. All `Permission` records for that group are deleted
3. All `OperationPermission` records for that group are deleted
4. All `PagePermission` records for that group are deleted
5. `PERMISSIONS_CHANGED` event is emitted

```typescript
// Grants service
async removeGroup(groupId: string): Promise<void> {
  // Delete group
  await this.groupModel.deleteOne({ _id: groupId });

  // Delete all permissions for this group
  await this.permissionModel.deleteMany({ groupId });
  await this.opPermissionModel.deleteMany({ groupId });
  await this.pagePermissionModel.deleteMany({ groupId });

  // Notify group deletion
  this.redisClient.emit('GROUP_DELETED', { groupId });
  this.redisClient.emit('PERMISSIONS_CHANGED', { groupIds: [groupId] });
}
```

### User Deletion

When a user is deleted:
1. All `GroupAssignment` records for that user are deleted
2. All sessions are revoked
3. Milestone assignments are cleaned up

### Permission Change Events

When permissions change:
1. `PERMISSIONS_CHANGED` event is emitted with affected group IDs
2. All services invalidate their permission cache for those groups

## Protected Operations

Certain operations are considered "protected" and have additional guards:

### Bootstrap Operations

```typescript
// Only callable via RPC with internal secret
@UseGuards(RpcInternalGuard)
@MessagePattern('CREATE_GROUP')
async createGroup(@Payload() dto: CreateGroupInput) {}
```

### Admin-Only Operations

```typescript
// Check for SUPERADMIN group
if (!req.user.groups?.includes('SUPERADMIN')) {
  throw new ForbiddenException('SUPERADMIN required');
}
```

### Self-Only Operations

```typescript
// Cannot delete yourself
if (userId === currentUserId) {
  throw new ForbiddenException('Cannot delete yourself');
}
```

## Default Permissions

The bootstrap service creates default permissions:

### SUPERADMIN Group

- All operations: `canExecute: true`
- All fields: `canView: true`, `canEdit: true`
- Scope: `all` (everywhere)

### Default User Group

Typical permissions for regular users:

| Entity | Field | canView | canEdit | Scope |
|--------|-------|---------|---------|-------|
| User | authData.name | true | false | all |
| User | authData.email | true | false | all |
| User | employmentData.RAL | true | false | self |
| User | personalData.* | true | true | self |

## Permission Caching

### Cache Key

```
Sorted group IDs joined by comma
Example: "group-admin,group-manager"
```

### Cache TTL

```typescript
private static TTL = 5 * 60 * 1000; // 5 minutes
```

### Cache Invalidation

```typescript
// Invalidate specific groups
PermissionsCacheService.invalidateGroups(['group-123']);

// Invalidate all
PermissionsCacheService.invalidateAll();
```

### When to Invalidate

- Permission created/updated/deleted
- Group created/updated/deleted
- User added/removed from group

## Best Practices

### 1. Design Groups Around Roles

```
SUPERADMIN  → Full system access
ADMIN       → Manage users, read all data
MANAGER     → Manage own team, read team data
EMPLOYEE    → Read own data, limited edit
VIEWER      → Read-only access
```

### 2. Use Scope for Sensitive Data

```graphql
mutation {
  createPermission(input: {
    groupId: "employee-group"
    entityName: "User"
    fieldPath: "employmentData.RAL"
    canView: true
    canEdit: false
    scope: "self"  # Only see own salary
  }) { _id }
}
```

### 3. Grant Operations First

Before a user can see any fields, they need operation access:

```graphql
# Step 1: Grant operation access
mutation {
  createOperationPermission(input: {
    groupId: "viewer-group"
    operationName: "findAllUsers"
    canExecute: true
  }) { _id }
}

# Step 2: Grant field access
mutation {
  createPermission(input: {
    groupId: "viewer-group"
    entityName: "User"
    fieldPath: "authData.name"
    canView: true
  }) { _id }
}
```

### 4. Test Permission Changes

After changing permissions, verify:

1. Cache invalidation event was sent
2. Affected users see updated access
3. Edge cases (multi-group users) work correctly

### 5. Monitor Permission Denials

Log permission denials for security auditing:

```typescript
if (!this.opSet.has(op)) {
  this.logger.warn(`Permission denied: ${op} for groups ${groups}`);
  throw new ForbiddenException(`Operation "${op}" not allowed`);
}
```

## Next Steps

- [Grants Service](/services/grants) - Permission management API
- [Add New Permission Guide](/guides/add-new-permission) - Step-by-step guide
