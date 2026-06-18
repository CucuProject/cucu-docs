# Gateway Service

The Gateway is Cucu's public edge service. It exposes REST authentication and tenant endpoints, composes the Apollo Federation graph, validates user access tokens through the Auth service, and signs trusted internal headers before requests reach subgraphs.

It is intentionally stateless: it owns no domain database and does not own authentication state. Its job is to turn public traffic into a verified, signed, rate-limited internal request.

## Service Profile

| Property | Value |
|---|---|
| Runtime | NestJS + Apollo Gateway |
| Public port | `3000` |
| Database | None |
| Transport | HTTP + Redis clients |
| App module | `apps/gateway/src/app.module.ts` |
| Entry point | `apps/gateway/src/main.ts` |

## Responsibilities

- Expose `/graphql` as the composed federated API.
- Expose REST auth endpoints under `/auth`.
- Expose tenant onboarding/status endpoints under `/tenants`.
- Strip all client-supplied internal headers before trust is assigned.
- Delegate access-token and session validation to Auth via `VERIFY_ACCESS_TOKEN`.
- Convert a validated user context into trusted signed headers for subgraphs.
- Generate internal federation tokens for gateway-to-subgraph calls without user context.
- Apply CORS, Helmet, cookie parsing, throttling, introspection controls, and query limits.

## Trust Boundary

The Gateway is the only public boundary that may create trusted subgraph headers.

Current flow:

1. `main.ts` logs tenant-header injection attempts (`x-tenant-slug`, `x-tenant-id`).
2. It strips internal headers such as `x-user-id`, `x-user-groups`, `x-gateway-signature`, `x-tenant-slug`, and `x-internal-federation-call`.
3. `createJwtAuthMiddleware()` reads `Authorization: Bearer <token>`.
4. The Gateway sends the token to Auth using `VERIFY_ACCESS_TOKEN`.
5. If Auth returns `{ valid: true }`, the Gateway stores the validated identity on `req.user`.
6. `federation-request.options.ts` converts `req.user` into internal headers and signs them with HMAC.

The older `JwtStrategy` still exists for Passport/guard compatibility, but the primary GraphQL path uses the Express middleware registered in `beforeStart`. This matters because the middleware must run before Apollo Gateway registers and handles `/graphql`.

## Main Modules

| Module/File | Purpose |
|---|---|
| `app.module.ts` | Config, throttling, Passport, federation, Redis clients, GraphQL Gateway. |
| `main.ts` | Bootstrap, Helmet, cookie parser, header sanitization, JWT auth middleware. |
| `auth/auth.controller.ts` | REST auth thin proxy. |
| `tenants/tenants.controller.ts` | Public tenant onboarding/status proxy. |
| `middleware/jwt-auth.middleware.ts` | Delegates Bearer auth validation to Auth. |
| `federation/federation-request.options.ts` | Graph composition, query limits, header propagation and HMAC signing. |
| `auth/global-auth.guard.ts` | Multimodal REST/GraphQL guard, skips `@Public()`. |

## REST API

### Auth Endpoints

| Method | Path | Auth | Main RPC calls | Notes |
|---|---|---|---|---|
| `POST` | `/auth/login` | Public | `VERIFY_IDENTITY_PASSWORD`, `CREATE_AUTHENTICATED_SESSION`, `GET_IDENTITY_MEMBERSHIPS`, `GET_MY_PERMISSIONS` | Verifies password in Tenants, creates Auth session, sets refresh/access cookies. |
| `POST` | `/auth/refresh` | Public | `REFRESH_FROM_TOKEN`, `GET_MY_PERMISSIONS` | Rotates refresh token and refreshes the access-token cookie. |
| `POST` | `/auth/logout` | `GlobalAuthGuard` | `REVOKE_SESSION` | Revokes the current session and clears cookies. |
| `GET` | `/auth/verify` | Public | `VERIFY_FROM_TOKEN` | Always returns HTTP 200; check `valid`. |
| `GET` | `/auth/me` | Public | `GET_ME` | Returns user state and permissions for frontend layouts. |
| `POST` | `/auth/discover` | Public | `DISCOVER_TENANTS` | Finds tenant memberships for an email. |
| `POST` | `/auth/switch` | `GlobalAuthGuard` | `SWITCH_FROM_TOKEN` | Switches tenant and sets a new refresh cookie. |
| `POST` | `/auth/force-revoke` | `GlobalAuthGuard` + grants operation | `CHECK_OPERATION_PERMISSION`, `REVOKE_SESSION` | Requires `forceRevokeSession`. |

