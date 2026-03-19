# Startup & Orchestration

Cucu uses a shared bootstrap function (`createSubgraphMicroservice`) and a dependency orchestration system (`@cucu/microservices-orchestrator`) to ensure services start in the correct order and all dependencies are available.

## Shared Bootstrap: `createSubgraphMicroservice()`

Every subgraph service (except Gateway and Bootstrap) uses the same bootstrap function:

```typescript
// Example: auth/src/main.ts
import { AuthModule } from './auth.module';
import { createSubgraphMicroservice } from '@cucu/service-common';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  await createSubgraphMicroservice(AuthModule, 'AUTH', {
    cors: { origin: process.env.CORS_ORIGIN, credentials: true },
    beforeStart: (app) => app.use(cookieParser()),
  });
}
bootstrap();
```

### What `createSubgraphMicroservice` Does

1. **Create NestJS app** via `NestFactory.create(module)`
2. **Apply hooks** — `beforeStart` callback (e.g., cookieParser)
3. **Enable CORS** if configured
4. **Apply middleware** if provided
5. **Get ConfigService** and **MicroservicesOrchestratorService**
6. **Check dependencies** — `areDependenciesReady(serviceName, redisConfig)`
7. **Connect Redis microservice** — `Transport.REDIS` with mTLS, `inheritAppConfig: true`
8. **Register global interceptors** — `TenantInterceptor`
9. **Register global pipes** — `ValidationPipe` (whitelist, forbidNonWhitelisted, transform)
10. **Start microservices** — `app.startAllMicroservices()`
11. **Listen HTTP** — `app.listen(port)` from `{PREFIX}_SERVICE_PORT`
12. **Notify ready** — `orchestratorService.notifyServiceReady(serviceName, redisConfig)`

### `inheritAppConfig: true`

This is critical — it ensures that `APP_INTERCEPTOR`, `APP_GUARD`, and `APP_PIPE` registered in modules are also applied to the microservice transport (RPC handlers). Without it, `TenantInterceptor` wouldn't run on RPC messages.

### Execution Order

```mermaid
flowchart TD
    A[NestFactory.create] --> B[beforeStart hook]
    B --> C[Enable CORS]
    C --> D[Apply middleware]
    D --> E[areDependenciesReady - blocking]
    E --> F[connectMicroservice - Redis + mTLS]
    F --> G[useGlobalInterceptors - TenantInterceptor]
    G --> H[useGlobalPipes - ValidationPipe]
    H --> I[startAllMicroservices]
    I --> J[app.listen port]
    J --> K[notifyServiceReady]
```

## Dependency Orchestration

The `@cucu/microservices-orchestrator` module ensures services wait for their dependencies before accepting requests.

### How It Works

Each service:
1. **Declares dependencies** (implicit — the orchestrator checks Redis connectivity)
2. **Blocks at startup** until dependencies are ready via `areDependenciesReady()`
3. **Notifies readiness** after HTTP + microservice transport are both listening

The orchestrator uses **Redis pub/sub** for service readiness notifications:
- Each service publishes a "ready" message on a known channel
- Dependent services subscribe and wait for the message
- Configurable retry count and delay

### Configuration

```typescript
await orchestratorService.areDependenciesReady(serviceName, {
  redisServiceHost,
  redisServicePort,
  useTls: true,
  redisTlsCertPath,
  redisTlsKeyPath,
  redisTlsCaPath,
  ...orchestratorOptions, // optional retry/retryDelays overrides
});
```

## Service Startup Order

The typical startup sequence in production:

```mermaid
flowchart TD
    REDIS[Redis Server] --> |available| ALL[All services can start]
    
    subgraph "Phase 1: Infrastructure"
        REDIS
        MONGODB[(MongoDB)]
    end
    
    subgraph "Phase 2: Foundation Services"
        TENANTS[Tenants :3013]
        GRANTS[Grants :3010]
        ORG[Organization :3012]
    end
    
    subgraph "Phase 3: Core Services"
        AUTH[Auth :3001]
        USERS[Users :3002]
    end
    
    subgraph "Phase 4: Domain Services"
        MILESTONES[Milestones :3004]
        PROJECTS[Projects :3003]
        GA[GroupAssignments :3007]
        M2U[MilestoneToUser :3005]
        M2P[MilestoneToProject :3006]
        PA[ProjectAccess :3008]
    end
    
    subgraph "Phase 5: Gateway"
        GW[Gateway :3000]
    end
    
    subgraph "Phase 6: Seeder"
        BOOTSTRAP[Bootstrap :3100]
    end
    
    REDIS --> TENANTS & GRANTS & ORG
    TENANTS & GRANTS --> AUTH & USERS
    USERS & MILESTONES --> M2U & M2P & GA
    ALL --> GW
    GW --> BOOTSTRAP
```

