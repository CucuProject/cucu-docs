# System Architecture Overview

The Cucu platform is a **multi-tenant, distributed microservices architecture** built on NestJS with Apollo Federation 2. It implements a project management and resource allocation system with fine-grained permission control and complete tenant isolation at the database level.

## Major Phases Completed

| Phase | Date | Scope |
|-------|------|-------|
| **Phase 1: Multi-Tenant** | 15 Mar 2026 | Physical database isolation (database-per-tenant), TenantConnectionManager, The Wall whitelist, withTenantId() mixin |
| **Phase 2: Universal Auth** | 16 Mar 2026 | Atlassian-style login (email → discover tenants → select → password), tenant switch without re-login, signup multi-tenant, FE middleware + TenantProvider |
| **Phase 3: Security Audit** | 23 Mar 2026 | 7 findings fixed (F-031 to F-045), 239 new tests → ~980 total, RpcInternalGuard, MongoDB credential isolation, timing-safe verification, Gateway endpoint consolidation |
| **Phase 3.5: Service-Common Refactor** | 22 Mar 2026 | 9 sub-path exports, all tsconfig migrated to `moduleResolution: "node16"` |
| **Phase 4: nestjs-cls Migration** | 22 Mar 2026 | Root cause fix for Apollo Federation context, replaced raw AsyncLocalStorage with nestjs-cls, all 11 subgraph contexts updated |

## Design Principles

1. **Physical Database Isolation** — each tenant gets a separate MongoDB database per service (e.g., `users_acme`, `grants_acme`), not just a filter column. Implemented in Phase 1 with `TenantConnectionManager` (max 200 virtual connections, 15min idle timeout).
2. **Single Entry Point** — all client traffic flows through the Gateway, which validates JWT tokens and forwards HMAC-signed headers to subgraphs. HTTP endpoints consolidated in Phase 3.
3. **Federation over Monolith** — GraphQL schema is distributed across services via Apollo Federation 2; each service owns its domain entities. Fixed in Phase 4 via nestjs-cls to properly handle context across federation boundaries.
4. **Event-Driven Side Effects** — state changes propagate via Redis pub/sub events (fire-and-forget), while queries use request-response RPC. RPC calls are now authenticated via HMAC + `_internalSecret` (Phase 3, F-031).
5. **Permission as Data** — operation-level, field-level, and page-level permissions are stored in the Grants service and enforced at every subgraph. Protected operations require RPC auth (Phase 3).

## Service Inventory

| Service | Port | DB Convention | Domain |
|---------|------|---------------|--------|
| **gateway** | 3000 | N/A | Apollo Federation gateway, REST auth endpoints, JWT validation |
| **auth** | 3001 | `auth_{tenant}` | Session management, JWT token issuance, refresh rotation |
| **users** | 3002 | `users_{tenant}` | User CRUD, profiles (AuthData, PersonalData, EmploymentData) |
| **projects** | 3003 | `projects_{tenant}` | Project management, templates |
| **milestones** | 3004 | `milestones_{tenant}` | Milestone CRUD, status tracking, dependencies |
| **milestone-to-user** | 3005 | `milestone-to-user_{tenant}` | N:N user↔milestone assignments, resource daily allocations |
| **milestone-to-project** | 3006 | `milestone-to-project_{tenant}` | N:N project↔milestone assignments |
| **group-assignments** | 3007 | `group-assignments_{tenant}` | N:N user↔group assignments |
| **project-access** | 3008 | `project-access_{tenant}` | Project-level role-based access control |
| **grants** | 3010 | `grants_{tenant}` | Groups, Permissions, OperationPermissions, PagePermissions |
| **organization** | 3012 | `organization_{tenant}` | Lookup tables: SeniorityLevel, JobRole, Company, RoleCategory |
| **holidays** | 3013 | `holidays` (shared) + `holidays_{tenant}` | National holidays (shared), company closures, user absences |
| **tenants** | 3002 | Platform DB (shared) | Tenant registry, user identities, provisioning, `resolve/:slug` HTTP endpoint |
| **audit** | 3015 | `audit` (centralized) | Audit trail — persists security events via `AUDIT_EVENT` pattern |
| **bootstrap** | 3100 | N/A (RPC client) | Seed data initialization, multi-tenant provisioning |

## Architecture Diagram

