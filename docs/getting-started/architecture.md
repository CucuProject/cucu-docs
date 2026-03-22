# Architecture Overview

This document provides a high-level view of the Cucu platform architecture.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Frontend (Next.js 14+)                          │
│                          Apollo Client 4 + React                             │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │ HTTPS (GraphQL + REST)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Gateway Service (:3000)                            │
│  ┌─────────────────┐  ┌────────────────┐  ┌──────────────────────────────┐  │
│  │ Apollo Gateway  │  │ JWT Auth MW    │  │ REST Endpoints               │  │
│  │ Federation v2   │  │ JWT Middleware  │  │ /auth/login, /auth/refresh   │  │
│  └─────────────────┘  └────────────────┘  └──────────────────────────────┘  │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
            ┌────────────────────────┼────────────────────────┐
            │                        │                        │
            ▼                        ▼                        ▼
    ┌───────────────┐       ┌───────────────┐        ┌───────────────┐
    │ Auth (:3001)  │       │ Users (:3002) │        │ Grants(:3010) │
    │ ┌───────────┐ │       │ ┌───────────┐ │        │ ┌───────────┐ │
    │ │  MongoDB  │ │       │ │  MongoDB  │ │        │ │  MongoDB  │ │
    │ └───────────┘ │       │ └───────────┘ │        │ └───────────┘ │
    └───────────────┘       └───────────────┘        └───────────────┘
            │                        │                        │
            └────────────────────────┼────────────────────────┘
                                     │
                        ┌────────────┴────────────┐
                        │    Redis mTLS (:6380)   │
                        │  RPC + Event Transport  │
                        └─────────────────────────┘
```

## Service Communication

All inter-service communication uses **Redis** with mTLS encryption.

### Communication Patterns

| Pattern | Use Case | Example |
|---------|----------|---------|
| **MessagePattern** | Request-Response RPC | `CHECK_SESSION`, `USER_EXISTS` |
| **EventPattern** | Fire-and-Forget | `USER_DELETED`, `PERMISSIONS_CHANGED` |

### Header Flow

```
Client Request
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│                      Gateway                                 │
│  1. Validate JWT token                                      │
│  2. Call Auth service: CHECK_SESSION                        │
│  3. Extract userId, groupIds                                │
│  4. Sign headers with HMAC-SHA256                           │
│  5. Add headers to subgraph requests:                       │
│     • x-user-id: userId                                     │
│     • x-user-groups: group1,group2                          │
│     • x-gateway-signature: HMAC signature                   │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│                     Subgraph Service                         │
│  1. Verify HMAC signature (timing-safe)                     │
│  2. Extract user context from verified headers              │
│  3. Apply permission checks                                  │
│  4. Execute resolver                                         │
└─────────────────────────────────────────────────────────────┘
```

## Data Architecture

### Database Per Service

Each service owns its data and database:

```
┌─────────────────────────────────────────────────────────────┐
│  Service                Database              Collections    │
├─────────────────────────────────────────────────────────────┤
│  Auth (:3001)          auth-db (:9001)       sessions       │
│  Users (:3002)         users-db (:9002)      users          │
│  Grants (:3010)        grants-db (:9010)     groups,        │
│                                              permissions,    │
│                                              operationPerms  │
│  Projects (:3003)      projects-db (:9003)   projects       │
│  Milestones (:3004)    milestones-db(:9004)  milestones     │
└─────────────────────────────────────────────────────────────┘
```

### Cross-Service References

Services reference entities from other services using **Apollo Federation**:

```typescript
// In milestone-to-user service: User stub
@ObjectType()
@Directive('@extends')
@Directive('@key(fields: "_id")')
export class User {
  @Field(() => ID)
  @Directive('@external')
  _id: string;
}
```

## Security Architecture

### Authentication Flow

```
┌─────────────┐    POST /auth/login    ┌─────────────┐
│   Client    │ ─────────────────────► │   Gateway   │
└─────────────┘                        └──────┬──────┘
                                              │ RPC: LOGIN
                                              ▼
                                       ┌─────────────┐
                                       │    Auth     │
                                       │   Service   │
                                       └──────┬──────┘
                                              │ RPC: FIND_USER_BY_EMAIL
                                              ▼
                                       ┌─────────────┐
                                       │   Users     │
                                       │   Service   │
                                       └──────┬──────┘
                                              │
                              ◄───────────────┘
                              │
              Response: { accessToken, sessionId, userId }
              Cookie: __Host-rf = refreshToken
```

### Permission System

Three-tier permission system:

1. **Operation Level**: Can execute Query/Mutation?
2. **Field Level**: Can view/edit specific fields?
3. **Scope Level**: Own data (self) or all data?

```
┌─────────────────────────────────────────────────────────────┐
│                    Permission Check Flow                     │
├─────────────────────────────────────────────────────────────┤
│  1. OperationGuard: Is operation allowed for user groups?   │
│     └── Cache: 5 min TTL, process-wide                      │
│                                                              │
│  2. ScopeGuard: If @ScopeCapable, check 'self' vs 'all'    │
│     └── self: targetId must equal currentUserId             │
│                                                              │
│  3. FieldInterceptor: Load viewable fields for entity       │
│     └── Project only viewable fields in MongoDB query       │
│                                                              │
│  4. Response: Sanitize output based on field permissions    │
└─────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14+, React, Apollo Client 4 |
| API Gateway | NestJS, Apollo Gateway |
| Services | NestJS, Apollo Federation v2 |
| Database | MongoDB 6+ |
| Cache/Bus | Redis 7+ with mTLS |
| Container | Docker, Docker Compose |

## Key Design Decisions

### Why Federation?

- **Domain isolation**: Each team owns their service and schema
- **Independent deployment**: Services can be deployed separately
- **Unified graph**: Clients see a single GraphQL endpoint

### Why MongoDB per service?

- **Loose coupling**: Services don't share database state
- **Independent scaling**: Each database scales with its service
- **Clear ownership**: Data boundaries match service boundaries

### Why Redis mTLS?

- **Security**: Encrypted service-to-service communication
- **Performance**: Sub-millisecond message delivery
- **Patterns**: Native support for pub/sub and request-response

## Next Steps

- [Apollo Federation](/architecture/federation) - Deep dive into federation patterns
- [Service Communication](/architecture/communication) - RPC and event patterns
- [Permission System](/architecture/permissions) - 3-tier permission architecture
