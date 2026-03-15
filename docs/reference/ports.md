# Port Assignments

This document lists all port assignments for services and databases in the Cucu platform.

## Service Ports

| Service | HTTP Port | Purpose |
|---------|-----------|---------|
| **gateway** | 3000 | Apollo Federation Gateway |
| **auth** | 3001 | Authentication & Sessions |
| **tenants** | 3002 | Tenant Registry & Platform DB |
| **users** | 3003 | User Management |
| **projects** | 3004 | Project Management |
| **milestones** | 3005 | Milestone Management |
| **milestone-to-user** | 3006 | User ↔ Milestone Relations |
| **milestone-to-project** | 3007 | Project ↔ Milestone Relations |
| **group-assignments** | 3008 | User ↔ Group Relations |
| **project-access** | 3009 | Project Access Control |
| **grants** | 3011 | Permissions & Groups |
| **organization** | 3012 | Company, JobRole, SeniorityLevel, RoleCategory |
| **bootstrap** | 3100 | Seed Data (one-time) |

## Database Ports

| Service | DB Port | Database Name |
|---------|---------|---------------|
| **auth** | 9001 | auth |
| **tenants** | 9002 | tenants (Platform DB) |
| **users** | 9003 | users |
| **projects** | 9004 | projects |
| **milestones** | 9005 | milestones |
| **milestone-to-user** | 9006 | milestone-to-user |
| **milestone-to-project** | 9007 | milestone-to-project |
| **group-assignments** | 9008 | group-assignments |
| **project-access** | 9009 | project-access |
| **grants** | 9011 | grants |
| **organization** | 9012 | organization |

## Redis Ports

| Port | Purpose |
|------|---------|
| 6379 | Redis (plain connection) |
| 6380 | Redis (mTLS connection) |

## Environment Variable Pattern

```ini
# Service Port
<SERVICE>_SERVICE_PORT=<port>

# Database Port
<SERVICE>_DB_PORT=<port>

# Examples
GATEWAY_SERVICE_PORT=3000
AUTH_SERVICE_PORT=3001
TENANTS_SERVICE_PORT=3002
AUTH_DB_PORT=9001
TENANTS_DB_PORT=9002
```

## Port Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    External Access                           │
│                      Port 3000                              │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Gateway (:3000)                            │
└─────────────────────────┬───────────────────────────────────┘
                          │
    ┌─────────────────────┼─────────────────────┐
    │                     │                     │
    ▼                     ▼                     ▼
┌────────┐          ┌────────┐           ┌────────┐
│:3001   │          │:3002   │           │:3011   │
│ Auth   │          │Tenants │           │ Grants │
│        │          │        │           │        │
│ DB:9001│          │ DB:9002│           │ DB:9011│
└────────┘          └────────┘           └────────┘
    │                     │                     │
    └─────────────────────┼─────────────────────┘
                          │
                          ▼
              ┌─────────────────────┐
              │   Redis :6379/6380  │
              └─────────────────────┘
```

## MongoDB Connection Strings

```ini
# Pattern
MONGODB_URI=mongodb://<service>-db:<db-port>/<database>

# Examples
# Auth
MONGODB_URI=mongodb://auth-db:9001/auth

# Tenants (Platform DB)
MONGODB_URI=mongodb://tenants-db:9002/tenants

# Users
MONGODB_URI=mongodb://users-db:9003/users

# Grants
MONGODB_URI=mongodb://grants-db:9011/grants
```

## Docker Network

All services communicate on the Docker internal network. External access is only through the gateway on port 3000.

```yaml
services:
  gateway:
    ports:
      - "3000:3000"  # Exposed

  auth:
    expose:
      - "3001"       # Internal only
    ports:
      - "3001:3001"  # For development

  tenants:
    expose:
      - "3002"       # Internal only
    ports:
      - "3002:3002"  # For development
```

## Development vs Production

### Development

All ports exposed for debugging:

```yaml
services:
  auth:
    ports:
      - "3001:3001"
  auth-db:
    ports:
      - "9001:27017"
  tenants:
    ports:
      - "3002:3002"
  tenants-db:
    ports:
      - "9002:27017"
```

### Production

Only gateway exposed:

```yaml
services:
  gateway:
    ports:
      - "3000:3000"

  auth:
    expose:
      - "3001"
    # No ports mapping
  
  tenants:
    expose:
      - "3002"
    # No ports mapping
```

## Adding a New Service

When adding a new service, assign the next available ports:

1. Service port: Next available after 3012 (e.g., 3010 is free, then 3013, 3014, ...)
2. Database port: Next available after 9012 (e.g., 9010 is free, then 9013, 9014, ...)

::: tip Currently available service ports
`3010` is currently free. After that: `3013`, `3014`, ...
:::

::: tip Currently available DB ports
`9010` is currently free. After that: `9013`, `9014`, ...
:::

Update this document with the new assignments.
