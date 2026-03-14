# System Overview

The Cucu platform is a distributed microservices architecture built on NestJS with Apollo Federation 2.

## Service Inventory

| Service | Port | DB Port | Purpose |
|---------|------|---------|---------|
| **gateway** | 3000 | N/A | Apollo Federation gateway, authentication entry point |
| **auth** | 3001 | 9001 | Session management, JWT tokens, refresh tokens |
| **users** | 3002 | 9002 | User CRUD, profiles, lookup tables |
| **projects** | 3003 | 9003 | Project management, status lifecycle |
| **milestones** | 3004 | 9004 | Milestone CRUD, status tracking |
| **milestone-to-user** | 3008 | 9005 | N:N relationship: users ↔ milestones |
| **milestone-to-project** | 3009 | 9006 | N:N relationship: projects ↔ milestones |
| **group-assignments** | 3007 | 9007 | N:N relationship: users ↔ groups |
| **project-access** | 3008 | 9008 | Project-level access control |
| **grants** | 3010 | 9010 | Permission system (Groups, Permissions, OperationPermissions) |
| **organization** | 3012 | 9012 | Lookup tables: SeniorityLevel, JobRole, Company |
| **bootstrap** | 3100 | N/A | Seed data initialization |

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL LAYER                                   │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                         Client (Browser/App)                            │  │
│  │                      Next.js 14 + Apollo Client                         │  │
│  └────────────────────────────────┬───────────────────────────────────────┘  │
└───────────────────────────────────┼──────────────────────────────────────────┘
                                    │ HTTPS
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              GATEWAY LAYER                                    │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                     Gateway Service (:3000)                             │  │
│  │  ┌──────────────┐  ┌───────────────┐  ┌────────────────────────────┐   │  │
│  │  │ Apollo       │  │ GlobalAuth    │  │ REST Endpoints             │   │  │
│  │  │ Federation   │  │ Guard         │  │ • POST /auth/login         │   │  │
│  │  │ Composer     │  │ JwtStrategy   │  │ • POST /auth/refresh       │   │  │
│  │  └──────────────┘  └───────────────┘  │ • POST /auth/logout        │   │  │
│  │                                        │ • POST /auth/force-revoke  │   │  │
│  └────────────────────────────────────────┴────────────────────────────────┘  │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │ Redis mTLS RPC
┌───────────────────────────────────┼──────────────────────────────────────────┐
│                              SERVICE LAYER                                    │
│                                   │                                           │
│     ┌─────────────────────────────┼─────────────────────────────────┐        │
│     │                             │                                  │        │
│     ▼                             ▼                                  ▼        │
│ ┌───────────┐              ┌───────────┐                     ┌───────────┐   │
│ │Auth :3001 │              │Users :3002│                     │Grants:3010│   │
│ │           │◄────────────►│           │◄───────────────────►│           │   │
│ │ Sessions  │  RPC         │ Profiles  │        RPC          │ Perms     │   │
│ │ JWT       │              │ CRUD      │                     │ Groups    │   │
│ └─────┬─────┘              └─────┬─────┘                     └─────┬─────┘   │
│       │                          │                                  │         │
│       ▼                          ▼                                  ▼         │
│ ┌───────────┐              ┌───────────┐                     ┌───────────┐   │
│ │MongoDB    │              │MongoDB    │                     │MongoDB    │   │
│ │auth-db    │              │users-db   │                     │grants-db  │   │
│ │:9001      │              │:9002      │                     │:9010      │   │
│ └───────────┘              └───────────┘                     └───────────┘   │
│                                                                               │
│     ┌─────────────────────────────────────────────────────────┐              │
│     │              Additional Services                         │              │
│     │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │              │
│     │  │Projects  │ │Milestones│ │Milestone │ │Group     │   │              │
│     │  │:3003     │ │:3004     │ │ToUser    │ │Assign.   │   │              │
│     │  │          │ │          │ │:3008     │ │:3007     │   │              │
│     │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │              │
│     └─────────────────────────────────────────────────────────┘              │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
┌───────────────────────────────────┼──────────────────────────────────────────┐
│                          INFRASTRUCTURE LAYER                                 │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                      Redis (:6379/:6380)                                │  │
│  │              Message Bus + Session Cache + Pub/Sub                      │  │
│  │                     mTLS Encryption                                     │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Patterns

### Request Flow (GraphQL Query)

```
1. Client → Gateway: POST /graphql with Bearer token
2. Gateway → GlobalAuthGuard: Validate JWT
3. GlobalAuthGuard → Auth Service: CHECK_SESSION (RPC)
4. Auth Service → Gateway: { isValid, userId, groupIds }
5. Gateway: Add signed headers (x-user-id, x-user-groups, x-gateway-signature)
6. Gateway → Subgraph: Forward query with headers
7. Subgraph → OperationGuard: Check operation permission
8. Subgraph → ScopeGuard: Check scope (if @ScopeCapable)
9. Subgraph → Resolver: Execute with field filtering
10. Response flows back through federation
```

### Event Flow (User Deletion)

```
1. Users Service: removeUser(userId) called
2. Users Service → MongoDB: Set deletedAt, active=false
3. Users Service → Redis: Emit 'USER_DELETED' event
4. Auth Service → Listener: Receive USER_DELETED
5. Auth Service: Revoke all sessions for userId
6. MilestoneToUser Service → Listener: Receive USER_DELETED
7. MilestoneToUser Service: Delete all assignments for userId
8. GroupAssignments Service → Listener: Receive USER_DELETED
9. GroupAssignments Service: Delete all group assignments for userId
```

## Service Dependencies

```
                    ┌──────────┐
                    │ Gateway  │
                    └────┬─────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
    ┌────────┐      ┌────────┐     ┌──────────┐
    │  Auth  │◄────►│ Users  │◄───►│  Grants  │
    └────────┘      └───┬────┘     └────┬─────┘
                        │               │
         ┌──────────────┼───────────────┤
         ▼              ▼               ▼
    ┌──────────┐  ┌───────────┐  ┌──────────────┐
    │ Group    │  │ Milestone │  │ Organization │
    │ Assign.  │  │ ToUser    │  │              │
    └──────────┘  └───────────┘  └──────────────┘
```

## Key Invariants

1. **Single Entry Point**: All client requests go through the Gateway
2. **Database Isolation**: Each service owns its database
3. **Signed Headers**: All inter-service calls include HMAC signature
4. **Permission Cache**: 5-minute TTL with instant invalidation
5. **Soft Deletes**: Users are soft-deleted (deletedAt timestamp)
6. **Session-Based Auth**: JWT + refresh tokens + server-side sessions

## Environment Modes

| Mode | Configuration | Use Case |
|------|--------------|----------|
| Development | `.env.development` | Local development with docker-compose |
| Production | `.env.production` | Production deployment |
| Test | `.env.test` | Automated testing |

## Next Steps

- [Apollo Federation](/architecture/federation) - Federation patterns and entity resolution
- [Service Communication](/architecture/communication) - RPC and event patterns in detail
- [Authentication Flow](/architecture/auth-flow) - JWT, sessions, and refresh tokens