### Tenant Endpoints

| Method | Path | Auth | RPC | Notes |
|---|---|---|---|---|
| `POST` | `/tenants/signup` | Public | `SIGNUP_TENANT` | Creates tenant and starts provisioning. |
| `GET` | `/tenants/check-slug/:slug` | Public | `CHECK_SLUG_AVAILABILITY` | Slug availability check. |
| `GET` | `/tenants/status/:id` | Public | `GET_TENANT_STATUS` | Polls provisioning status after ObjectId validation. |

## Login Example

```http
POST /auth/login
Content-Type: application/json

{
  "email": "admin@acme.test",
  "password": "Str0ng!Pass",
  "tenantSlug": "acme"
}
```

Logical response:

```json
{
  "accessToken": "...",
  "userId": "665...",
  "sessionId": "665...",
  "expiresIn": 3600,
  "groups": ["665..."],
  "isPlatformAdmin": false,
  "memberships": [
    { "tenantSlug": "acme", "userId": "665...", "role": "admin" }
  ],
  "permissions": {
    "canExecuteOps": [],
    "fieldPermissions": [],
    "canAccessPages": [],
    "operationScopes": []
  }
}
```

Side effects:

- HTTP-only refresh cookie is set.
- Access-token cookie is set for frontend middleware.
- The password is never sent to `CREATE_AUTHENTICATED_SESSION`; Auth receives only the verified identity/session metadata.

## Federation Header Propagation

For authenticated user requests:

- Remove the public `Authorization` header before forwarding to subgraphs.
- Set `x-user-id`, `x-user-groups`, and optionally `x-user-email`.
- Set `x-tenant-slug` and `x-tenant-id` from the Auth-validated user context.
- Set `x-gateway-timestamp`.
- Sign the internal header payload with `INTERNAL_HEADER_SECRET`.

For internal federation calls without a user context:

- Generate a self-signed federation JWT via `FederationTokenService`.
- Set `Authorization: Bearer <federation-token>`.
- Set `x-internal-federation-call: 1`.
- Never promote raw incoming user or tenant headers into signed gateway headers.

## Query and Introspection Controls

The Gateway controls the public GraphQL shape:

- `ALLOW_INTROSPECTION=true` enables introspection.
- `GRAPHQL_MAX_QUERY_DEPTH` limits nested selection depth.
- `GRAPHQL_MAX_QUERY_FIELDS` limits field count.

These checks live at the Gateway because it owns the public federated graph boundary.

## Throttling

The Gateway defines named throttling buckets:

| Bucket | Default |
|---|---|
| `default` | 60 requests / minute |
| `login` | 100 requests / 15 minutes |
| `discover` | 10 requests / minute |
| `signup` | 5 requests / hour |
| `refresh` | 30 requests / minute |

Controllers use `@SkipThrottle` to isolate buckets because Nest throttler v6 applies registered buckets broadly unless explicitly skipped.

## Design Decisions

- Authentication REST remains in the Gateway because cookies, IP, user-agent, and fingerprint extraction are HTTP concerns.
- Auth business logic lives in Auth; the Gateway is a thin proxy plus trust boundary.
- `VERIFY_ACCESS_TOKEN` is the source of truth for public Bearer-token validation.
- Internal headers are always stripped before trust is created.
- `inheritAppConfig: false` prevents HTTP/GraphQL guards from leaking onto the Gateway Redis microservice transport.
- Subgraphs must trust signed Gateway headers, not raw client headers.

## Source References

- `apps/gateway/src/main.ts`
- `apps/gateway/src/app.module.ts`
- `apps/gateway/src/auth/auth.controller.ts`
- `apps/gateway/src/auth/global-auth.guard.ts`
- `apps/gateway/src/auth/jwt.strategy.ts`
- `apps/gateway/src/middleware/jwt-auth.middleware.ts`
- `apps/gateway/src/federation/federation-request.options.ts`

## Relevant Tests

- `apps/gateway/tests/jwt-auth-middleware.spec.ts`
- `apps/gateway/tests/federation-request-options.spec.ts`
- `apps/gateway/tests/header-sanitization.spec.ts`
- `apps/gateway/tests/gateway-auth-controller.spec.ts`
- `apps/gateway/tests/gateway-global-auth-guard.spec.ts`
