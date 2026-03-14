# Bootstrap Service

The Bootstrap service **seeds initial data** when the platform is first deployed.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 3100 |
| **Database** | None (uses other services) |
| **Role** | One-time seed data creation |
| **Dependencies** | Auth, Users, Grants, Organization |

## Purpose

The Bootstrap service:
1. Waits for all dependent services to be ready
2. Creates lookup tables (SeniorityLevels, JobRoles, Companies)
3. Creates permission groups (SUPERADMIN, ADMIN, etc.)
4. Creates default operation and field permissions
5. Creates the initial admin user
6. Assigns admin to SUPERADMIN group
7. Exits after completion

## Run Order

```
┌─────────────────────────────────────────────────────────────┐
│                      Bootstrap Service                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Wait for dependencies                                   │
│     └── Auth, Users, Grants, Organization                   │
│                                                              │
│  2. Create lookup tables (Organization service)             │
│     ├── SeniorityLevels: Junior, Mid, Senior, Lead         │
│     ├── JobRoles: Developer, Designer, PM, ...             │
│     └── Companies: Default company                          │
│                                                              │
│  3. Create permission groups (Grants service)               │
│     ├── SUPERADMIN: Full access                             │
│     ├── ADMIN: User management                              │
│     ├── MANAGER: Team management                            │
│     └── VIEWER: Read-only                                   │
│                                                              │
│  4. Create permissions (Grants service)                     │
│     ├── Operation permissions for all groups                │
│     └── Field permissions for all entities                  │
│                                                              │
│  5. Create admin user (Users service)                       │
│     └── admin@cucu.com / admin123                          │
│                                                              │
│  6. Assign admin to SUPERADMIN (GroupAssignments)          │
│                                                              │
│  7. Exit with success                                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Usage

```bash
# Run bootstrap
pnpm run start:dev bootstrap

# Or via Docker
docker-compose run bootstrap
```

## Configuration

```ini
BOOTSTRAP_SERVICE_NAME=bootstrap
BOOTSTRAP_SERVICE_PORT=3100
BOOTSTRAP_DEPENDENCIES=["auth","users","grants","organization"]

# Admin credentials (changeable via env)
BOOTSTRAP_ADMIN_EMAIL=admin@cucu.com
BOOTSTRAP_ADMIN_PASSWORD=admin123
```

## Idempotency

The bootstrap service is designed to be idempotent:
- Uses `UPSERT` operations where possible
- Checks for existing data before creating
- Safe to run multiple times

---

::: warning Coming Soon - Phase 2
Full documentation with YAML configuration, custom seed data, and environment-specific bootstrapping will be added in Phase 2.
:::
