# Service Startup & Orchestration

This document describes how services start up, verify dependencies, and signal readiness in the Cucu platform.

## Startup Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SERVICE STARTUP                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. DEPENDENCY CHECK                                                         │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ MicroservicesOrchestratorService.areDependenciesReady()                │ │
│  │ • Read ${SERVICE}_DEPENDENCIES env var                                 │ │
│  │ • Check Redis keys: service_ready:${depName}                          │ │
│  │ • Subscribe to 'service_ready' channel                                │ │
│  │ • Wait for all dependencies or timeout                                │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  2. MODULE INITIALIZATION                                                    │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ NestJS OnModuleInit lifecycle                                         │ │
│  │ • Connect to MongoDB                                                  │ │
│  │ • Register GraphQL schema                                             │ │
│  │ • Connect Redis clients                                               │ │
│  │ • Initialize permission cache                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  3. READY NOTIFICATION                                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ MicroservicesOrchestratorService.notifyServiceReady()                 │ │
│  │ • Set Redis key: service_ready:${serviceName} (24h TTL)              │ │
│  │ • Publish to 'service_ready' channel                                  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  4. LISTEN FOR REQUESTS                                                      │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ app.listen(SERVICE_PORT)                                               │ │
│  │ • GraphQL endpoint available                                          │ │
│  │ • Redis RPC handlers active                                           │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Dependency Configuration

Dependencies are configured via environment variables:

```ini
# Each service declares its dependencies
GATEWAY_DEPENDENCIES=["auth","users","grants"]
AUTH_DEPENDENCIES=["users"]
USERS_DEPENDENCIES=["grants"]
MILESTONES_DEPENDENCIES=["users","projects"]
MILESTONE_TO_USER_DEPENDENCIES=["users","milestones"]
GROUP_ASSIGNMENTS_DEPENDENCIES=["users","grants"]
```

## MicroservicesOrchestratorService

```typescript
// _shared/microservices_orchestrator/src/microservices-orchestrator.service.ts
@Injectable()
export class MicroservicesOrchestratorService {
  private readonly READY_KEY_PREFIX = 'service_ready:';
  private readonly READY_CHANNEL = 'service_ready';

  async areDependenciesReady(
    serviceName: string,
    options?: OrchestratorOptions
  ): Promise<boolean> {
    // Parse dependencies from env
    const depsJson = process.env[`${serviceName.toUpperCase()}_DEPENDENCIES`];
    if (!depsJson) {
      this.log(`No dependencies for ${serviceName}`);
      return true;
    }

    const dependencies = JSON.parse(depsJson) as string[];
    if (dependencies.length === 0) return true;

    this.log(`Checking dependencies: ${dependencies.join(', ')}`);

    // Connect to Redis
    const redis = await this.createRedisClient(options);
    const subscriber = redis.duplicate();

    try {
      // Check which deps are already ready
      const readySet = new Set<string>();
      for (const dep of dependencies) {
        const key = `${this.READY_KEY_PREFIX}${dep}`;
        const exists = await redis.exists(key);
        if (exists) {
          readySet.add(dep);
          this.log(`✓ ${dep} already ready`);
        }
      }

      // If all ready, return immediately
      if (readySet.size === dependencies.length) {
        return true;
      }

      // Subscribe and wait for remaining
      await subscriber.subscribe(this.READY_CHANNEL);

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          subscriber.unsubscribe();
          reject(new Error('Dependency timeout'));
        }, (options?.maxRetries || 5) * (options?.retryDelay || 3000));

        subscriber.on('message', (channel, message) => {
          if (channel !== this.READY_CHANNEL) return;

          const readyService = message.replace('_ready', '');
          if (dependencies.includes(readyService)) {
            readySet.add(readyService);
            this.log(`✓ ${readyService} became ready`);

            if (readySet.size === dependencies.length) {
              clearTimeout(timeout);
              subscriber.unsubscribe();
              resolve(true);
            }
          }
        });
      });
    } finally {
      redis.disconnect();
      subscriber.disconnect();
    }
  }

  async notifyServiceReady(
    serviceName: string,
    options?: OrchestratorOptions
  ): Promise<void> {
    const redis = await this.createRedisClient(options);

    try {
      // Set ready key with 24h expiry
      const key = `${this.READY_KEY_PREFIX}${serviceName}`;
      await redis.set(key, '1', 'EX', 86400);

      // Publish ready message
      await redis.publish(this.READY_CHANNEL, `${serviceName}_ready`);

      this.log(`Service ${serviceName} marked as ready`);
    } finally {
      redis.disconnect();
    }
  }
}
```

## Service Main Entry Point

```typescript
// apps/users/src/main.ts
async function bootstrap() {
  const app = await NestFactory.create(UsersModule);
  const configService = app.get(ConfigService);
  const orchestrator = app.get(MicroservicesOrchestratorService);

  const serviceName = configService.get('USERS_SERVICE_NAME', 'users');
  const port = configService.get('USERS_SERVICE_PORT', 3003);

  // 1. Wait for dependencies
  try {
    await orchestrator.areDependenciesReady(serviceName, {
      maxRetries: 10,
      retryDelay: 3000,
      useTls: !!configService.get('REDIS_TLS_CA_CERT'),
    });
    console.log('All dependencies ready');
  } catch (error) {
    console.error('Dependency check failed:', error);
    process.exit(1);
  }

  // 2. Connect Redis microservice transport
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.REDIS,
    options: buildRedisTlsOptions(configService, 'USERS'),
  });

  // 3. Start microservice and HTTP server
  await app.startAllMicroservices();
  await app.listen(port);

  // 4. Notify ready
  await orchestrator.notifyServiceReady(serviceName);

  console.log(`Users service running on port ${port}`);
}
```

## Startup Order

