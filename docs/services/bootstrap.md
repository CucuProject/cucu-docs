# Bootstrap Service

The Bootstrap service **seeds initial data** when the Cucu platform is first deployed, then exits.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 3100 |
| **Database** | None (uses other services via RPC) |
| **Role** | One-time seed data creation |
| **Dependencies** | Gateway, Grants, Users, Milestones, GroupAssignments, Organization, Projects, MilestoneToProject |

## Purpose

The Bootstrap service runs once during initial deployment to:

1. Wait for all dependent services to be ready
2. Seed permission groups and permissions
3. Seed lookup tables (seniority levels, job roles)
4. Seed project templates
5. Seed initial users
6. Seed sample milestones
7. Seed demo project data
8. Exit with success code

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Bootstrap Service                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐                                                │
│  │ 1. Wait for     │ ← MicroservicesOrchestrator                    │
│  │    Dependencies │   polls service health via Redis               │
│  └────────┬────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐                                                │
│  │ 2. GrantsSeeder │ → INTROSPECT_GATEWAY, CREATE_GROUP,           │
│  │                 │   UPSERT_PERMISSION, UPSERT_OPERATION_PERMISSION│
│  └────────┬────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐                                                │
│  │ 3. LookupTables │ → CREATE_SENIORITY_LEVEL, CREATE_JOB_ROLE     │
│  │    Seeder       │                                                │
│  └────────┬────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐                                                │
│  │ 4. ProjectTpl   │ → CREATE_PROJECT_TEMPLATE,                     │
│  │    Seeder       │   CREATE_PROJECT_TEMPLATE_PHASE                │
│  └────────┬────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐                                                │
│  │ 5. UsersSeeder  │ → CREATE_USER, UPDATE_USER                     │
│  │                 │   (with supervisor hierarchy)                   │
│  └────────┬────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐                                                │
│  │ 6. Milestones   │ → CREATE_MILESTONE                             │
│  │    Seeder       │                                                │
│  └────────┬────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐                                                │
│  │ 7. DemoProject  │ → CREATE_PROJECT, CREATE_MILESTONE_TO_PROJECT  │
│  │    Seeder       │                                                │
│  └────────┬────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐                                                │
│  │ 8. Exit(0)      │                                                │
│  └─────────────────┘                                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Seeders

### GrantsSeeder

Seeds permission groups and all permissions:

1. **Loads federated schema** via `INTROSPECT_GATEWAY` RPC
2. **Creates groups** defined in YAML (SUPERADMIN, ADMIN, etc.)
3. **Creates field permissions** with wildcard support:
   - `entity: "*"` → all root entities
   - `path: "*"` → all fields in entity
   - `path: "personalData.*"` → all fields under personalData
4. **Creates operation permissions** for all queries/mutations
5. **Creates page permissions** for frontend routes

### LookupTablesSeeder

Seeds organization lookup tables:

- **Seniority Levels**: Junior, Mid, Senior, Lead, etc.
- **Job Roles**: Developer, Designer, PM, etc.

### ProjectTemplatesSeeder

Seeds default project templates:

- Creates template with phases
- Sets up default color palette
- Configures minimum allocation

### UsersSeeder

Seeds initial users in two phases:

1. **Phase 1**: Create all users (without supervisor relationships)
2. **Phase 2**: Apply supervisor hierarchy (after all users exist)

### MilestonesSeeder

Seeds sample milestones for development/testing.

### DemoProjectSeeder

Seeds a demo project with:
- Project basic data
- Assigned milestones
- Milestone-to-project relationships

## Configuration

### Environment Variables

```ini
# Service Config
BOOTSTRAP_SERVICE_NAME=bootstrap
BOOTSTRAP_SERVICE_PORT=3100

# Dependencies (JSON array)
BOOTSTRAP_DEPENDENCIES=["gateway", "grants", "users", "group-assignments", "milestones", "organization", "projects", "milestone-to-project"]

# Redis for mTLS
REDIS_SERVICE_HOST=redis
REDIS_SERVICE_TLS_PORT=6380
BOOTSTRAP_REDIS_TLS_CLIENT_CERT=/certs/bootstrap.crt
BOOTSTRAP_REDIS_TLS_CLIENT_KEY=/certs/bootstrap.key
REDIS_TLS_CA_CERT=/certs/redis-ca.crt

# Admin user credentials
SUPERADMIN_EMAIL=superadmin@local.cucu
SUPERADMIN_PASS=pass1234
```

## YAML Configuration

The bootstrap service reads seed data from a YAML configuration file. Example structure:

