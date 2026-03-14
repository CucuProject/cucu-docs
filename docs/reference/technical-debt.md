# Technical Debt Tracker

This document tracks known technical debt and improvement opportunities in the Cucu platform.

## Active Issues

### High Priority

#### TD-001: Permission Cache Invalidation Race Condition

**Status:** Open
**Severity:** High
**Component:** service-common/permissions-cache.service.ts

**Description:**
When permissions change, the `PERMISSIONS_CHANGED` event is emitted to all services. However, there's a small window where a request might use stale permissions if it arrives between the database update and the cache invalidation event being processed.

**Current Workaround:**
5-minute TTL on cache provides eventual consistency.

**Proposed Fix:**
Implement version-based cache invalidation with optimistic locking.

---

#### TD-002: Supervisor Chain Validation Performance

**Status:** Open
**Severity:** Medium
**Component:** apps/users/src/users.service.ts

**Description:**
Circular dependency check for supervisor chain makes up to 10 database queries (one per level). For large organizations, this could be slow.

**Current State:**
```typescript
// 10 queries worst case
for (let depth = 0; depth < MAX_DEPTH && currentLevel.length > 0; depth++) {
  const supervisors = await this.userModel.find(/* ... */);
  // ...
}
```

**Proposed Fix:**
Pre-compute supervisor hierarchy in a denormalized collection or use graph database for relationships.

---

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

### TD-R001: Session Validation on Every Request

**Status:** Resolved
**Resolution Date:** 2024-01-15
**Component:** apps/gateway, apps/auth

**Description:**
Originally, sessions were validated by decoding the JWT only, without checking server-side session state.

**Resolution:**
Implemented `CHECK_SESSION` RPC call on every request to validate server-side session state.

---

### TD-R002: Missing HMAC Signature Verification

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
