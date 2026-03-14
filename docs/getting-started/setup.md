# Setup Guide

This guide walks you through setting up the Cucu development environment from scratch.

## 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/CucuProject/cucu-nest.git
cd cucu-nest

# Install dependencies with pnpm (recommended)
pnpm install

# Or with npm
npm install
```

## 2. Environment Configuration

### Create Environment Files

```bash
# Copy the example environment file
cp .env.example .env.development
```

### Key Environment Variables

Edit `.env.development` with the following sections:

#### Service Ports

```ini
GATEWAY_SERVICE_PORT=3000
AUTH_SERVICE_PORT=3001
USERS_SERVICE_PORT=3002
PROJECTS_SERVICE_PORT=3003
MILESTONES_SERVICE_PORT=3004
GROUP_ASSIGNMENTS_SERVICE_PORT=3007
MILESTONE_TO_USER_SERVICE_PORT=3008
MILESTONE_TO_PROJECT_SERVICE_PORT=3009
GRANTS_SERVICE_PORT=3010
ORGANIZATION_SERVICE_PORT=3012
```

#### Database Ports (MongoDB)

```ini
AUTH_DB_PORT=9001
USERS_DB_PORT=9002
PROJECTS_DB_PORT=9003
MILESTONES_DB_PORT=9004
MILESTONE_TO_USER_DB_PORT=9005
MILESTONE_TO_PROJECT_DB_PORT=9006
GROUP_ASSIGNMENTS_DB_PORT=9007
PROJECT_ACCESS_DB_PORT=9008
GRANTS_DB_PORT=9010
ORGANIZATION_DB_PORT=9012
```

#### Redis Configuration

```ini
REDIS_SERVICE_HOST=redis
REDIS_SERVICE_PORT=6379
REDIS_SERVICE_TLS_PORT=6380
```

#### JWT and Session Settings

```ini
JWT_SECRET=ProdSecretKey              # Change in production!
JWT_EXPIRES_IN=15m
ACCESS_TOKEN_EXPIRES_IN=1h
REFRESH_EXPIRES_IN=7d
SESSION_IDLE_TIMEOUT=4h
MAX_SESSION_AGE=24h
```

#### Refresh Token Cookie

```ini
REFRESH_COOKIE_NAME=__Host-rf
REFRESH_COOKIE_DOMAIN=localhost
REFRESH_COOKIE_SECURE=true
REFRESH_COOKIE_SAMESITE=strict
REFRESH_COOKIE_MAXAGE=7d
```

#### Security

```ini
# CRITICAL: Change this in production!
INTERNAL_HEADER_SECRET=cucu-dev-hmac-change-me-in-production
```

## 3. Docker Infrastructure

### Start Development Stack

```bash
# Start all infrastructure (MongoDB instances, Redis)
docker-compose -f docker-compose.development.yml up -d

# Verify containers are running
docker-compose -f docker-compose.development.yml ps
```

### Expected Services

| Service | Port | Purpose |
|---------|------|---------|
| redis | 6379, 6380 | Message bus (plain + TLS) |
| auth-db | 9001 | Auth service MongoDB |
| users-db | 9002 | Users service MongoDB |
| projects-db | 9003 | Projects service MongoDB |
| milestones-db | 9004 | Milestones service MongoDB |
| grants-db | 9010 | Grants service MongoDB |
| ... | ... | Additional service databases |

## 4. TLS Certificates (mTLS)

For development, generate self-signed certificates:

```bash
# Create certificates directory
mkdir -p certs

# Generate CA certificate
openssl genrsa -out certs/ca.key 4096
openssl req -new -x509 -days 365 -key certs/ca.key \
  -out certs/ca.crt -subj "/CN=Cucu CA"

# Generate service certificates
for SERVICE in gateway auth users grants milestones projects; do
  openssl genrsa -out certs/${SERVICE}.key 2048
  openssl req -new -key certs/${SERVICE}.key \
    -out certs/${SERVICE}.csr -subj "/CN=${SERVICE}"
  openssl x509 -req -days 365 \
    -in certs/${SERVICE}.csr \
    -CA certs/ca.crt -CAkey certs/ca.key \
    -CAcreateserial -out certs/${SERVICE}.crt
done
```

Set certificate paths in `.env.development`:

```ini
REDIS_TLS_CA_CERT=/path/to/certs/ca.crt
GATEWAY_REDIS_TLS_CLIENT_CERT=/path/to/certs/gateway.crt
GATEWAY_REDIS_TLS_CLIENT_KEY=/path/to/certs/gateway.key
AUTH_REDIS_TLS_CLIENT_CERT=/path/to/certs/auth.crt
AUTH_REDIS_TLS_CLIENT_KEY=/path/to/certs/auth.key
# ... repeat for all services
```

## 5. Running Services

### Development Mode (with hot reload)

```bash
# Run all services
pnpm run start:dev

# Or run specific services
pnpm run start:dev gateway
pnpm run start:dev auth
pnpm run start:dev users
```

### Production Build

```bash
# Build all services
pnpm run build

# Start production
pnpm run start:prod
```

## 6. Bootstrap (Seed Data)

Run the bootstrap service to create initial data:

```bash
# Start the bootstrap service
pnpm run start:dev bootstrap

# This creates:
# - SUPERADMIN group with all permissions
# - Default admin user
# - Initial lookup tables
```

## 7. Verify Installation

### Check Gateway Health

```bash
curl http://localhost:3000/
# Expected: { "status": "ok" }
```

### Test GraphQL Endpoint

Navigate to http://localhost:3000/graphql and run:

```graphql
query {
  __schema {
    types {
      name
    }
  }
}
```

### Test Authentication

```bash
# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@cucu.com", "password": "admin123"}'

# Expected: { "accessToken": "...", "userId": "...", "sessionId": "..." }
```

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| "Connection refused" to MongoDB | Check Docker containers: `docker-compose ps` |
| "Invalid signature" errors | Verify `INTERNAL_HEADER_SECRET` matches across services |
| "Session not valid" | Check Auth service logs, verify Redis connection |
| Federation errors | Ensure all subgraph services are running |

### Viewing Logs

```bash
# All services
docker-compose -f docker-compose.development.yml logs -f

# Specific service
docker-compose -f docker-compose.development.yml logs -f auth
```

### Resetting Data

```bash
# Stop all containers
docker-compose -f docker-compose.development.yml down

# Remove volumes (WARNING: deletes all data)
docker-compose -f docker-compose.development.yml down -v

# Restart fresh
docker-compose -f docker-compose.development.yml up -d
```

## Next Steps

- [Architecture Overview](/getting-started/architecture) - Understand the system design
- [Gateway Service](/services/gateway) - Learn about the entry point
- [Add New Service Guide](/guides/add-new-service) - Extend the platform
