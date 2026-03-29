# Technical Debt Tracker

This document tracks known technical debt and improvement opportunities in the Cucu platform.

## Active Issues

### High Priority

#### TD-003: Gateway Single Point of Failure

**Status:** Open
**Severity:** High
**Component:** apps/gateway

**Description:**
The gateway is a single point of failure. If it goes down, all client access is lost.

**Proposed Fix:**
1. Deploy multiple gateway instances
2. Add health checks
3. Use load balancer (Nginx, HAProxy)
4. Consider Apollo Router for better scaling

---

### Medium Priority

#### TD-004: Hardcoded Magic Numbers

**Status:** Open
**Severity:** Low
**Component:** Multiple

**Description:**
Various magic numbers are hardcoded throughout the codebase:

- Permission cache TTL: 5 minutes
- Session idle timeout: 4 hours
- Max supervisor depth: 10
- Avatar color range: 1-10
- Pagination default: 100

**Proposed Fix:**
Move all magic numbers to environment variables with documented defaults.

---

#### TD-005: Inconsistent Error Handling

**Status:** Open
**Severity:** Medium
**Component:** Multiple services

**Description:**
Error handling is inconsistent across services. Some throw NestJS exceptions, others return error objects, some just log and continue.

**Current State:**
```typescript
// Some services
throw new NotFoundException('User not found');

// Others
return { error: 'User not found' };

// Others
console.error('User not found');
return null;
```

**Proposed Fix:**
Implement standardized error handling with error codes and consistent response format.

---

#### TD-006: Missing Request Logging

**Status:** Open
**Severity:** Medium
**Component:** All services

**Description:**
Request/response logging is inconsistent. Some operations log, others don't. No structured logging format.

**Proposed Fix:**
1. Add request correlation IDs
2. Implement structured logging (JSON format)
3. Add log aggregation (ELK, Loki)

---

#### TD-007: Test Coverage

**Status:** Open
**Severity:** Medium
**Component:** All services

**Description:**
Test coverage is incomplete. Many services lack unit tests, integration tests, and E2E tests.

**Current Coverage:**
- Unit tests: ~30%
- Integration tests: ~10%
- E2E tests: ~5%

**Proposed Fix:**
1. Add Jest unit tests for all services
2. Add integration tests for RPC patterns
3. Add E2E tests for critical flows

---

### Low Priority

#### TD-008: Deprecated Mongoose Methods

**Status:** Open
**Severity:** Low
**Component:** Multiple services

**Description:**
Some services use deprecated Mongoose methods that will be removed in future versions.

**Examples:**
```typescript
// Deprecated
.findOneAndUpdate({ _id }, update, { new: true })

// Should use
.findOneAndUpdate({ _id }, update, { returnDocument: 'after' })
```

---

#### TD-009: TypeScript Strict Mode

**Status:** Open
**Severity:** Low
**Component:** All services

**Description:**
TypeScript strict mode is not enabled in all services. This could lead to type-related bugs.

