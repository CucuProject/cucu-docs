# Environment Variables Reference

Complete reference of all environment variables used in the Cucu platform.

## Common Variables

These variables are used across multiple services:

### Redis Configuration

```ini
REDIS_SERVICE_HOST=redis
REDIS_SERVICE_PORT=6379
REDIS_SERVICE_TLS_PORT=6380
REDIS_TLS_CA_CERT=/certs/ca.crt
```

### Per-Service Redis TLS

```ini
<SERVICE>_REDIS_TLS_CLIENT_CERT=/certs/<service>.crt
<SERVICE>_REDIS_TLS_CLIENT_KEY=/certs/<service>.key

# Examples
GATEWAY_REDIS_TLS_CLIENT_CERT=/certs/gateway.crt
GATEWAY_REDIS_TLS_CLIENT_KEY=/certs/gateway.key
AUTH_REDIS_TLS_CLIENT_CERT=/certs/auth.crt
AUTH_REDIS_TLS_CLIENT_KEY=/certs/auth.key
```

### MongoDB

```ini
MONGODB_URI=mongodb://<host>:<port>/<database>
MONGO_DEFAULT_DB_PORT=27017

# Examples
MONGODB_URI=mongodb://auth-db:27017/auth
MONGODB_URI=mongodb://users-db:27017/users
```

### HTTP Protocol

```ini
HTTP_PROTOCOL=http   # or https for production
```

### Introspection

```ini
ALLOW_INTROSPECTION=true   # false in production
```

### Security

```ini
# CRITICAL: Must be same across all services
INTERNAL_HEADER_SECRET=cucu-dev-hmac-change-me-in-production

# JWT signing (must match between gateway and auth)
JWT_SECRET=ProdSecretKey

# JWT verification (used by gateway JwtStrategy to verify access tokens)
JWT_PUBLIC_KEY_PATH=/certs/jwt.pub

# Federation JWT Signing (RS256)
# Required by Gateway for signing federation JWTs
FEDERATION_PRIVATE_KEY_PATH=/certs/federation.key

# Required by subgraphs for verifying federation JWTs
FEDERATION_PUBLIC_KEY_PATH=/certs/federation.pub

# Tenant resolve endpoint protection (used by Next.js middleware → tenants subgraph)
TENANT_RESOLVE_SECRET=cucu-resolve-secret-change-me-in-production

# Development mode — bypasses password complexity validation
DEV_MODE=true  # only in development
```

See [Security](/shared/security.md) for details on federation JWT signing.

## Gateway Service

```ini
# Service Identity
GATEWAY_SERVICE_NAME=gateway
GATEWAY_SERVICE_PORT=3000

# Subgraph Discovery
AUTH_SERVICE_NAME=auth
AUTH_SERVICE_PORT=3001
USERS_SERVICE_NAME=users
USERS_SERVICE_PORT=3002
GRANTS_SERVICE_NAME=grants
GRANTS_SERVICE_PORT=3010
PROJECTS_SERVICE_NAME=projects
PROJECTS_SERVICE_PORT=3003
MILESTONES_SERVICE_NAME=milestones
MILESTONES_SERVICE_PORT=3004
MILESTONE_TO_USER_SERVICE_NAME=milestone-to-user
MILESTONE_TO_USER_SERVICE_PORT=3008
MILESTONE_TO_PROJECT_SERVICE_NAME=milestone-to-project
MILESTONE_TO_PROJECT_SERVICE_PORT=3009
GROUP_ASSIGNMENTS_SERVICE_NAME=group-assignments
GROUP_ASSIGNMENTS_SERVICE_PORT=3007
ORGANIZATION_SERVICE_NAME=organization
ORGANIZATION_SERVICE_PORT=3012

# JWT
JWT_SECRET=ProdSecretKey

# Dependencies
GATEWAY_DEPENDENCIES=["auth","users","grants"]

# Refresh Cookie
REFRESH_COOKIE_NAME=__Host-rf
REFRESH_COOKIE_DOMAIN=localhost
REFRESH_COOKIE_SECURE=true
REFRESH_COOKIE_SAMESITE=strict
REFRESH_COOKIE_MAXAGE=7d

# CORS
CORS_ORIGIN=http://localhost:3001
```

## Auth Service

```ini
# Service Identity
AUTH_SERVICE_NAME=auth
AUTH_SERVICE_PORT=3001

# Database
AUTH_DB_HOST=auth-db
AUTH_DB_PORT=9001
MONGODB_URI=mongodb://auth-db:27017/auth

# Dependencies
AUTH_DEPENDENCIES=["users"]

# JWT
JWT_SECRET=ProdSecretKey
JWT_EXPIRES_IN=15m
ACCESS_TOKEN_EXPIRES_IN=1h

# Session
REFRESH_EXPIRES_IN=7d
SESSION_IDLE_TIMEOUT=4h
MAX_SESSION_AGE=24h

# Cookie
REFRESH_COOKIE_NAME=__Host-rf
REFRESH_COOKIE_DOMAIN=localhost
REFRESH_COOKIE_SECURE=true
REFRESH_COOKIE_SAMESITE=strict
REFRESH_COOKIE_MAXAGE=7d
```

## Users Service

```ini
# Service Identity
USERS_SERVICE_NAME=users
USERS_SERVICE_PORT=3002

# Database
USERS_DB_HOST=users-db
USERS_DB_PORT=9002
MONGODB_URI=mongodb://users-db:27017/users

# Dependencies
USERS_DEPENDENCIES=["grants"]
```

## Grants Service