Recommended startup order based on dependencies:

```
Phase 1: Infrastructure
  └── Redis (must be first)

Phase 2: Core Services (no dependencies)
  ├── grants
  └── organization

Phase 3: Primary Services
  ├── users (depends on: grants)
  └── auth (depends on: users)

Phase 4: Entity Services
  ├── projects (depends on: users)
  └── milestones (depends on: users)

Phase 5: Relationship Services
  ├── group-assignments (depends on: users, grants)
  ├── milestone-to-user (depends on: users, milestones)
  └── milestone-to-project (depends on: projects, milestones)

Phase 6: Gateway
  └── gateway (depends on: auth, users, grants, ...)

Phase 7: Bootstrap (optional)
  └── bootstrap (depends on: all services)
```

## Docker Compose Dependencies

```yaml
# docker-compose.yml
services:
  redis:
    image: redis:7.4-alpine
    ports:
      - "6379:6379"
      - "6380:6380"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  grants:
    build: ./apps/grants
    depends_on:
      redis:
        condition: service_healthy
    environment:
      - GRANTS_DEPENDENCIES=[]

  users:
    build: ./apps/users
    depends_on:
      redis:
        condition: service_healthy
      grants:
        condition: service_started
    environment:
      - USERS_DEPENDENCIES=["grants"]

  auth:
    build: ./apps/auth
    depends_on:
      redis:
        condition: service_healthy
      users:
        condition: service_started
    environment:
      - AUTH_DEPENDENCIES=["users"]

  gateway:
    build: ./apps/gateway
    depends_on:
      redis:
        condition: service_healthy
      auth:
        condition: service_started
      users:
        condition: service_started
      grants:
        condition: service_started
    environment:
      - GATEWAY_DEPENDENCIES=["auth","users","grants"]
```

## Health Checks

### Service Health Endpoint

```typescript
// apps/users/src/health/health.controller.ts
@Controller('health')
export class HealthController {
  constructor(
    private readonly orchestrator: MicroservicesOrchestratorService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  async check() {
    const serviceName = this.configService.get('USERS_SERVICE_NAME');

    return {
      status: 'ok',
      service: serviceName,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async ready() {
    const serviceName = this.configService.get('USERS_SERVICE_NAME');

    const isReady = await this.orchestrator.areServicesReady(
      [serviceName],
      { useTls: !!this.configService.get('REDIS_TLS_CA_CERT') }
    );

    if (!isReady.get(serviceName)) {
      throw new ServiceUnavailableException('Service not ready');
    }

    return { status: 'ready' };
  }
}
```

### Kubernetes Probes

```yaml
# k8s/deployment.yaml
spec:
  containers:
    - name: users
      livenessProbe:
        httpGet:
          path: /health
          port: 3003
        initialDelaySeconds: 10
        periodSeconds: 10
      readinessProbe:
        httpGet:
          path: /health/ready
          port: 3003
        initialDelaySeconds: 5
        periodSeconds: 5
```

## Bootstrap Service

The bootstrap service seeds initial data after all services are ready:

```typescript
// apps/bootstrap/src/main.ts
async function bootstrap() {
  const app = await NestFactory.create(BootstrapModule);
  const seeder = app.get(SeederService);

  console.log('Starting bootstrap...');

  // Wait for all services
  await seeder.waitForServices([
    'auth', 'users', 'grants', 'organization'
  ]);

  // Run seeding
  await seeder.seed();

  console.log('Bootstrap complete');
  process.exit(0);
}
```

### Seeding Order

```typescript
// apps/bootstrap/src/seeder.service.ts
async seed(): Promise<void> {
  // 1. Create lookup tables (organization)
  await this.createSeniorityLevels();
  await this.createJobRoles();
  await this.createCompanies();

  // 2. Create permission groups
  const superadminGroup = await this.createSuperadminGroup();
  const managerGroup = await this.createManagerGroup();
  const viewerGroup = await this.createViewerGroup();

  // 3. Create default permissions for groups
  await this.createOperationPermissions(superadminGroup._id);
  await this.createFieldPermissions(superadminGroup._id);

  // 4. Create admin user
  const adminUser = await this.createAdminUser();

  // 5. Assign admin to superadmin group
  await this.assignUserToGroup(adminUser._id, superadminGroup._id);
}
```

## Graceful Shutdown

```typescript
// apps/users/src/main.ts
async function bootstrap() {
  const app = await NestFactory.create(UsersModule);
  const orchestrator = app.get(MicroservicesOrchestratorService);
  const serviceName = 'users';

  // Enable graceful shutdown
  app.enableShutdownHooks();

  // Handle shutdown
  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down...`);

    // Mark service as not ready
    await orchestrator.resetServiceStatus(serviceName);

    // Close connections
    await app.close();

    console.log('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Start service...
}
```

## Troubleshooting

### Service Won't Start

1. Check Redis connectivity:
   ```bash
   redis-cli -h localhost -p 6379 ping
   ```

2. Check dependency status:
   ```bash
   redis-cli -h localhost -p 6379 keys 'service_ready:*'
   ```

3. Manually mark service ready (for testing):
   ```bash
   redis-cli -h localhost -p 6379 set service_ready:grants 1
   ```

### Circular Dependencies

Avoid circular dependencies in service startup:

```
# BAD: Circular dependency
auth → users → grants → auth

# GOOD: Acyclic dependency graph
grants (no deps)
  ↓
users (grants)
  ↓
auth (users)
```

### Reset Service State

```bash
# Clear all ready keys
redis-cli -h localhost -p 6379 del $(redis-cli keys 'service_ready:*')

# Restart services
docker-compose restart
```

## Next Steps

- [Gateway Service](/services/gateway) - Entry point configuration
- [Debugging Guide](/guides/debugging) - Troubleshooting startup issues
