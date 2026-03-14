# Add New Permission Guide

This guide walks you through adding permissions for a new feature or entity.

## Overview

Cucu uses a three-tier permission system:

1. **Operation Permissions** - Can execute Query/Mutation
2. **Field Permissions** - Can view/edit specific fields
3. **Page Permissions** - Can access frontend pages

## Step 1: Identify What Needs Permissions

### New Entity Checklist

- [ ] Operations: createX, findAllX, findOneX, updateX, removeX
- [ ] Fields: All fields that should be protected
- [ ] Pages: Admin pages, edit pages

### Example: New "Task" Entity

Operations:
- `findAllTasks` - List tasks
- `findOneTask` - Get single task
- `createTask` - Create task
- `updateTask` - Update task
- `removeTask` - Delete task

Fields:
- `name` - Task name
- `description` - Task description
- `assigneeId` - Assigned user
- `status` - Task status
- `dueDate` - Due date
- `estimatedHours` - Hours estimate (sensitive)
- `actualCost` - Actual cost (sensitive)

## Step 2: Create Operation Permissions

### Using GraphQL

```graphql
# ADMIN - full access
mutation CreateAdminPermissions {
  findAll: createOperationPermission(input: {
    groupId: "admin-group-id"
    operationName: "findAllTasks"
    canExecute: true
  }) { _id }

  findOne: createOperationPermission(input: {
    groupId: "admin-group-id"
    operationName: "findOneTask"
    canExecute: true
  }) { _id }

  create: createOperationPermission(input: {
    groupId: "admin-group-id"
    operationName: "createTask"
    canExecute: true
  }) { _id }

  update: createOperationPermission(input: {
    groupId: "admin-group-id"
    operationName: "updateTask"
    canExecute: true
  }) { _id }

  remove: createOperationPermission(input: {
    groupId: "admin-group-id"
    operationName: "removeTask"
    canExecute: true
  }) { _id }
}

# MANAGER - read/write, no delete
mutation CreateManagerPermissions {
  findAll: createOperationPermission(input: {
    groupId: "manager-group-id"
    operationName: "findAllTasks"
    canExecute: true
  }) { _id }

  findOne: createOperationPermission(input: {
    groupId: "manager-group-id"
    operationName: "findOneTask"
    canExecute: true
  }) { _id }

  create: createOperationPermission(input: {
    groupId: "manager-group-id"
    operationName: "createTask"
    canExecute: true
  }) { _id }

  update: createOperationPermission(input: {
    groupId: "manager-group-id"
    operationName: "updateTask"
    canExecute: true
  }) { _id }
}

# VIEWER - read only
mutation CreateViewerPermissions {
  findAll: createOperationPermission(input: {
    groupId: "viewer-group-id"
    operationName: "findAllTasks"
    canExecute: true
  }) { _id }

  findOne: createOperationPermission(input: {
    groupId: "viewer-group-id"
    operationName: "findOneTask"
    canExecute: true
  }) { _id }
}
```

### Adding Scope

For operations that should be restricted to own resources:

```graphql
mutation CreateScopedPermissions {
  # EMPLOYEE can only update their own tasks
  updateOwn: createOperationPermission(input: {
    groupId: "employee-group-id"
    operationName: "updateTask"
    canExecute: true
    scope: "self"  # Only own tasks
  }) { _id }

  # MANAGER can update all tasks
  updateAll: createOperationPermission(input: {
    groupId: "manager-group-id"
    operationName: "updateTask"
    canExecute: true
    scope: "all"  # All tasks
  }) { _id }
}
```

## Step 3: Create Field Permissions

### Discover Available Fields

```graphql
query {
  listFieldsFromGateway(typeName: "Task")
}
# Returns: ["_id", "name", "description", "assigneeId", "status", ...]
```

### Create Field Permissions

```graphql
# ADMIN - all fields, full access
mutation CreateAdminFieldPermissions {
  name: createPermission(input: {
    groupId: "admin-group-id"
    entityName: "Task"
    fieldPath: "name"
    canView: true
    canEdit: true
  }) { _id }

  description: createPermission(input: {
    groupId: "admin-group-id"
    entityName: "Task"
    fieldPath: "description"
    canView: true
    canEdit: true
  }) { _id }

  estimatedHours: createPermission(input: {
    groupId: "admin-group-id"
    entityName: "Task"
    fieldPath: "estimatedHours"
    canView: true
    canEdit: true
  }) { _id }

  actualCost: createPermission(input: {
    groupId: "admin-group-id"
    entityName: "Task"
    fieldPath: "actualCost"
    canView: true
    canEdit: true
  }) { _id }
}

# MANAGER - most fields, no cost editing
mutation CreateManagerFieldPermissions {
  name: createPermission(input: {
    groupId: "manager-group-id"
    entityName: "Task"
    fieldPath: "name"
    canView: true
    canEdit: true
  }) { _id }

  actualCost: createPermission(input: {
    groupId: "manager-group-id"
    entityName: "Task"
    fieldPath: "actualCost"
    canView: true
    canEdit: false  # View only
  }) { _id }
}

# VIEWER - view only, no sensitive fields
mutation CreateViewerFieldPermissions {
  name: createPermission(input: {
    groupId: "viewer-group-id"
    entityName: "Task"
    fieldPath: "name"
    canView: true
    canEdit: false
  }) { _id }

  # No permission for actualCost - field won't be visible
}
```