```ini
# Service Identity
GRANTS_SERVICE_NAME=grants
GRANTS_SERVICE_PORT=3010

# Database
GRANTS_DB_HOST=grants-db
GRANTS_DB_PORT=9010
MONGODB_URI=mongodb://grants-db:27017/grants

# Dependencies (none - core service)
GRANTS_DEPENDENCIES=[]
```

## Projects Service

```ini
# Service Identity
PROJECTS_SERVICE_NAME=projects
PROJECTS_SERVICE_PORT=3003

# Database
PROJECTS_DB_HOST=projects-db
PROJECTS_DB_PORT=9003
MONGODB_URI=mongodb://projects-db:27017/projects

# Dependencies
PROJECTS_DEPENDENCIES=["users"]
```

## Milestones Service

```ini
# Service Identity
MILESTONES_SERVICE_NAME=milestones
MILESTONES_SERVICE_PORT=3004

# Database
MILESTONES_DB_HOST=milestones-db
MILESTONES_DB_PORT=9004
MONGODB_URI=mongodb://milestones-db:27017/milestones

# Dependencies
MILESTONES_DEPENDENCIES=["users"]
```

## MilestoneToUser Service

```ini
# Service Identity
MILESTONE_TO_USER_SERVICE_NAME=milestone-to-user
MILESTONE_TO_USER_SERVICE_PORT=3008

# Database
MILESTONE_TO_USER_DB_HOST=milestone-to-user-db
MILESTONE_TO_USER_DB_PORT=9005
MONGODB_URI=mongodb://milestone-to-user-db:27017/milestone-to-user

# Dependencies
MILESTONE_TO_USER_DEPENDENCIES=["users","milestones"]
```

## MilestoneToProject Service

```ini
# Service Identity
MILESTONE_TO_PROJECT_SERVICE_NAME=milestone-to-project
MILESTONE_TO_PROJECT_SERVICE_PORT=3009

# Database
MILESTONE_TO_PROJECT_DB_HOST=milestone-to-project-db
MILESTONE_TO_PROJECT_DB_PORT=9006
MONGODB_URI=mongodb://milestone-to-project-db:27017/milestone-to-project

# Dependencies
MILESTONE_TO_PROJECT_DEPENDENCIES=["projects","milestones"]
```

## GroupAssignments Service

```ini
# Service Identity
GROUP_ASSIGNMENTS_SERVICE_NAME=group-assignments
GROUP_ASSIGNMENTS_SERVICE_PORT=3007

# Database
GROUP_ASSIGNMENTS_DB_HOST=group-assignments-db
GROUP_ASSIGNMENTS_DB_PORT=9007
MONGODB_URI=mongodb://group-assignments-db:27017/group-assignments

# Dependencies
GROUP_ASSIGNMENTS_DEPENDENCIES=["users","grants"]
```

## Organization Service

```ini
# Service Identity
ORGANIZATION_SERVICE_NAME=organization
ORGANIZATION_SERVICE_PORT=3012

# Database
ORGANIZATION_DB_HOST=organization-db
ORGANIZATION_DB_PORT=9012
MONGODB_URI=mongodb://organization-db:27017/organization

# Dependencies
ORGANIZATION_DEPENDENCIES=[]
```

## Bootstrap Service

```ini
# Service Identity
BOOTSTRAP_SERVICE_NAME=bootstrap
BOOTSTRAP_SERVICE_PORT=3100

# No database (uses other services)

# Dependencies (all services)
BOOTSTRAP_DEPENDENCIES=["auth","users","grants","organization"]
```

## Environment Files

### .env.development

Development configuration with all ports exposed:

```ini
NODE_ENV=development
HTTP_PROTOCOL=http
ALLOW_INTROSPECTION=true
JWT_SECRET=DevSecretKey
INTERNAL_HEADER_SECRET=cucu-dev-hmac-secret
# ... all other variables
```

### .env.production

Production configuration:

```ini
NODE_ENV=production
HTTP_PROTOCOL=https
ALLOW_INTROSPECTION=false
JWT_SECRET=<secure-random-key>
INTERNAL_HEADER_SECRET=<secure-random-key>
# ... all other variables with production values
```

## Required vs Optional

### Required Variables

These must be set for the platform to function:

- `INTERNAL_HEADER_SECRET` — fail-closed HMAC signing (RpcInternalGuard rejects if missing)
- `JWT_SECRET` — must match between gateway and auth
- `JWT_PUBLIC_KEY_PATH` — required by gateway JwtStrategy for access token verification (RS256)
- `MONGODB_URI` (per service)
- `REDIS_SERVICE_HOST`
- `<SERVICE>_SERVICE_PORT`
- `FEDERATION_PRIVATE_KEY_PATH` — required by Gateway for federation JWT signing
- `FEDERATION_PUBLIC_KEY_PATH` — required by subgraphs for federation JWT verification
- `TENANT_RESOLVE_SECRET` — required by tenants service for `resolve/:slug` endpoint protection
- Redis TLS certs in production — `buildRedisTlsOptions` **throws** if certs missing when `NODE_ENV=production`

### Optional Variables

These have sensible defaults:

- `REDIS_SERVICE_PORT` (default: 6379)
- `JWT_EXPIRES_IN` (default: 15m)
- `SESSION_IDLE_TIMEOUT` (default: 4h)
- `MAX_SESSION_AGE` (default: 24h)
- `DEV_MODE` (default: unset — when `true`, bypasses password complexity validation)

## Variable Validation

Services validate critical variables at startup:

```typescript
const secret = configService.get('INTERNAL_HEADER_SECRET');
if (!secret) {
  throw new Error('INTERNAL_HEADER_SECRET is required');
}
```