**Proposed Fix:**
Enable strict mode in tsconfig.json:
```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

---

#### TD-010: Documentation Comments

**Status:** Open
**Severity:** Low
**Component:** All services

**Description:**
Many functions and classes lack JSDoc comments, making code harder to understand.

**Proposed Fix:**
Add JSDoc comments to all public methods and complex logic.

---

## Resolved Issues

### Security Audit & Test Coverage Sprint (23 March 2026)

Seven security findings fixed in Phase 3. All tests passing (239 new tests → ~980 total).

#### TD-R-F031: RPC Write Mutations Not Authenticated

**Status:** Resolved
**Resolution Date:** 2026-03-23
**Component:** service-common/guards, apps/grants

**Description:**
RPC write mutations on the `grants` service were not authenticated. Any service could modify permissions without authorization.

**Resolution:**
- Implemented `RpcInternalGuard` to verify `_internalSecret` in RPC payloads
- Uses `crypto.timingSafeEqual()` for timing-safe HMAC verification
- Pattern: only `PROTECTED_OPERATIONS` (grants write mutations) require authentication
- Read operations remain open (grants are configuration, not sensitive secrets)

**PR:** service-common #20 / #21, grants #N

---

#### TD-R-F034: MongoDB Credentials Not Isolated

**Status:** Resolved
**Resolution Date:** 2026-03-23
**Component:** Kubernetes / Docker bootstrap

**Description:**
MongoDB credentials were shared across all containers. Compromise of one service = compromise of all databases.

**Resolution:**
- Each service gets unique MongoDB username + password
- Database connection strings are isolated via environment variables
- Root admin credentials never exposed to service containers
- Container fails-fast on startup if credentials are missing

**Impact:** Physical database isolation now has credential isolation as defence-in-depth.

**PR:** Infrastructure setup / Helm charts (not in-code)

---

#### TD-R-F038: RPC Payload Validation Before Interceptor

**Status:** Resolved
**Resolution Date:** 2026-03-23
**Component:** service-common/interceptors

**Description:**
`ValidationPipe` was running on RPC payloads BEFORE `TenantClsInterceptor` could strip `_tenantSlug` and `_internalSecret`. This caused validation failures on legitimate internal RPC calls.

**Resolution:**
- `TenantClsInterceptor` now runs BEFORE `ValidationPipe` (interceptor → validation → handler)
- Strips `_tenantSlug` and `_internalSecret` from payload before validation
- DTOs in RPC handlers only declare business fields (not infrastructure fields)

**PR:** service-common migration to nestjs-cls #21 / #22

---

#### TD-R-F042: Password Placeholder Not Complexity-Compliant

**Status:** Resolved
**Resolution Date:** 2026-03-23
**Component:** bootstrap seeder

**Description:**
Seed data used placeholder password (e.g., `"test123"`) that didn't meet complexity requirements. Production passwords would be rejected for same format.

**Resolution:**
- Seeder now generates complexity-compliant passwords: `@Cucu{randomSuffix}` format
- All test passwords match production complexity rules
- `DEV_MODE=true` env var can disable complexity check for development only

**PR:** bootstrap seeder updates

---

#### TD-R-F043: Tenant HTTP Endpoints Exposed on Subgraph

**Status:** Resolved
**Resolution Date:** 2026-03-23
**Component:** apps/tenants, apps/gateway

**Description:**
Tenant signup/check-slug/status endpoints were on the subgraph service, mixing HTTP REST with GraphQL. Created inconsistent auth/CORS handling.

**Resolution:**
- Moved `POST /auth/signup`, `GET /tenants/check-slug/:slug`, `GET /tenants/status/:id` to **Gateway**
- Gateway forwards these as RPC calls to Tenants service
- Consolidates all public HTTP endpoints in one place
- Tenants subgraph now exposes only:
  - `GET /resolve/:slug` (server-to-server, protected by `TENANT_RESOLVE_SECRET`)
  - GraphQL queries/mutations

**Impact:** Cleaner separation of concerns, consistent CORS/auth policy.

**PR:** gateway #N, tenants service

---

#### TD-R-F044: Tenant Slug Resolution Not Timing-Safe

**Status:** Resolved
**Resolution Date:** 2026-03-23
**Component:** apps/gateway

**Description:**
The `GET /resolve/:slug` endpoint (called by Next.js middleware to resolve tenant config) used string equality (`===`) to verify the `x-internal-resolve` header. Vulnerable to timing attacks on the secret.

**Resolution:**
- Changed to `crypto.timingSafeEqual()` for constant-time comparison
- Same secret (`TENANT_RESOLVE_SECRET`) used by both Gateway and Tenants service
- Request fails if secret doesn't match (returns 403 Forbidden)

**PR:** gateway #N

---

#### TD-R-F045: Internal Secret Not Injected in RPC

**Status:** Resolved
**Resolution Date:** 2026-03-23
**Component:** service-common/tenant-aware-client-proxy

**Description:**
RPC payloads were missing `_internalSecret` field. Allowed spoofing of internal RPC calls (claim `_tenantSlug=othertenant` without proof of being a legitimate service).

**Resolution:**
- `TenantAwareClientProxy.enrich()` now injects both:
  - `_tenantSlug` (from CLS context)
  - `_internalSecret` (from `INTERNAL_HEADER_SECRET` env var)
- RPC handlers verify both fields via `RpcInternalGuard`
- Guard skips check if `INTERNAL_HEADER_SECRET` not set (safely fail-open for dev, fail-closed for prod)

**PR:** service-common #20, PR #145

---

### Legacy Resolved Issues

#### TD-R001: Session Validation on Every Request

**Status:** Resolved
**Resolution Date:** 2024-01-15
**Component:** apps/gateway, apps/auth

**Description:**
Originally, sessions were validated by decoding the JWT only, without checking server-side session state.

**Resolution:**
Implemented `CHECK_SESSION` RPC call on every request to validate server-side session state.

---

#### TD-R002: Missing HMAC Signature Verification

**Status:** Resolved
**Resolution Date:** 2024-01-20
**Component:** service-common/security

**Description:**
Internal headers were not signed, allowing potential header spoofing.

**Resolution:**
Added HMAC-SHA256 signature verification with timing-safe comparison.

---

## Improvement Opportunities

### Performance Optimizations

1. **Database Indexing**
   - Review and optimize MongoDB indexes
   - Add compound indexes for common query patterns

2. **Caching Strategy**
   - Implement Redis caching for frequently accessed data
   - Add cache headers for GraphQL responses

3. **Query Optimization**
   - Use projection in all MongoDB queries
   - Implement DataLoader for N+1 problem in GraphQL

### Security Enhancements

1. **Rate Limiting**
   - Add rate limiting to authentication endpoints
   - Implement request throttling per user

2. **Audit Logging**
   - Log all permission changes
   - Track sensitive data access

3. **Secret Rotation**
   - Implement JWT secret rotation
   - Add HMAC secret rotation

### Developer Experience

1. **Local Development**
   - Add docker-compose profile for minimal setup
   - Create seed data scripts

2. **Debugging**
   - Add OpenTelemetry tracing
   - Implement distributed logging

3. **CI/CD**
   - Add automated testing in pipeline
   - Implement canary deployments

## Contributing

To add a new technical debt item:

1. Use format: TD-XXX: Title
2. Include: Status, Severity, Component
3. Describe the issue and proposed fix
4. Assign to a milestone if known

To resolve an item:

1. Move to "Resolved Issues" section
2. Add resolution date
3. Describe the fix implemented