```yaml
# Groups and permissions
groups:
  - name: SUPERADMIN
    description: Full system access
    permissions:
      field:
        - entity: "*"
          path: "*"
          view: true
          edit: true
      operation:
        - name: "*"
          execute: true
    pages:
      - key: "/"
        access: true
      - key: "/admin"
        access: true

  - name: VIEWER
    description: Read-only access
    permissions:
      field:
        - entity: User
          path: "authData.*"
          view: true
          edit: false
      operation:
        - name: "findAllUsers,findOneUser"
          execute: true
    pages:
      - key: "/"
        access: true

# Lookup tables
seniorityLevels:
  - name: Junior
    order: 1
    description: Entry level
  - name: Mid
    order: 2
    description: Intermediate level
  - name: Senior
    order: 3
    description: Senior level

jobRoles:
  - name: Developer
    order: 1
  - name: Designer
    order: 2
  - name: PM
    order: 3

# Initial users
users:
  - email: superadmin@local.cucu
    password: pass1234
    name: Super
    surname: Admin
    groups:
      - SUPERADMIN
  - email: admin@local.cucu
    password: pass1234
    name: Admin
    surname: User
    groups:
      - ADMIN
    supervisors:
      - superadmin@local.cucu
```

## Usage

### Development

```bash
# Run bootstrap service
pnpm run start:dev bootstrap
```

### Docker

```bash
# Run via docker-compose
docker-compose run bootstrap

# Or as part of full stack startup
docker-compose up -d
```

### Kubernetes

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: cucu-bootstrap
spec:
  template:
    spec:
      containers:
        - name: bootstrap
          image: cucu/bootstrap:latest
          envFrom:
            - configMapRef:
                name: cucu-config
            - secretRef:
                name: cucu-secrets
      restartPolicy: OnFailure
  backoffLimit: 3
```

## Idempotency

The bootstrap service is designed to be **idempotent**:

- Uses `FIND_*_BY_NAME` before creating to check existence
- Uses `UPSERT_*` operations where available
- Safe to run multiple times (no duplicate data)
- Skips existing records with debug logging

## RPC Patterns Used

### To Gateway

| Pattern | Purpose |
|---------|---------|
| `INTROSPECT_GATEWAY` | Get federated schema for permission generation |

### To Grants

| Pattern | Purpose |
|---------|---------|
| `FIND_GROUP_BY_NAME` | Check if group exists |
| `CREATE_GROUP` | Create permission group |
| `UPSERT_PERMISSION` | Create/update field permission |
| `UPSERT_OPERATION_PERMISSION` | Create/update operation permission |
| `UPSERT_PAGE_PERMISSION` | Create/update page permission |

### To Users

| Pattern | Purpose |
|---------|---------|
| `FIND_USER_BY_EMAIL` | Check if user exists |
| `CREATE_USER` | Create new user |
| `UPDATE_USER` | Set supervisor hierarchy |

### To Organization

| Pattern | Purpose |
|---------|---------|
| `FIND_SENIORITY_LEVEL_BY_NAME` | Check if level exists |
| `CREATE_SENIORITY_LEVEL` | Create seniority level |
| `FIND_JOB_ROLE_BY_NAME` | Check if role exists |
| `CREATE_JOB_ROLE` | Create job role |

### To Projects

| Pattern | Purpose |
|---------|---------|
| `FIND_PROJECT_BY_NAME` | Check if project exists |
| `CREATE_PROJECT` | Create project |
| `CREATE_PROJECT_TEMPLATE` | Create project template |
| `CREATE_PROJECT_TEMPLATE_PHASE` | Create template phase |

### To Milestones

| Pattern | Purpose |
|---------|---------|
| `FIND_MILESTONE_BY_NAME` | Check if milestone exists |
| `CREATE_MILESTONE` | Create milestone |

### To MilestoneToProject

| Pattern | Purpose |
|---------|---------|
| `CREATE_MILESTONE_TO_PROJECT` | Create project-milestone relationship |

## File Structure

```
apps/bootstrap/
├── src/
│   ├── main.ts                       # Entry point
│   ├── bootstrap.module.ts           # Module with Redis clients
│   ├── bootstrap.service.ts          # Orchestrates seeders
│   ├── config/
│   │   └── bootstrap.yaml            # Seed data configuration
│   ├── constants/
│   │   └── root-env-keys.ts          # Entity name env keys
│   ├── seeders/
│   │   ├── grants.seeder.ts          # Groups & permissions
│   │   ├── lookup-tables.seeder.ts   # Seniority & job roles
│   │   ├── project-templates.seeder.ts
│   │   ├── users.seeder.ts           # Initial users
│   │   ├── milestones.seeder.ts      # Sample milestones
│   │   └── demo-project.seeder.ts    # Demo project data
│   └── utils/
│       └── yaml-loader.ts            # YAML config parser
├── Dockerfile
└── README.md
```

## Troubleshooting

### "Service not ready" timeout

1. Check dependent services are running
2. Increase `retry` count in orchestrator config
3. Check Redis connectivity

### "Permission already exists" warnings

This is expected on subsequent runs - the seeder skips existing data.

### "Group not found" errors

Ensure GrantsSeeder runs before UsersSeeder (it does by default in `onModuleInit`).

## Next Steps

- [Getting Started](/getting-started/setup) - Initial setup guide
- [Grants Service](/services/grants) - Permission management
- [Architecture Overview](/architecture/overview) - System architecture
