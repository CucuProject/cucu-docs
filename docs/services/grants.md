# Grants Service

The Grants service manages **groups, permissions, and access control** for the Cucu platform.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 3010 |
| **Database** | grants-db (MongoDB, port 9010) |
| **Role** | Permission management, group management |
| **Dependencies** | None (core service) |

## Entities

### Group

A collection of permissions assigned to users:

```typescript
interface Group {
  _id: ID;
  name: string;           // e.g., "ADMIN", "MANAGER", "VIEWER"
  description?: string;
}
```

### Permission (Field-Level)

Controls visibility and editability of specific fields:

```typescript
interface Permission {
  _id: ID;
  groupId: ID;
  entityName: string;     // e.g., "User", "Project"
  fieldPath: string;      // e.g., "authData.email", "employmentData.RAL"
  canView: boolean;
  canEdit: boolean;
  scope?: 'self' | 'all'; // 'self' = own records only
}
```

### OperationPermission

Controls ability to execute GraphQL operations:

```typescript
interface OperationPermission {
  _id: ID;
  groupId: ID;
  operationName: string;  // e.g., "createUser", "findAllUsers"
  canExecute: boolean;
  scope?: 'self' | 'all'; // Optional scope restriction
}
```

### PagePermission

Controls frontend page access:

```typescript
interface PagePermission {
  _id: ID;
  groupId: ID;
  pageName: string;       // e.g., "/admin/users", "/settings"
  canAccess: boolean;
}
```

## API Reference

### Group Operations

#### Queries

```graphql
# List all groups
query {
  findAllGroups {
    _id
    name
    description
  }
}

# Find specific group
query FindOneGroup($groupId: ID!) {
  findOneGroup(groupId: $groupId) {
    _id
    name
    description
  }
}
```

#### Mutations

```graphql
# Create group
mutation CreateGroup($input: CreateGroupInput!) {
  createGroup(input: $input) {
    _id
    name
    description
  }
}

# Variables
{
  "input": {
    "name": "MANAGER",
    "description": "Project managers with read/write access"
  }
}

# Update group
mutation UpdateGroup($input: UpdateGroupInput!) {
  updateGroup(updateGroupInput: $input) {
    _id
    name
    description
  }
}

# Delete group
mutation RemoveGroup($input: DeleteGroupInput!) {
  removeGroup(input: $input) {
    name
    description
  }
}
```

### Permission Operations

#### Queries

```graphql
# List all permissions
query {
  findAllPermissions {
    _id
    groupId
    entityName
    fieldPath
    canView
    canEdit
  }
}

# Find permissions by group
query FindPermissionsByGroup($groupId: ID!) {
  findPermissionsByGroup(groupId: $groupId) {
    _id
    entityName
    fieldPath
    canView
    canEdit
  }
}
```

#### Mutations

```graphql
# Create field permission
mutation CreatePermission($input: CreatePermissionInput!) {
  createPermission(input: $input) {
    _id
    groupId
    entityName
    fieldPath
    canView
    canEdit
  }
}

# Variables
{
  "input": {
    "groupId": "group-123",
    "entityName": "User",
    "fieldPath": "employmentData.RAL",
    "canView": true,
    "canEdit": false
  }
}

# Update permission
mutation UpdatePermission($input: UpdatePermissionInput!) {
  updatePermission(updatePermissionInput: $input) {
    _id
    canView
    canEdit
  }
}

# Delete permission
mutation RemovePermission($input: DeletePermissionInput!) {
  removePermission(input: $input) {
    _id
    fieldPath
  }
}
```

### Operation Permission Operations

#### Queries

```graphql
# List all operation permissions
query {
  findAllOperationPermissions {
    _id
    groupId
    operationName
    canExecute
  }
}

# Find by group
query FindOpPermissionsByGroup($groupId: ID!) {
  findOperationPermissionsByGroup(groupId: $groupId) {
    _id
    operationName
    canExecute
  }
}
```

#### Mutations

```graphql
# Create operation permission
mutation CreateOperationPermission($input: CreateOperationPermissionInput!) {
  createOperationPermission(input: $input) {
    _id
    groupId
    operationName
    canExecute
  }
}

# Variables
{
  "input": {
    "groupId": "group-123",
    "operationName": "createUser",
    "canExecute": true
  }
}

# Update
mutation UpdateOperationPermission($input: UpdateOperationPermissionInput!) {
  updateOperationPermission(input: $input) {
    _id
    canExecute
  }
}

# Delete
mutation RemoveOperationPermission($_id: ID!) {
  removeOperationPermission(_id: $_id) {
    _id
    operationName
  }
}
```

