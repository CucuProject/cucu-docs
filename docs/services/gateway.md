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
├── ThrottlerModule (60 req/60s global, per-route overrides for signup/discover)
├── FederationModule (provides FederationTokenService from @cucu/security)
├── TenantAwareClientsModule (9 service clients)
└── GraphQLModule (ApolloGatewayDriver + IntrospectAndCompose)

Controllers:
├── AuthController (REST: thin proxy using TenantContextService for CLS tenant context)
├── TenantsController (REST: signup, check-slug, status — proxied to Tenants via RPC)
└── IntrospectionController

Providers:
├── ApolloGatewayProvider
├── GlobalAuthGuard (APP_GUARD)
├── ThrottlerGuard (APP_GUARD)
└── TenantContextService (for auth controller CLS context)

Express middleware (mounted in main.ts):
├── Header sanitization (strips x-internal-federation-call, x-user-groups, x-user-id,
│   x-gateway-signature, x-gateway-timestamp, x-tenant-slug, x-tenant-id, x-user-email)
Express middleware (mounted in beforeStart):
├── cookieParser
└── createJwtAuthMiddleware (JWT decode + CHECK_SESSION via RPC, with 30s in-memory session cache)
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

### Auth Endpoints (`/auth`)

| Method | Path | Auth | Rate Limit | Purpose |
|--------|------|------|-----------|---------|
| `POST` | `/auth/login` | `@Public()` | Per-route (login) | Login via platform DB |
| `POST` | `/auth/refresh` | `@Public()` | — | Token rotation via refresh cookie |
| `POST` | `/auth/logout` | `GlobalAuthGuard` | — | Revoke session + clear cookie |
| `GET` | `/auth/verify` | `@Public()` | — | Check refresh cookie validity |
| `GET` | `/auth/me` | `@Public()` | — | Get current user info + permissions (for Next.js RSC layouts) |
| `POST` | `/auth/discover` | `@Public()` | Per-route (discover) | Find tenants for an email |
| `POST` | `/auth/switch` | `GlobalAuthGuard` | — | Switch to different tenant |
| `POST` | `/auth/force-revoke` | `GlobalAuthGuard` + `forceRevokeSession` permission | — | Revoke another user's session |

### Tenant Endpoints (`/tenants`)

| Method | Path | Auth | Rate Limit | Purpose |
|--------|------|------|-----------|---------|
| `POST` | `/tenants/signup` | `@Public()` | Per-route (signup) | Create tenant + provision databases |
| `GET` | `/tenants/check-slug/:slug` | `@Public()` | Per-route (discover) | Real-time slug availability check |
| `GET` | `/tenants/status/:id` | `@Public()` | — | Poll provisioning status (validates ObjectId format) |

The `TenantsController` is a thin proxy — each endpoint delegates to the Tenants service via RPC (`SIGNUP_TENANT`, `CHECK_SLUG_AVAILABILITY`, `GET_TENANT_STATUS`). The tenant HTTP endpoints were moved from the Tenants subgraph to the Gateway to consolidate all public-facing HTTP endpoints in a single service, simplify CORS/rate-limiting configuration, and avoid exposing subgraph HTTP ports to the internet.

::: info
The `resolve/:slug` endpoint remains in the Tenants subgraph (not the Gateway) because it's called server-to-server by the Next.js middleware, not by end-user browsers. It's protected by `TENANT_RESOLVE_SECRET` via the `x-internal-resolve` header.
:::

## Authentication Flow

### JWT Auth Middleware (Express Level)

The primary authentication mechanism is an Express middleware (`createJwtAuthMiddleware`) mounted in the `beforeStart` hook. It runs **before** Apollo Gateway registers its `/graphql` route, ensuring session validation occurs for every request:

