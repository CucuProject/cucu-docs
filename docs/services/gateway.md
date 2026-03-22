# Gateway Service

The Gateway is the **single entry point** for all client traffic. It runs Apollo Federation 2 to compose a unified GraphQL schema from 13 subgraphs, acts as a **thin proxy** for authentication (delegating logic to the Auth service), validates JWT tokens, and forwards signed headers to subgraphs.

## Overview

| Property | Value |
|----------|-------|
| Port | 3000 |
| Database | None (stateless) |
| Transport | HTTP only (no Redis RPC handlers) |
| Module | `AppModule` |
| Entry | `gateway/src/main.ts` |

The Gateway uses `createSubgraphMicroservice()` with custom options: `inheritAppConfig: false` (to prevent `GlobalAuthGuard` from applying to Redis RPC handlers) and a `beforeStart` hook that mounts the JWT auth middleware. It connects to Redis as both a client (for `send()`/`emit()`) and listener (for the microservice transport), but its `APP_GUARD`s are HTTP/GraphQL-only.

## Architecture

### Module Structure

```
AppModule
├── ConfigModule (global)
├── TenantClsModule (nestjs-cls for tenant context)
├── MicroservicesOrchestratorModule
├── PassportModule (defaultStrategy: 'jwt')
├── ThrottlerModule (60 req/60s global)
├── FederationModule (provides FederationTokenService from @cucu/security)
├── TenantAwareClientsModule (9 service clients)
└── GraphQLModule (ApolloGatewayDriver + IntrospectAndCompose)

Controllers:
├── AuthController (REST: thin proxy using TenantContextService for CLS tenant context)
└── IntrospectionController

Providers:
├── ApolloGatewayProvider
├── GlobalAuthGuard (APP_GUARD)
├── ThrottlerGuard (APP_GUARD)
└── TenantContextService (for auth controller CLS context)

Express middleware (mounted in beforeStart):
├── cookieParser
└── createJwtAuthMiddleware (JWT decode + CHECK_SESSION via RPC)
```

### Thin Proxy Pattern

The Gateway implements a **thin proxy** pattern for authentication. Instead of containing auth logic, it:

1. Receives auth requests (login, refresh, verify, etc.)
2. Forwards them to Auth service via consolidated RPC patterns
3. Returns the orchestrated response to the client

This design:
- **Centralizes auth logic** in the Auth service
- **Simplifies Gateway** — no business logic, just routing
- **Enables single-RPC flows** — e.g., `/auth/verify` calls `VERIFY_FROM_TOKEN` which returns user + tenants + permissions in one round-trip

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

### JWT Auth Middleware (Express Level)

The primary authentication mechanism is an Express middleware (`createJwtAuthMiddleware`) mounted in the `beforeStart` hook. It runs **before** Apollo Gateway registers its `/graphql` route, ensuring session validation occurs for every request:

1. Extract Bearer token from `Authorization` header
2. Decode JWT (no signature verification — that's done by the auth service during session check)
3. Reject locally expired tokens (avoid unnecessary RPC)
4. Run `CHECK_SESSION` RPC inside a CLS context (with `tenantSlug` from the JWT)
5. If session is valid: set `req.user = { sub, sessionId, groups, tenantSlug, tenantId }`
6. If session is invalid or RPC fails: leave `req.user` unset (fail-open for availability)

This approach was chosen because NestJS `@Injectable()` middlewares registered via `MiddlewareConsumer.forRoutes('*')` sometimes miss Apollo routes.

### GlobalAuthGuard

Applied globally via `APP_GUARD`. Extends Passport's `AuthGuard('jwt')`:

- Supports both HTTP and GraphQL contexts
- Skips routes decorated with `@Public()` (via `IS_PUBLIC_KEY` reflector metadata)
- On GraphQL, `req.user` is already populated by the JWT auth middleware
- On REST, works as a secondary gate for non-`@Public()` endpoints

## Apollo Federation Configuration

### RemoteGraphQLDataSource

The Gateway's `willSendRequest()` hook handles header propagation. It reads from `context.req.user`, which is set by the `createJwtAuthMiddleware` Express middleware (not by a NestJS guard):

**Authenticated user requests** (`context.req.user` exists):
1. `req.user` already contains validated `sub`, `groups`, `tenantSlug`, `tenantId` (from JWT middleware)
2. Strip `Authorization` header (no forwarding of user JWTs to subgraphs)
3. Set `x-user-id`, `x-user-groups`, `x-user-email` (decoded from JWT), `Content-Type`
4. Propagate tenant context (`x-tenant-slug`, `x-tenant-id`) from `req.user`

**Federation/internal calls** (no `req.user`):
1. Get self-signed federation JWT from `FederationTokenService` (RS256, 60s TTL)
2. Set `Authorization: Bearer {federationToken}`, `x-internal-federation-call: 1`
3. Propagate user context if the federation call was triggered by a user request (Scenario D)
4. Propagate tenant context from user JWT or request headers

**All requests**:
1. Compute HMAC-SHA256 signature of all internal headers using `INTERNAL_HEADER_SECRET`
2. Set `x-gateway-signature` — subgraphs verify this before trusting any `x-*` headers

See [Security](/shared/security.md) for details on `FederationTokenService` and signature verification.

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

### Why Gateway Uses `inheritAppConfig: false`?

The Gateway connects to Redis (via `createSubgraphMicroservice`) but overrides `inheritAppConfig: false`. This prevents `GlobalAuthGuard` and `ThrottlerGuard` (APP_GUARDs designed for HTTP/GraphQL) from applying to the Redis microservice transport. The `TenantClsInterceptor` still works because it's registered via `useGlobalInterceptors` (applies to all transports regardless).

### Why CHECK_SESSION on Every Request?

Even though JWT tokens contain user claims, the Gateway validates sessions on every request via `CHECK_SESSION` RPC (called from the Express-level `createJwtAuthMiddleware`). This enables:
- Instant session revocation (not waiting for JWT expiry)
- Real-time group membership updates
- Session idle timeout enforcement
- `lastActivity` tracking for session keep-alive

### Why Express Middleware Instead of NestJS Guard?

Apollo Gateway registers its `/graphql` route at startup. NestJS `@Injectable()` middlewares registered via `MiddlewareConsumer.forRoutes('*')` sometimes miss Apollo routes because of registration timing. By mounting `createJwtAuthMiddleware` in the `beforeStart` hook (which runs before Apollo's route registration), we guarantee session validation occurs for all requests. The middleware also sets CLS tenant context for the CHECK_SESSION RPC call.