```mermaid
graph TB
    subgraph External
        Client[Client - Next.js + Apollo Client]
    end

    subgraph "Gateway Layer"
        GW[Gateway :3000]
        GW --> |JWT Decode + CHECK_SESSION| JwtMw[jwtAuthMiddleware]
        GW --> |HMAC Signing| SubgraphFwd[Subgraph Forwarding]
    end

    subgraph "Service Layer"
        AUTH[Auth :3001]
        USERS[Users :3002]
        PROJECTS[Projects :3003]
        MILESTONES[Milestones :3004]
        M2U[MilestoneToUser :3005]
        M2P[MilestoneToProject :3006]
        GA[GroupAssignments :3007]
        PA[ProjectAccess :3008]
        GRANTS[Grants :3010]
        ORG[Organization :3012]
        HOLIDAYS[Holidays :3013]
        TENANTS[Tenants :3002]
        AUDIT[Audit :3015]
    end

    subgraph "Infrastructure"
        REDIS[Redis :6379/6380 - mTLS]
        MONGODB[(MongoDB - Per-tenant DBs)]
        PLATFORM_DB[(Platform DB - Shared)]
    end

    Client -->|HTTPS| GW
    GW -->|Redis RPC| AUTH
    GW -->|Federation HTTP| AUTH & USERS & PROJECTS & MILESTONES & M2U & M2P & GA & PA & GRANTS & ORG & HOLIDAYS & TENANTS

    AUTH -->|emit AUDIT_EVENT| AUDIT
    AUDIT --> MONGODB

    AUTH --> REDIS
    AUTH --> MONGODB
    USERS --> REDIS & MONGODB
    GRANTS --> REDIS & MONGODB
    HOLIDAYS --> REDIS & MONGODB & PLATFORM_DB
    TENANTS --> PLATFORM_DB
```

## Data Flow Patterns

### Authenticated GraphQL Request

```mermaid
sequenceDiagram
    participant C as Client
    participant GW as Gateway
    participant JWT as jwtAuthMiddleware
    participant Auth as Auth Service
    participant SG as Subgraph

    C->>GW: POST /graphql (Bearer token)
    GW->>GW: jwtAuthMiddleware: decode JWT
    GW->>Auth: CHECK_SESSION(sessionId) via RPC (in CLS tenant context)
    Auth-->>GW: {isValid, userId, groupIds}
    GW->>GW: req.user = {sub, sessionId, groups, tenantSlug}

    Note over GW: Apollo RemoteGraphQLDataSource.willSendRequest
    GW->>GW: Set x-user-groups, x-user-id, x-tenant-slug
    GW->>GW: HMAC sign headers → x-gateway-signature

    GW->>SG: Forward query with signed headers
    SG->>SG: ClsMiddleware + TenantClsInterceptor → set CLS context
    SG->>SG: OperationGuard → check canExecute
    SG->>SG: ViewFieldsInterceptor → load field permissions
    SG->>SG: Resolver executes with field filtering
    SG-->>GW: Response
    GW-->>C: Federated response
```

### Event-Driven Side Effects (User Deletion)

```mermaid
sequenceDiagram
    participant Resolver as Users Resolver
    participant US as Users Service
    participant Redis as Redis Pub/Sub
    participant Auth as Auth Service
    participant M2U as MilestoneToUser
    participant GA as GroupAssignments

    Resolver->>US: removeUser(userId)
    US->>US: Set deletedAt, deletedBy
    US->>Redis: emit('USER_DELETED', {userId})
    
    par Parallel event handlers
        Redis->>Auth: USER_DELETED
        Auth->>Auth: revokeAllSessionsOfUser
    and
        Redis->>M2U: USER_DELETED
        M2U->>M2U: deleteAssignmentsForUser
    and
        Redis->>GA: USER_DELETED
        GA->>GA: deleteGroupAssignmentsForUser
    end
```

### Permission Change Propagation

```mermaid
sequenceDiagram
    participant Admin as Admin UI
    participant Grants as Grants Service
    participant Redis as Redis
    participant Services as All Services

    Admin->>Grants: bulkUpdatePermissions(groupId, changes)
    Grants->>Grants: Update DB
    Grants->>Redis: emit('PERMISSIONS_CHANGED', {groupIds})
    
    par Cache invalidation
        Redis->>Services: PERMISSIONS_CHANGED
        Services->>Services: PermissionsCacheService.invalidateGroups(groupIds)
    end
    
    Note over Services: Next request re-fetches permissions from Grants
```

