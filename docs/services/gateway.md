# Gateway Service

The Gateway is the **single entry point** for all client traffic. It runs Apollo Federation 2 to compose a unified GraphQL schema from 11 subgraphs, handles REST authentication endpoints, validates JWT tokens, and forwards signed headers to subgraphs.

## Overview

| Property | Value |
|----------|-------|
| Port | 3000 |
| Database | None (stateless) |
| Transport | HTTP only (no Redis RPC handlers) |
| Module | `AppModule` |
| Entry | `gateway/src/main.ts` |

The Gateway does **not** use `createSubgraphMicroservice()` — it has a custom bootstrap. It connects to Redis only as a **client** (for `send()`/`emit()` to other services), never as a listener.

## Architecture

### Module Structure

```
AppModule
├── ConfigModule (global)
├── MicroservicesOrchestratorModule
├── PassportModule (defaultStrategy: 'jwt')
├── ThrottlerModule (60 req/60s global)
├── KeycloakGatewayM2mModule (machine-to-machine tokens for federation)
├── RedisClientsModule (9 service clients)
└── GraphQLModule (ApolloGatewayDriver + IntrospectAndCompose)

Controllers:
├── AuthController (REST: login, refresh, logout, verify, discover, switch)
└── IntrospectionController

Providers:
├── ApolloGatewayProvider
├── JwtStrategy (Passport)
├── GlobalAuthGuard (APP_GUARD)
└── ThrottlerGuard (APP_GUARD)
```

### Redis Clients

The Gateway registers clients for all services it needs to call via RPC:

- `AUTH_SERVICE` — session management (CHECK_SESSION, REVOKE_SESSION, etc.)
- `TENANTS_SERVICE` — identity verification, tenant discovery
- `GRANTS_SERVICE` — unused directly, available for future use
- `USERS_SERVICE`, `MILESTONE_TO_USER_SERVICE`, `MILESTONES_SERVICE`, `PROJECTS_SERVICE`, `MILESTONE_TO_PROJECT_SERVICE`, `GROUP_ASSIGNMENTS_SERVICE`

## REST Endpoints

| Method | Path | Auth | Rate Limit | Purpose |
|--------|------|------|-----------|---------|
| `POST` | `/auth/login` | `@Public()` | 100/15min | Login via platform DB |
| `POST` | `/auth/refresh` | `@Public()` | — | Token rotation via refresh cookie |
| `POST` | `/auth/logout` | `GlobalAuthGuard` | — | Revoke session + clear cookie |
| `GET` | `/auth/verify` | `@Public()` | — | Check refresh cookie validity |
| `POST` | `/auth/discover` | `@Public()` | 10/1min | Find tenants for an email |
| `POST` | `/auth/switch` | `GlobalAuthGuard` | — | Switch to different tenant |
| `POST` | `/auth/force-revoke` | `GlobalAuthGuard` + SUPERADMIN | — | Revoke another user's session |

## Authentication Flow

### GlobalAuthGuard

Applied globally via `APP_GUARD`. Extends Passport's `AuthGuard('jwt')`:

- Supports both HTTP and GraphQL contexts
- Skips routes decorated with `@Public()` (via `IS_PUBLIC_KEY` reflector metadata)
- On GraphQL, extracts request from `GqlExecutionContext.create(context).getContext().req`

### JwtStrategy

Passport strategy that validates every authenticated request:

1. Extract Bearer token from `Authorization` header
2. Verify JWT signature using `JWT_SECRET`
3. Call `CHECK_SESSION` RPC to Auth service with `payload.sessionId`
4. Return `{ sub: userId, sessionId, groups, tenantSlug, tenantId }` as `req.user`

## Apollo Federation Configuration

### RemoteGraphQLDataSource

The Gateway's `willSendRequest()` hook handles header propagation:

**Authenticated user requests** (has Bearer token):
1. Decode JWT to extract `sessionId`
2. `CHECK_SESSION` RPC → get `userId`, `groupIds`
3. Strip `Authorization` header (no forwarding of user JWTs to subgraphs)
4. Set `x-user-groups`, `x-user-id`, `Content-Type`
5. Propagate tenant context (`x-tenant-slug`, `x-tenant-id`) from JWT payload

**Federation/internal calls** (no Bearer token):
1. Get M2M token from Keycloak
2. Set `Authorization: Bearer {m2mToken}`, `x-internal-federation-call: 1`
3. Propagate user context if the federation call was triggered by a user request
4. Propagate tenant context from user JWT or request headers

**All requests**:
1. Compute HMAC-SHA256 signature of all internal headers
2. Set `x-gateway-signature` — subgraphs verify this before trusting any `x-*` headers

### Introspection Control

```typescript
const allowIntrospection = configService.get('ALLOW_INTROSPECTION') === 'true';
server: {
  introspection: allowIntrospection,
  plugins: allowIntrospection ? [] : [disableIntrospectionPlugin()],
}
```

## Key Design Decisions

### Why REST for Auth?

Login, refresh, and logout use REST endpoints instead of GraphQL mutations because:
1. **Cookies** — httpOnly refresh cookies must be set via HTTP response headers, not GraphQL
2. **Simplicity** — auth flows are sequential, not graph-shaped
3. **Standards** — CSRF protection patterns work better with REST

### Why Gateway Doesn't Listen on Redis?

The Gateway only calls other services; no service calls the Gateway. It's a pure HTTP/GraphQL server and RPC client. This simplifies its architecture and avoids circular dependencies.

### Why CHECK_SESSION on Every Request?

Even though JWT tokens contain user claims, the Gateway validates sessions on every request via `CHECK_SESSION` RPC. This enables:
- Instant session revocation (not waiting for JWT expiry)
- Real-time group membership updates
- Session idle timeout enforcement
- `lastActivity` tracking for session keep-alive