### Introspection Queries

```graphql
# List all fields for an entity type
query ListFields($typeName: String!) {
  listFieldsFromGateway(typeName: $typeName)
}
# Returns: ["_id", "authData.name", "authData.email", ...]

# List queries for a service
query ListQueries($serviceName: String!) {
  listQueryFromGateway(serviceName: $serviceName)
}
# Returns: ["findAllUsers", "findOneUser", ...]

# List mutations for a service
query ListMutations($serviceName: String!) {
  listMutationsFromGateway(serviceName: $serviceName)
}
# Returns: ["createUser", "updateUser", "removeUser", ...]
```

## RPC Patterns

### Message Patterns

| Pattern | Payload | Response |
|---------|---------|----------|
| `GROUP_EXISTS` | `groupId: string` | `boolean` |
| `FIND_GROUP_BY_NAME` | `name: string` | `Group` or `null` |
| `CREATE_GROUP` | `CreateGroupInput` | `Group` |
| `CREATE_PERMISSION` | `CreatePermissionInput` | `Permission` |
| `UPSERT_PERMISSION` | `CreatePermissionInput` | `Permission` |
| `CREATE_OPERATION_PERMISSION` | `CreateOperationPermissionInput` | `OperationPermission` |
| `UPSERT_OPERATION_PERMISSION` | `CreateOperationPermissionInput` | `OperationPermission` |
| `UPSERT_PAGE_PERMISSION` | `CreatePagePermissionInput` | `PagePermission` |
| `FIND_OP_PERMISSIONS_BY_GROUP` | `{ groupId }` | `OperationPermission[]` |
| `FIND_PERMISSIONS_BY_GROUP` | `{ groupId, entityName? }` | `Permission[]` |
| `FIND_BULK_PERMISSIONS_MULTI` | `{ groupIds }` | `BulkPermissionsDTO` |
| `FIND_PAGE_PERMISSIONS_BY_GROUP` | `{ groupId }` | `PagePermission[]` |

### Bulk Permissions Response

```typescript
interface BulkPermissionsDTO {
  canExecuteOps: string[];           // Operation names
  canViewByEntity: {
    [entityName: string]: string[];  // Field paths
  };
  scopeByEntity: {
    [entityName: string]: {
      [fieldPath: string]: string[]; // Scopes: ['self'] or ['all'] or ['self', 'all']
    };
  };
  operationScopeByOp: {
    [operationName: string]: string; // 'self' or 'all'
  };
}
```

## Events Emitted

### PERMISSIONS_CHANGED

Emitted when any permission is created, updated, or deleted:

```typescript
// When permissions change
this.redisClient.emit('PERMISSIONS_CHANGED', {
  groupIds: ['group-123']
});
```

All services listen for this event to invalidate their permission cache.

### GROUP_CREATED / GROUP_UPDATED / GROUP_DELETED

Emitted for group lifecycle events:

```typescript
this.redisClient.emit('GROUP_CREATED', {
  groupId: group._id,
  userIds: ['user-1', 'user-2']  // Initial members, if any
});
```

## Permission System Design

### Three Tiers

```
┌─────────────────────────────────────────────────────────────┐
│  Tier 1: OPERATION PERMISSIONS                              │
│  Can the user execute this Query/Mutation?                  │
│  Example: canExecute('createUser') → true/false             │
├─────────────────────────────────────────────────────────────┤
│  Tier 2: FIELD PERMISSIONS (with Scope)                     │
│  Can the user view/edit this field?                         │
│  Example: canView('User', 'employmentData.RAL') → true/false│
│  Scope: 'self' (own record) or 'all' (any record)          │
├─────────────────────────────────────────────────────────────┤
│  Tier 3: PAGE PERMISSIONS                                   │
│  Can the user access this frontend page?                    │
│  Example: canAccess('/admin/users') → true/false           │
└─────────────────────────────────────────────────────────────┘
```

### Permission Union

When a user belongs to multiple groups, permissions are **unioned**:

```typescript
// User in groups: ["MANAGER", "VIEWER"]

// MANAGER: canView('User', 'employmentData.RAL') = true
// VIEWER:  canView('User', 'employmentData.RAL') = false

// Result: canView = true (any group grants access)
```

