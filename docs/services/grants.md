# Grants Service

The Grants service is the **permission engine** of the platform. It stores and manages Groups, field-level Permissions, operation-level OperationPermissions, and page-level PagePermissions. Every other service queries Grants to determine what the current user can do and see.

## Overview

| Property | Value |
|----------|-------|
| Port | 3010 |
| Database | `grants_{tenantSlug}` |
| Collections | `groups`, `permissions`, `operationpermissions`, `pagepermissions` |
| Module | `GrantsModule` |
| Context | `GrantsContext` (request-scoped) |

## Architecture

### Module Structure

The Grants service has a **unique OperationGuard design**: it does NOT register OperationGuard as `APP_GUARD`. Instead, it applies `@UseGuards(OperationGuard)` on each resolver. This is because `APP_GUARD` with `Scope.REQUEST` breaks RPC handlers (DI cannot resolve request-scoped `PermissionsCacheService` in an RPC context).

```
GrantsModule
├── TenantDatabaseModule.forService('grants')
├── ConfigModule (global)
├── ThrottlerModule (60/60s)
├── MicroservicesOrchestratorModule
├── KeycloakM2MModule
├── ClientsModule: GATEWAY_SERVICE
└── GraphQLModule (ApolloFederationDriver)

Controllers: GrantsController, GrantsBulkController
Resolvers: GrantsResolver, OperationPermissionResolver, PagePermissionResolver, IntrospectionResolver
Services: GrantsService, SubgraphIntrospectionService, PermissionsCacheService (local)
```

### Local PermissionsCacheService

Grants has its own `PermissionsCacheService` (not from `@cucu/service-common`) that is aliased:

```typescript
{ provide: SCPermissionsCacheService, useExisting: PermissionsCacheService }
```

This ensures DI works seamlessly for shared interceptors/decorators.

## Schemas

### Group

```typescript
@Directive('@key(fields: "_id")')
@Schema({ timestamps: true })
class Group {
  _id: string
  name: string               // required, unique
  description?: string
  tenantId?: string
  deletedAt?: Date           // soft delete
  createdAt?: Date
  updatedAt?: Date
}
// Index: { name: 1, deletedAt: 1 }
```

### Permission (Field-Level)

```typescript
@Directive('@key(fields: "_id")')
@Schema({ timestamps: true })
class Permission {
  _id: string
  groupId: string            // → Group._id
  entityName: string         // "User", "Project", "Milestone", etc.
  fieldPath: string          // "authData.email", "personalData.dateOfBirth", etc.
  canView: boolean
  canEdit: boolean
  viewScope: FieldScope[]    // ['self'] | ['all'] | ['self','all']
  editScope: FieldScope[]
  tenantId?: string
}
// Unique index: { groupId, entityName, fieldPath }
```

**FieldScope enum**: `SELF` (own records only) | `ALL` (all records)

### OperationPermission

```typescript
@Directive('@key(fields: "_id")')
@Schema({ timestamps: true })
class OperationPermission {
  _id: string
  groupId: string            // → Group._id
  operationName: string      // "findAllUsers", "createProject", etc.
  canExecute: boolean
  operationScope: OperationScope  // 'self' | 'all'
  tenantId?: string
}
// Unique index: { groupId, operationName }
```

### PagePermission

```typescript
@Directive('@key(fields: "_id")')
@Schema({ timestamps: true })
class PagePermission {
  _id: string
  groupId: string
  pageKey: string            // "people", "settings.seniorityLevels", "gantt"
  canAccess: boolean
  tenantId?: string
}
// Unique index: { groupId, pageKey }
```

## GraphQL Schema

### Group Queries & Mutations

| Operation | Type | Args | Return |
|-----------|------|------|--------|
| `findAllGroups` | Query | — | `[Group]!` |
| `findOneGroup` | Query | `groupId: ID!` | `Group!` |
| `createGroup` | Mutation | `input: CreateGroupInput!` | `Group!` |
| `updateGroup` | Mutation | `updateGroupInput: UpdateGroupInput!` | `Group!` |
| `removeGroup` | Mutation | `input: DeleteGroupInput!` | `DeleteGroupOutput!` |

### Permission Queries & Mutations

| Operation | Type | Args | Return |
|-----------|------|------|--------|
| `findAllPermissions` | Query | — | `[Permission]!` |
| `findPermissionsByGroup` | Query | `groupId: ID!` | `[Permission]!` |
| `createPermission` | Mutation | `input: CreatePermissionInput!` | `Permission!` |
| `updatePermission` | Mutation | `updatePermissionInput: UpdatePermissionInput!` | `Permission!` |
| `removePermission` | Mutation | `input: DeletePermissionInput!` | `DeletePermissionOutput!` |
| `bulkUpdatePermissions` | Mutation | `groupId: ID!, inputs: [BulkPermissionUpdate]!` | `[Permission]!` |

### OperationPermission Queries & Mutations