1. Extract Bearer token from `Authorization` header
2. Decode JWT (no signature verification — that's done by the auth service during session check)
3. Reject locally expired tokens (avoid unnecessary RPC)
4. **Check session cache** — in-memory cache with 30s TTL (see below)
5. On cache miss: run `CHECK_SESSION` RPC inside a CLS context (with `tenantSlug` from the JWT)
6. If session is valid: set `req.user = { sub, sessionId, groups, tenantSlug, tenantId }`
7. If session is invalid: leave `req.user` unset (treat as unauthenticated)
8. If RPC fails (auth service down): **return 503** (fail-closed, not fail-open)

This approach was chosen because NestJS `@Injectable()` middlewares registered via `MiddlewareConsumer.forRoutes('*')` sometimes miss Apollo routes.

### Session Cache

The JWT auth middleware maintains an **in-memory, per-process session cache** to reduce RPC load:

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `CACHE_TTL_MS` | 30,000 (30s) | How long a CHECK_SESSION result is cached |
| `MAX_CACHE_SIZE` | 10,000 | Hard cap on cache entries (LRU eviction) |
| Cleanup interval | 60s | Periodic removal of expired entries |

**Trade-off**: After logout, a revoked session may remain "valid" in cache for up to 30 seconds. This is acceptable compared to complete unavailability during auth-service outages.

The cache stores both valid and invalid (revoked) session results. Invalid sessions return `next()` without setting `req.user`, effectively treating the request as unauthenticated.

### Error Sanitization (JwtStrategy)

When `JwtStrategy.validate()` detects an invalid session, it:
1. **Logs the actual reason internally** (e.g., `"Session invalid for sessionId=X: session revoked"`)
2. **Throws a generic error** to the client: `"Invalid or expired session"`

This prevents information leakage about session states to potential attackers.

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
1. Set `x-gateway-timestamp` to current epoch milliseconds (anti-replay)
2. Compute HMAC-SHA256 signature of all internal headers **including timestamp** using `INTERNAL_HEADER_SECRET`
3. Set `x-gateway-signature` — subgraphs verify this before trusting any `x-*` headers

See [Security](/shared/security.md) for details on `FederationTokenService` and signature verification.

### Introspection Control

```typescript
const allowIntrospection = configService.get('ALLOW_INTROSPECTION') === 'true';
server: {
  introspection: allowIntrospection,
  plugins: allowIntrospection ? [] : [disableIntrospectionPlugin()],
}
```

## Dependencies

### `@cucu/security`

The Gateway is the **primary consumer** of `@cucu/security`. It uses both the signing and verification modules:

| Export | Usage in Gateway |
|--------|-----------------|
| `FederationTokenService` | Generates self-signed RS256 JWTs for internal federation calls. Registered via `FederationModule` and used in `federation-request.options.ts` (`willSendRequest`). Reads private key from `FEDERATION_PRIVATE_KEY_PATH`. |
| `verifyGatewaySignature()` | Not called directly by the Gateway (the Gateway *creates* signatures, subgraphs verify). However, it's re-exported from `@cucu/service-common` for use in `BaseSubgraphContext` and `PermissionsCacheService` on the receiving end. |

The Gateway computes HMAC-SHA256 signatures directly in `federation-request.options.ts` using `crypto.createHmac()` and `INTERNAL_HEADER_SECRET`. It does **not** use `verifyGatewaySignature()` — that function is for subgraphs to verify incoming headers.

### `@cucu/service-common`

| Export | Usage |
|--------|-------|
| `createSubgraphMicroservice` | Bootstrap (with `inheritAppConfig: false`) |
| `TenantClsStore`, `TenantContextService` | CLS tenant context for auth RPC calls |
| `TenantAwareClientsModule` | Redis RPC clients with auto-injected `_tenantSlug` + `_internalSecret` |
| `buildRedisTlsOptions` | Redis transport configuration |

### Other Libraries

- **`@cucu/microservices-orchestrator`** — dependency checking at startup
- **`passport`, `passport-jwt`** — JWT strategy for access token validation
- **`@nestjs/throttler`** — rate limiting on auth and tenant endpoints

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