### Scope Merging

```typescript
// MANAGER: scope for 'employmentData.RAL' = 'all'
// VIEWER:  scope for 'employmentData.RAL' = 'self'

// Result: scope = 'all' (more permissive wins)
```

## Setting Up Permissions

### Step 1: Create Groups

```graphql
mutation {
  admin: createGroup(input: { name: "ADMIN", description: "Full access" }) { _id }
  manager: createGroup(input: { name: "MANAGER", description: "Project managers" }) { _id }
  viewer: createGroup(input: { name: "VIEWER", description: "Read-only" }) { _id }
}
```

### Step 2: Discover Operations

```graphql
query {
  queries: listQueryFromGateway(serviceName: "User")
  mutations: listMutationsFromGateway(serviceName: "User")
}
# Returns lists of operation names
```

### Step 3: Grant Operation Permissions

```graphql
mutation {
  # ADMIN can do everything
  createOperationPermission(input: {
    groupId: "admin-id"
    operationName: "createUser"
    canExecute: true
  }) { _id }

  # VIEWER can only read
  createOperationPermission(input: {
    groupId: "viewer-id"
    operationName: "findAllUsers"
    canExecute: true
  }) { _id }
}
```

### Step 4: Discover Fields

```graphql
query {
  listFieldsFromGateway(typeName: "User")
}
# Returns: ["_id", "authData.name", "authData.email", "employmentData.RAL", ...]
```

### Step 5: Grant Field Permissions

```graphql
mutation {
  # ADMIN can view all fields
  createPermission(input: {
    groupId: "admin-id"
    entityName: "User"
    fieldPath: "employmentData.RAL"
    canView: true
    canEdit: true
  }) { _id }

  # VIEWER can only see non-sensitive fields
  createPermission(input: {
    groupId: "viewer-id"
    entityName: "User"
    fieldPath: "authData.name"
    canView: true
    canEdit: false
  }) { _id }
}
```

### Step 6: Set Scopes (Optional)

```graphql
mutation {
  # MANAGER can only see their own RAL
  createPermission(input: {
    groupId: "manager-id"
    entityName: "User"
    fieldPath: "employmentData.RAL"
    canView: true
    canEdit: false
    scope: "self"
  }) { _id }
}
```

## Configuration

### Environment Variables

```ini
# Service Config
GRANTS_SERVICE_NAME=grants
GRANTS_SERVICE_PORT=3010
GRANTS_DB_HOST=grants-db
GRANTS_DB_PORT=9010

# MongoDB
MONGODB_URI=mongodb://grants-db:27017/grants

# No dependencies (core service)
GRANTS_DEPENDENCIES=[]

# Redis
REDIS_SERVICE_HOST=redis
REDIS_SERVICE_TLS_PORT=6380
```

## Protected RPC Operations

Some RPC operations are protected with `RpcInternalGuard`:

```typescript
@UseGuards(RpcInternalGuard)
@MessagePattern('CREATE_GROUP')
async createGroup(@Payload() dto: CreateGroupInput) {
  return this.groupsService.create(dto);
}
```

Callers must include `_internalSecret` in the payload:

```typescript
await lastValueFrom(
  this.grantsClient.send('CREATE_GROUP', {
    name: 'SUPERADMIN',
    description: 'Full system access',
    _internalSecret: process.env.INTERNAL_HEADER_SECRET,
  })
);
```

## File Structure

```
apps/grants/
├── src/
│   ├── main.ts
│   ├── grants.module.ts
│   ├── controllers/
│   │   └── grants.controller.ts     # RPC handlers
│   ├── resolvers/
│   │   ├── groups.resolver.ts
│   │   ├── permissions.resolver.ts
│   │   └── operation-permissions.resolver.ts
│   ├── services/
│   │   ├── groups.service.ts
│   │   ├── permissions.service.ts
│   │   └── operation-permissions.service.ts
│   ├── schemas/
│   │   ├── group.schema.ts
│   │   ├── permission.schema.ts
│   │   └── operation-permission.schema.ts
│   └── introspection/
│       └── introspection.service.ts  # Gateway introspection
├── Dockerfile
└── README.md
```

## Next Steps

- [Permission System](/architecture/permissions) - How permissions are enforced
- [Add New Permission Guide](/guides/add-new-permission) - Step-by-step guide
- [Users Service](/services/users) - How permissions apply to users