## Service Dependencies

```mermaid
graph LR
    GW[Gateway] --> AUTH[Auth]
    GW --> TENANTS[Tenants]
    GW --> GRANTS[Grants]
    
    AUTH --> USERS[Users]
    AUTH --> TENANTS
    
    USERS --> GA[GroupAssignments]
    USERS --> M2U[MilestoneToUser]
    USERS --> ORG[Organization]
    USERS --> AUTH
    
    MILESTONES[Milestones] --> M2U
    MILESTONES --> M2P[MilestoneToProject]
    
    PROJECTS[Projects] --> M2P
    
    ORG --> USERS
    
    subgraph "Every service"
        ALL[All Subgraphs] --> GRANTS
    end
```

## Key Architectural Invariants

| Invariant | Implementation |
|-----------|---------------|
| **Signed Headers** | Gateway HMAC-signs `x-user-groups`, `x-user-id`, `x-tenant-slug`, `x-tenant-id`, `x-gateway-timestamp` with `INTERNAL_HEADER_SECRET`. Includes timestamp for anti-replay (30s window). Subgraphs verify via `verifyGatewaySignature()` |
| **Physical DB Isolation** | `TenantConnectionManager` creates per-tenant connections: `{serviceName}_{tenantSlug}`. The "Wall" rejects unknown tenant slugs |
| **Permission Cache** | 5-minute process-wide TTL with instant invalidation on `PERMISSIONS_CHANGED` events |
| **Soft Deletes** | Users use `deletedAt` timestamp; hard delete available as separate operation |
| **Session-Based Auth** | JWT access token (short-lived) + httpOnly refresh cookie (7d) + server-side session in MongoDB |
| **Tenant Context Propagation** | HTTP: `x-tenant-slug` header read by `ClsMiddleware` (from `nestjs-cls`). RPC: `_tenantSlug` field auto-injected by `TenantAwareClientProxy`, read by `TenantClsInterceptor`, stored in CLS context via `ClsService` |
| **RPC Security** | `RpcInternalGuard` validates `_internalSecret` on ALL RPC handlers (injected by `TenantAwareClientProxy`). `@SkipRpcGuard()` exempts specific handlers. |

## Test Coverage

| Repository | Tests | Scope |
|-----------|-------|-------|
| `cucu-nest` | 130 | Gateway (JWT middleware, session cache, auth controller), Auth (orchestrator, session, token), Tenants (provisioning, identity), Grants (permissions, guards) |
| `@cucu/service-common` | 63 | Redis TLS, TenantClsInterceptor, TenantAwareClientProxy, RpcInternalGuard, BaseSubgraphContext, password validators |
| `@cucu/tenant-db` | 30 | TenantConnectionManager (lifecycle, whitelist, pool, cleanup) |
| `@cucu/security` | 16 | FederationTokenService, verifyFederationJwt, verifyGatewaySignature |
| **Total** | **239** | |

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22, NestJS 10 |
| GraphQL | Apollo Federation 2 (IntrospectAndCompose) |
| Database | MongoDB (per-tenant via Mongoose `useDb`) |
| Transport | Redis with mTLS (microservice RPC + event bus + cache) |
| Auth | Passport.js + JWT (RS256) + bcryptjs |
| Security | `@cucu/security` (RS256 federation JWTs, HMAC signature verification with anti-replay) |
| Shared Infra | `@cucu/service-common` (guards, interceptors, context, bootstrap, validators) |
| Multi-tenancy | `@cucu/tenant-db` (connection pooling) + `@cucu/service-common` (`nestjs-cls` context via `TenantClsModule`) |
| Orchestration | `@cucu/microservices-orchestrator` (dependency checking at startup) |

## Next Steps

- [Multi-Tenant Architecture](/architecture/multi-tenant) — complete DB isolation design
- [Service Communication](/architecture/communication) — RPC and event patterns
- [Apollo Federation](/architecture/federation) — entity resolution and cross-service fields
- [Authentication Flow](/architecture/auth-flow) — login, JWT, refresh, session lifecycle
- [Permission System](/architecture/permissions) — three-tier permission enforcement
- [Startup Orchestration](/architecture/startup) — service dependency checking
- [Security](/shared/security) — federation JWT signing, header verification, RPC guards