### Field Permissions with Scope

```graphql
# EMPLOYEE can only see their own task hours
mutation {
  createPermission(input: {
    groupId: "employee-group-id"
    entityName: "Task"
    fieldPath: "estimatedHours"
    canView: true
    canEdit: false
    scope: "self"  # Only on own tasks
  }) { _id }
}
```

## Step 4: Create Page Permissions (Optional)

For frontend routing:

```graphql
mutation CreatePagePermissions {
  # ADMIN can access all pages
  adminTasks: createPagePermission(input: {
    groupId: "admin-group-id"
    pageName: "/admin/tasks"
    canAccess: true
  }) { _id }

  taskSettings: createPagePermission(input: {
    groupId: "admin-group-id"
    pageName: "/settings/tasks"
    canAccess: true
  }) { _id }

  # MANAGER can access tasks but not settings
  managerTasks: createPagePermission(input: {
    groupId: "manager-group-id"
    pageName: "/admin/tasks"
    canAccess: true
  }) { _id }
}
```

## Step 5: Verify Permissions

### Check Operation Access

```bash
# As ADMIN (should work)
curl http://localhost:3000/graphql -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"query": "{ findAllTasks { _id name } }"}'

# As VIEWER (should work)
curl http://localhost:3000/graphql -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <viewer-token>" \
  -d '{"query": "{ findAllTasks { _id name } }"}'

# VIEWER trying to create (should fail)
curl http://localhost:3000/graphql -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <viewer-token>" \
  -d '{"query": "mutation { createTask(input: { name: \"Test\" }) { _id } }"}'
# Expected: ForbiddenException
```

### Check Field Access

```graphql
# As ADMIN - should see actualCost
query {
  findOneTask(id: "task-id") {
    name
    actualCost  # Should return value
  }
}

# As VIEWER - should not see actualCost
query {
  findOneTask(id: "task-id") {
    name
    actualCost  # Should return null or be excluded
  }
}
```

## Step 6: Update Bootstrap (Optional)

For default permissions, add to bootstrap service:

```typescript
// apps/bootstrap/src/seeder.service.ts

async seedTaskPermissions(): Promise<void> {
  const adminGroup = await this.findGroupByName('ADMIN');

  // Operations
  const operations = [
    'findAllTasks',
    'findOneTask',
    'createTask',
    'updateTask',
    'removeTask',
  ];

  for (const op of operations) {
    await this.upsertOperationPermission({
      groupId: adminGroup._id,
      operationName: op,
      canExecute: true,
    });
  }

  // Fields
  const fields = ['name', 'description', 'status', 'dueDate'];
  for (const field of fields) {
    await this.upsertPermission({
      groupId: adminGroup._id,
      entityName: 'Task',
      fieldPath: field,
      canView: true,
      canEdit: true,
    });
  }
}
```

## Permission Matrix Template

| Operation/Field | ADMIN | MANAGER | EMPLOYEE | VIEWER |
|----------------|-------|---------|----------|--------|
| **Operations** |
| findAllTasks | ✓ | ✓ | ✓ | ✓ |
| findOneTask | ✓ | ✓ | ✓ (self) | ✓ |
| createTask | ✓ | ✓ | - | - |
| updateTask | ✓ | ✓ | ✓ (self) | - |
| removeTask | ✓ | - | - | - |
| **Fields** |
| name | view/edit | view/edit | view | view |
| description | view/edit | view/edit | view | view |
| estimatedHours | view/edit | view/edit | view (self) | - |
| actualCost | view/edit | view | - | - |
| **Pages** |
| /admin/tasks | ✓ | ✓ | - | - |
| /settings/tasks | ✓ | - | - | - |

## Bulk Permission Creation

For large numbers of permissions, use RPC:

```typescript
// In bootstrap or admin script
const permissions = [
  { entityName: 'Task', fieldPath: 'name', canView: true, canEdit: true },
  { entityName: 'Task', fieldPath: 'description', canView: true, canEdit: true },
  // ... more
];

for (const perm of permissions) {
  await lastValueFrom(
    this.grantsClient.send('UPSERT_PERMISSION', {
      groupId: adminGroupId,
      ...perm,
      _internalSecret: process.env.INTERNAL_HEADER_SECRET,
    })
  );
}
```

## Checklist

- [ ] Operations identified and permissions created
- [ ] Scopes set correctly (self vs all)
- [ ] Fields identified and permissions created
- [ ] Sensitive fields restricted appropriately
- [ ] Field scopes set for sensitive personal data
- [ ] Page permissions created (if applicable)
- [ ] Bootstrap updated for default permissions
- [ ] Permissions verified with different user roles
- [ ] Documentation updated

## Common Issues

### "Operation not allowed"

1. Check OperationPermission exists
2. Check user is in a group with permission
3. Check operation name matches exactly

### Field Not Visible

1. Check Permission exists for the field
2. Check canView is true
3. Check user is in a group with permission
4. Check scope allows access to this record

### Scope Not Working

1. Ensure resolver has `@ScopeCapable` decorator
2. Check `ScopeGuard` is applied
3. Verify ID parameter name matches decorator

## Next Steps

- [Permission System](/architecture/permissions) - How permissions work
- [Grants Service](/services/grants) - Permission management API
- [Permission Rules](/shared/permission-rules) - Rules and invariants