::: info
The Gateway must start after all subgraphs are available because `IntrospectAndCompose` queries each subgraph's schema at startup. If a subgraph is missing, composition fails.
:::

## Module Initialization (`onModuleInit`)

Several services perform initialization work in `onModuleInit`:

### All Services with Permissions

```typescript
async onModuleInit() {
  this.introspectionFields.configure({
    maxDepth: 2,
    debug: true,
    allowedTypes: ['User', 'AuthData', 'PersonalData', ...],
  });
  this.introspectionFields.warmUpEntities(['User', 'AuthData', ...]);
}
```

This pre-introspects the local GraphQL schema to discover all fields — required for the field-level permission system.

### Projects Service

```typescript
async onModuleInit() {
  // ... introspection setup ...
  await this.holidayCalendarService.seedHolidays();     // Seeds holiday data
  await this.projectTemplateService.seedTemplates();     // Seeds default project templates
}
```

### TenantDatabaseModule

```typescript
async onModuleInit() {
  await this.manager.init(); // Establishes the base MongoDB connection
}
```

## Bootstrap Service

The Bootstrap service is a **one-shot seeder** that runs after all services are available. It creates initial data via RPC calls to other services:

### Seeder Execution Order

```mermaid
flowchart TD
    A[BootstrapService.onApplicationBootstrap] --> B[MultiTenantSeeder]
    B --> |"BOOTSTRAP_TENANT RPC"| C[Tenant + provisioning]
    C --> D[GrantsSeeder]
    D --> |"CREATE_GROUP, UPSERT_PERMISSION, etc."| E[Groups + permissions]
    E --> F[LookupTablesSeeder]
    F --> |"CREATE_SENIORITY_LEVEL, CREATE_JOB_ROLE, etc."| G[Org entities]
    G --> H[UsersSeeder]
    H --> |"CREATE_USER, UPSERT_USER_IDENTITY"| I[Admin + test users]
    I --> J[MilestonesSeeder]
    J --> |"CREATE_MILESTONE"| K[Sample milestones]
    K --> L[ProjectTemplatesSeeder]
    L --> |"CREATE_PROJECT_TEMPLATE, CREATE_PROJECT_TEMPLATE_PHASE"| M[Templates]
    M --> N[DemoProjectSeeder]
    N --> |"CREATE_PROJECT, CREATE_MILESTONE_TO_PROJECT"| O[Demo data]
```

### Key Design Decisions

1. **RPC-based seeding** — Bootstrap doesn't access databases directly; it calls services via Redis RPC. This ensures all business logic (validation, events) runs correctly.
2. **Idempotent** — Each seeder checks if data already exists before creating. Safe to run multiple times.
3. **RpcInternalGuard** — Bootstrap uses `_internalSecret` in payloads to authenticate to protected endpoints.
4. **Multi-tenant aware** — Bootstrap creates tenants first, then seeds data within each tenant's context.

## Gateway Bootstrap

The Gateway has a special startup because it doesn't use `createSubgraphMicroservice()`:

```typescript
// gateway/src/main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.enableCors({ origin, credentials: true });
  
  const orchestrator = app.get(MicroservicesOrchestratorService);
  await orchestrator.areDependenciesReady('gateway', redisConfig);
  
  // No connectMicroservice — Gateway doesn't listen on Redis RPC
  // It only acts as an RPC client (sends to Auth, Tenants, etc.)
  
  await app.listen(port);
  orchestrator.notifyServiceReady('gateway', redisConfig);
}
```

The Gateway is an RPC **client** only — it never handles `@MessagePattern` or `@EventPattern`. It connects to Redis solely for `send()` and `emit()` calls.

## Health Monitoring

The `TenantConnectionManager` exposes pool statistics:

```typescript
manager.getStats(): {
  activePools: number,           // Currently active tenant connections
  baseConnectionState: number,   // Mongoose ready state (1 = connected)
  pools: [{
    dbName: string,              // e.g., "users_acme"
    readyState: number,
    lastAccess: Date,
  }]
}
```

This can be used by health check endpoints to monitor multi-tenant connection health.
