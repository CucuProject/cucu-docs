# Port Assignments

This document lists all port assignments for services and databases in the Cucu platform.

## Service Ports

| Service | HTTP Port | Purpose |
|---------|-----------|---------|
| **gateway** | 3000 | Apollo Federation Gateway |
| **auth** | 3001 | Authentication & Sessions |
| **users** | 3002 | User Management |
| **projects** | 3003 | Project Management |
| **milestones** | 3004 | Milestone Management |
| **milestone-to-user** | 3005 | User ↔ Milestone Relations |
| **milestone-to-project** | 3006 | Project ↔ Milestone Relations |
| **group-assignments** | 3007 | User ↔ Group Relations |
| **project-access** | 3008 | Project Access Control |
| **grants** | 3010 | Permissions & Groups |
| **organization** | 3012 | Lookup Tables |
| **audit** | 3015 | Audit Trail (event consumer) |
| **bootstrap** | 3100 | Seed Data (one-time) |

## Database Ports

| Service | DB Port | Database Name |
|---------|---------|---------------|
| **auth** | 9001 | auth |
| **users** | 9002 | users |
| **projects** | 9003 | projects |
| **milestones** | 9004 | milestones |
| **milestone-to-user** | 9005 | milestone-to-user |
| **milestone-to-project** | 9006 | milestone-to-project |
| **group-assignments** | 9007 | group-assignments |
| **project-access** | 9008 | project-access |
| **grants** | 9010 | grants |
| **organization** | 9012 | organization |
| **audit** | 9015 | audit |

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
AUTH_DB_PORT=9001
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
│:3001   │          │:3002   │           │:3010   │
│ Auth   │          │ Users  │           │ Grants │
│        │          │        │           │        │
│ DB:9001│          │ DB:9002│           │ DB:9010│
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

# Users
MONGODB_URI=mongodb://users-db:9002/users

# Grants
MONGODB_URI=mongodb://grants-db:9010/grants
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
```

## Adding a New Service

When adding a new service, assign the next available ports:

1. Service port: Next after 3015 (e.g., 3016, 3017, ...)
2. Database port: Next after 9015 (e.g., 9016, 9017, ...)

Update this document with the new assignments.