| Operation | Type | Args | Return |
|-----------|------|------|--------|
| `findAllOperationPermissions` | Query | — | `[OperationPermission]!` |
| `findOperationPermissionsByGroup` | Query | `groupId: ID!` | `[OperationPermission]!` |
| `createOperationPermission` | Mutation | `input` | `OperationPermission!` |
| `updateOperationPermission` | Mutation | `input` | `OperationPermission!` |
| `removeOperationPermission` | Mutation | `_id: ID!` | `OperationPermission!` |
| `bulkUpdateOperationPermissions` | Mutation | `groupId: ID!, inputs` | `[OperationPermission]!` |

### PagePermission Queries & Mutations

| Operation | Type | Args | Return |
|-----------|------|------|--------|
| `findAllPagePermissions` | Query | — | `[PagePermission]!` |
| `findPagePermissionsByGroup` | Query | `groupId: ID!` | `[PagePermission]!` |
| `createPagePermission` | Mutation | `input` | `PagePermission!` |
| `upsertPagePermission` | Mutation | `input` | `PagePermission!` |
| `updatePagePermission` | Mutation | `input` | `PagePermission!` |
| `removePagePermission` | Mutation | `_id: ID!` | `PagePermission!` |

### Special Queries

| Query | Description |
|-------|-------------|
| `myPermissions` | Returns current user's effective permissions. Uses `@SkipOperationGuard()` — everyone can query their own permissions |
| `listFieldsFromGateway(typeName)` | Introspect all nested fields of a GraphQL type |
| `listQueryFromGateway(serviceName)` | List all queries for a service |
| `listMutationsFromGateway(serviceName)` | List all mutations for a service |

## RPC Patterns

### MessagePattern Handlers

| Pattern | Guard | Input | Output |
|---------|-------|-------|--------|
| `GROUP_EXISTS` | — | `string \| {id}` | `boolean` |
| `FIND_GROUP_BY_NAME` | — | `string \| {name}` | `Group \| null` |
| `CREATE_GROUP` | `RpcInternalGuard` | `CreateGroupInput + _internalSecret` | `Group` |
| `CREATE_PERMISSION` | `RpcInternalGuard` | `CreatePermissionInput + _internalSecret` | `Permission` |
| `UPSERT_PERMISSION` | `RpcInternalGuard` | `CreatePermissionInput + _internalSecret` | `Permission` |
| `CREATE_OPERATION_PERMISSION` | `RpcInternalGuard` | input + `_internalSecret` | `OperationPermission` |
| `UPSERT_OPERATION_PERMISSION` | `RpcInternalGuard` | input + `_internalSecret` | `OperationPermission` |
| `UPSERT_PAGE_PERMISSION` | `RpcInternalGuard` | input + `_internalSecret` | `PagePermission` |
| `FIND_OP_PERMISSIONS_BY_GROUP` | — | `{groupId}` | `OperationPermission[]` |
| `FIND_PERMISSIONS_BY_GROUP` | — | `{groupId, entityName?}` | `Permission[]` |
| `FIND_PAGE_PERMISSIONS_BY_GROUP` | — | `{groupId}` | `PagePermission[]` |
| `FIND_BULK_PERMISSIONS_MULTI` | — | `{groupIds, entityNames?, opNames?}` | `BulkPermsDTO` |

The `FIND_BULK_PERMISSIONS_MULTI` pattern is the most critical — it's called by `PermissionsCacheService` in every service to load permissions for the current request.

### BulkPermsDTO Response

```typescript
{
  canExecuteOps: string[],          // Operations the user can execute
  canViewByEntity: {                // Viewable fields per entity
    User: ["_id", "authData.name", "authData.email", ...],
    Project: ["_id", "projectBasicData.name", ...],
  },
  scopeByEntity: {                  // Field scope per entity
    User: { "personalData.dateOfBirth": "self", "authData.name": "all" }
  },
  operationScopeByOp: {            // Operation scope
    findOneUser: "self",
    findAllUsers: "all",
  }
}
```

## Business Logic

### PERMISSIONS_CHANGED Event

After any mutation that changes permissions (create/update/delete on Permission, OperationPermission, or PagePermission), the Grants service emits `PERMISSIONS_CHANGED`:

```typescript
this.gatewayClient.emit('PERMISSIONS_CHANGED', { groupIds: [affectedGroupId] });
```

This triggers instant cache invalidation across all services.

### Upsert Logic

Upsert operations (`UPSERT_PERMISSION`, `UPSERT_OPERATION_PERMISSION`, `UPSERT_PAGE_PERMISSION`) use `findOneAndUpdate` with `upsert: true` to create or update in a single atomic operation. This is used by the Bootstrap service to idempotently seed permissions.

### SubgraphIntrospectionService

Queries the Gateway's GraphQL schema via introspection to discover all types, fields, queries, and mutations. Used to power the permission admin UI:

```typescript
async listAllNestedFields(typeName: string): Promise<string[]>
async listAllQueriesByServiceName(serviceName: string): Promise<string[]>
async listAllMutationsByServiceName(serviceName: string): Promise<string[]>
```
