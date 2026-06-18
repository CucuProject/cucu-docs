# Grants Service

The Grants service is Cucu's tenant-scoped permission engine. It owns Groups, field permissions, operation permissions, page permissions, current-user permission aggregation, and schema introspection for the permission admin UI.

Grants answers "can this operation or field be used?" Object visibility for individual Projects is handled separately by ProjectAccess.

## Service Profile

| Property | Value |
|---|---|
| Runtime | NestJS subgraph + Redis RPC |
| Database | `grants_{tenantSlug}` |
| Collections | `groups`, `permissions`, `operationpermissions`, `pagepermissions` |
| App module | `apps/grants/src/grants.module.ts` |
| Main service | `apps/grants/src/grants.service.ts` |

## Responsibilities

- Manage permission groups.
- Manage field-level permissions with view/edit scopes.
- Manage operation-level permissions with operation scopes.
- Manage page access permissions.
- Aggregate effective permissions across multiple groups.
- Provide `myPermissions` for the frontend.
- Provide `FIND_BULK_PERMISSIONS_MULTI` for request-scoped permission caches.
- Enforce permission invariants from `@cucu/permission-rules`.
- Invalidate permission caches after changes.
- Introspect the Gateway schema to list configurable fields, queries, and mutations.

## Data Model

| Collection | Key fields | Index |
|---|---|---|
| `groups` | `name`, `description`, `deletedAt` | `{ name, deletedAt }` plus schema-level unique `name`. |
| `permissions` | `groupId`, `entityName`, `fieldPath`, `canView`, `canEdit`, `viewScope`, `editScope` | unique `{ groupId, entityName, fieldPath }`. |
| `operationpermissions` | `groupId`, `operationName`, `canExecute`, `operationScope` | unique `{ groupId, operationName }`. |
| `pagepermissions` | `groupId`, `pageKey`, `canAccess` | unique `{ groupId, pageKey }`. |

## GraphQL API

| Area | Operations |
|---|---|
| Groups | `findAllGroups`, `findOneGroup`, `createGroup`, `updateGroup`, `removeGroup` |
| Field permissions | `findAllPermissions`, `findPermissionsByGroup`, `createPermission`, `updatePermission`, `removePermission`, `bulkUpdatePermissions` |
| Operation permissions | `findAllOperationPermissions`, `findOperationPermissionsByGroup`, `createOperationPermission`, `updateOperationPermission`, `removeOperationPermission`, `bulkUpdateOperationPermissions` |
| Page permissions | `findAllPagePermissions`, `findPagePermissionsByGroup`, `createPagePermission`, `upsertPagePermission`, `updatePagePermission`, `removePagePermission` |
| Current user | `myPermissions` |
| Introspection | `listFieldsFromGateway`, `listQueryFromGateway`, `listMutationsFromGateway` |

`OperationGuard` is applied at resolver level, not as a global `APP_GUARD`, because a request-scoped global guard breaks RPC handler DI in this service.

## RPC API

| Pattern | Purpose |
|---|---|
| `GROUP_EXISTS` | Referential group check. |
| `FIND_GROUP_BY_NAME` | Lookup group by name, including SUPERADMIN checks. |
| `CREATE_GROUP` | Bootstrap group creation. |
| `CREATE_PERMISSION` | Bootstrap field permission creation. |
| `UPSERT_PERMISSION` | Idempotent field permission seed/update. |
| `CREATE_OPERATION_PERMISSION` | Bootstrap operation permission creation. |
| `UPSERT_OPERATION_PERMISSION` | Idempotent operation permission seed/update. |
| `FIND_OP_PERMISSIONS_BY_GROUP` | Operation permissions for a group. |
| `FIND_PERMISSIONS_BY_GROUP` | Field permissions for a group, optionally by entity. |
| `UPSERT_PAGE_PERMISSION` | Idempotent page permission seed/update. |
| `FIND_PAGE_PERMISSIONS_BY_GROUP` | Page permissions for a group. |
| `GET_MY_PERMISSIONS` | Effective permissions for a list of groups. |
| `CHECK_OPERATION_PERMISSION` | Lightweight allowed/denied operation check. |
| `FIND_BULK_PERMISSIONS_MULTI` | Hot-path operation and field permission aggregation. |

## Permission Aggregation

`FIND_BULK_PERMISSIONS_MULTI` loads permissions in bulk:

- operation permissions are ORed across groups;
- field permissions are ORed by entity and field path;
- view/edit scopes are unioned;
- `ALL` dominates when both `SELF` and `ALL` are present;
- `INTERNAL_CALL` grants all known operations/fields for internal calls without user context.

`GET_MY_PERMISSIONS` also returns page permissions and filters internal grants-management operations out of the frontend payload using `HIDDEN_FROM_MY_PERMISSIONS`.

## Invariants

- `canEdit=true` implies `canView=true`.
- `canView=false` forces `canEdit=false`.
- Empty scopes default to `ALL`.
- Protected operations can only be enabled by SUPERADMIN or internal bootstrap.
- Operations with fixed scope cannot be assigned another scope.
- Bulk updates are limited to 500 items.
- Field group siblings can be synced by `FIELD_GROUPS` after permission changes.

## Cache Invalidation

After field, operation, or page permission mutations, Grants emits:

```ts
PERMISSIONS_CHANGED { groupIds: [...] }
```

The event is emitted through the Gateway client configured in the Grants module. Other services listen for this event and invalidate local permission caches.

## Security Boundary

- RPC calls bypass GraphQL `OperationGuard`; bootstrap-sensitive handlers use `AllowRpcCallers('BOOTSTRAP')`.
- The local permission cache only trusts `x-user-groups` when Gateway HMAC verification passes.
- The service does not decode raw bearer JWTs to infer groups.
- Internal federation calls without user context may resolve to `INTERNAL_CALL`; user-context calls remain permission checked.

## Example

```json
{
  "groupIds": ["665..."],
  "operation": "forceRevokeSession"
}
```

`CHECK_OPERATION_PERMISSION` response:

```json
{ "allowed": true }
```

## Relevant Tests

- `apps/grants/tests/grants-controller.spec.ts`
- `apps/grants/tests/grants-bulk-controller.spec.ts`
- `apps/grants/tests/grants-permission.service.spec.ts`
- `apps/grants/tests/grants-op-permission.service.spec.ts`
- `apps/grants/tests/grants-page-permission.service.spec.ts`
- `apps/grants/tests/grants-group.service.spec.ts`
- `apps/grants/tests/grants-helpers.service.spec.ts`

## Notes and Risks

- `getCascadeRules` is imported for future backend cascade enforcement but is not used in the reviewed code.
- `groups.name` is schema-unique while groups are soft-deleted, so name reuse after delete should be treated carefully.
- Grants is not Project object visibility; keep it separate from ProjectAccess.

## Source References

- `apps/grants/src/grants.module.ts`
- `apps/grants/src/grants.service.ts`
- `apps/grants/src/controllers/grants.controller.ts`
- `apps/grants/src/controllers/grants-bulk.controller.ts`
- `apps/grants/src/resolvers/grants.resolver.ts`
- `apps/grants/src/resolvers/operation-permission.resolver.ts`
- `apps/grants/src/resolvers/page-permission.resolver.ts`
- `apps/grants/src/permissions/permissions-cache.service.ts`
- `apps/grants/src/guard/operation.guard.ts`
