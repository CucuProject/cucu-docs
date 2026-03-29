# Migration Guide: nestjs-cls (TenantContext → ClsModule)

> Completed: 22 March 2026
> PR: service-common #21, #22, tenant-db #4, cucu-nest #323

This guide documents the migration from a raw `AsyncLocalStorage`-based `TenantContext` to the `nestjs-cls` wrapper (`ClsModule`). The root cause, solution, and patterns for adding this to new services are covered.

## Problem: Why This Migration Was Necessary

### Root Cause

The original implementation used a custom `TenantContext` class that wrapped raw `AsyncLocalStorage`. This approach worked fine for REST endpoints, but **failed with Apollo Federation's GraphQL router**.

```typescript
// OLD: TenantContext (raw AsyncLocalStorage)
@Injectable()
export class TenantContext {
  constructor(private readonly als = new AsyncLocalStorage<string>()) {}

  getTenantSlug(): string {
    return this.als.getStore() ?? 'unknown';
  }

  run<T>(tenantSlug: string, fn: () => T): T {
    return this.als.run(tenantSlug, fn);
  }
}
```

Middleware registration:

```typescript
// OLD: Registered on specific routes only
app.use(
  MiddlewareConsumer,
  TenantMiddleware
).forRoutes('graphql'); // ← Only intercepts /graphql
```

**The Problem:** NestJS middleware registered via `MiddlewareConsumer.forRoutes()` runs AFTER Apollo Federation's route registration. By that time, Apollo's `/graphql` route is already locked, and the middleware never fires for federated subgraph requests.

```
NestJS bootstrap order:
1. Register routes (Apollo /graphql)
2. Register middleware (TenantMiddleware.forRoutes('graphql'))
     ↑ Too late! Apollo already has /graphql
3. Request arrives
   → Apollo intercepts and processes
   → Middleware never runs
   → TenantContext.run() not called
   → Tenant slug not in AsyncLocalStorage
   → Service fails to find tenant DB
```

### Impact

Services could not determine the current tenant's slug when processing GraphQL requests, causing:
- Queries against wrong databases
- Cross-tenant data leakage risks
- Session validation failures
- Permission enforcement breakdowns

## Solution: nestjs-cls

The solution uses the **nestjs-cls** package, which is the NestJS-idiomatic wrapper around `AsyncLocalStorage`. Key difference:

```typescript
// NEW: nestjs-cls with Express-level middleware
@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,  // ← Mount at Express level (runs BEFORE Apollo registers routes)
        setup: (cls, req) => {
          const slug = req.headers['x-tenant-slug'];
          if (slug) cls.set('tenantSlug', slug.toString());
        },
      },
      interceptor: { mount: true }, // ← Also mount RPC interceptor
    }),
  ],
})
export class TenantClsModule {}
```

**Key insight:** By setting `middleware: { mount: true }`, nestjs-cls mounts the middleware at the Express/raw HTTP level — BEFORE NestJS and Apollo have a chance to register their routes. This guarantees tenant context is set for every request.

```
Bootstrap order with nestjs-cls:
1. Express middleware (mounted at app level)
   → ClsMiddleware.setup() → cls.set('tenantSlug')
2. NestJS middleware
3. Apollo Federation routes
4. Request arrives
   → Express middleware runs → CLS context set
   → Apollo intercepts
   → Tenant slug already in CLS context
   → Service can read it
```

## Architecture Comparison

### Before (Raw AsyncLocalStorage)

```
┌─────────────────────────┐
│ TenantContext (service) │
│ - AsyncLocalStorage     │
│ - run(slug, fn) method  │
└──────────────┬──────────┘
               │
        ┌──────▼──────┐
        │ Middleware  │
        │ forRoutes() │
        └──────┬──────┘
               │
    ┌──────────▼────────────┐
    │ Only fires on /graphql│
    │ (too late for Apollo) │
    └──────────────────────┘
```

### After (nestjs-cls)

```
┌──────────────────────────────┐
│ ClsModule.forRoot()          │
│ - middleware.mount = true    │
│ - interceptor.mount = true   │
└──────────────┬───────────────┘
               │
    ┌──────────▼──────────┐
    │ Express middleware  │
    │ (runs first)        │
    │ setup(cls, req)     │
    │ cls.set('tenant...')│
    └──────────┬──────────┘
               │
    ┌──────────▼────────────────┐
    │ NestJS + Apollo routes    │
    │ (CLS context ready)       │
    └───────────────────────────┘
```

## Migration Steps

### Phase 0: Add nestjs-cls to service-common

**File:** `libs/service-common/src/tenant-cls/tenant-cls.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { ClsModule, ClsService } from 'nestjs-cls';

export interface TenantClsStore extends ClsStore {
  tenantSlug: string;
  tenantId?: string;
}

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        setup: (cls, req) => {
          const slug = req.headers['x-tenant-slug'];
          if (slug) cls.set('tenantSlug', slug.toString());
        },
      },
      interceptor: { mount: true },
    }),
  ],
  providers: [TenantContextService],
  exports: [TenantContextService],
})
export class TenantClsModule {}
```

**File:** `libs/service-common/src/tenant-cls/tenant-context.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantClsStore } from './tenant-cls.module';

@Injectable()
export class TenantContextService {
  constructor(private readonly cls: ClsService<TenantClsStore>) {}

  getTenantSlug(): string {
    const slug = this.cls.get('tenantSlug');
    if (!slug) throw new Error('No tenant slug in CLS context');
    return slug;
  }

  getTenantSlugOrNull(): string | null {
    return this.cls.get('tenantSlug') ?? null;
  }

  setTenantSlug(slug: string): void {
    this.cls.set('tenantSlug', slug);
  }

  /**
   * Manually run a function within a tenant context (useful outside request lifecycle)
   */
  run<T>(tenantSlug: string, fn: () => T): T {
    return this.cls.run(fn, { tenantSlug });
  }
}
```

### Phase 1: Update service-common exports

**File:** `libs/service-common/src/index.ts`

```typescript
export * from './tenant-cls/tenant-cls.module';
export * from './tenant-cls/tenant-context.service';
```

### Phase 2: Update all subgraph context files

Each service's context file must inject `ClsService<TenantClsStore>`. This replaces the old `TenantContext` singleton.

**Pattern:** All 11 subgraph contexts follow this template:

```typescript
// OLD
import { TenantContext } from '@cucu/service-common';

@Injectable({ scope: Scope.REQUEST })
export class UsersContext extends BaseSubgraphContext {
  constructor(
    @Optional() @Inject(REQUEST) req?: any,
    private tenantContext?: TenantContext, // ← Old way
  ) {
    super(req, tenantContext);
  }
}

// NEW
import { ClsService, TenantClsStore } from '@cucu/service-common';

@Injectable({ scope: Scope.REQUEST })
export class UsersContext extends BaseSubgraphContext {
  constructor(
    @Optional() @Inject(REQUEST) req?: any,
    @Optional() cls?: ClsService<TenantClsStore>, // ← New way
  ) {
    super(req, cls);
  }
}
```

**Services updated:**
- `grants`, `users`, `organization`, `tenants`
- `projects`, `milestones`
- `milestone-to-user`, `milestone-to-project`
- `group-assignments`, `project-access`

All 11 context files updated in PR #323.

### Phase 3: Update BaseSubgraphContext

**File:** `libs/service-common/src/context/base-subgraph.context.ts`

```typescript
import { Inject, Injectable, Optional, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { TenantClsStore } from '../tenant-cls/tenant-cls.module';

@Injectable({ scope: Scope.REQUEST })
export class BaseSubgraphContext {
  constructor(
    @Optional() @Inject(REQUEST) req?: any,
    @Optional() private readonly cls?: ClsService<TenantClsStore>,
  ) {
    this.req = req;
  }

  protected req?: any;

  currentUserId(): string {
    const userId = this.req?.user?.sub;
    if (!userId) throw new UnauthorizedException('No user in context');
    return userId;
  }

  currentTenantSlug(): string {
    if (!this.cls) {
      throw new Error('ClsService not available');
    }
    return this.cls.get('tenantSlug') ?? 'unknown';
  }

  isInternalCall(): boolean {
    return !this.req?.user || this.req.user.sub === 'internal';
  }

  hasUserContext(): boolean {
    return !!this.req?.user;
  }
}
```

### Phase 4: Update TenantClsInterceptor

The interceptor now runs for all requests (not just specific routes) thanks to the middleware's Express-level mount.

**File:** `libs/service-common/src/interceptors/tenant-cls.interceptor.ts`

```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ClsService } from 'nestjs-cls';
import { TenantClsStore } from '../tenant-cls/tenant-cls.module';

@Injectable()
export class TenantClsInterceptor implements NestInterceptor {
  constructor(private readonly cls: ClsService<TenantClsStore>) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const type = context.getType() as string;

    // For HTTP/GraphQL, middleware already set CLS context
    if (type === 'http') {
      // Verify slug is set; fallback to header if not
      const slug = this.cls.get('tenantSlug') ?? request.headers['x-tenant-slug'];
      if (slug) this.cls.set('tenantSlug', slug.toString());
    }

    // For RPC, extract from payload
    if (type === 'rpc') {
      const data = context.switchToRpc().getData();
      if (data?._tenantSlug) {
        this.cls.set('tenantSlug', data._tenantSlug);
      }
      this.stripTenantFields(context);
    }

    return next.handle();
  }

  private stripTenantFields(context: ExecutionContext): void {
    // Remove _tenantSlug and _internalSecret from RPC payloads
    // before ValidationPipe processes them
    const data = context.switchToRpc().getData();
    delete data._tenantSlug;
    delete data._internalSecret;
  }
}
```

### Phase 5: Update service modules

Each data service imports `TenantClsModule` and `TenantDatabaseModule`:

```typescript
@Module({
  imports: [
    TenantClsModule,                                     // ← New
    TenantDatabaseModule.forService('users', { disableInterceptor: true }),
    // ... other imports
  ],
  // ...
})
export class UsersModule {}
```

The `disableInterceptor: true` prevents double registration since `createSubgraphMicroservice` already registers the interceptor globally.

## Backward Compatibility

The old `TenantContext` class is **NOT exported** anymore. Code trying to inject it will get a NestJS DI error, which is intentional — all services must be migrated.

If you have custom code depending on `TenantContext.run()`, use `TenantContextService.run()` instead:

```typescript
// OLD
this.tenantContext.run(slug, () => doSomething());

// NEW
this.tenantContextService.run(slug, () => doSomething());
```

## Checklist for New Services

When adding a new microservice, ensure tenant context is properly set up:

- [ ] Service module imports `TenantClsModule`
- [ ] Service module imports `TenantDatabaseModule.forService('serviceName')`
- [ ] Context file constructor injects `ClsService<TenantClsStore>`
- [ ] Context file extends `BaseSubgraphContext` and passes `cls` to `super()`
- [ ] All service methods access tenant via `cls.get('tenantSlug')` or `currentTenantSlug()`
- [ ] RPC handlers receive `ClsService` via constructor injection
- [ ] Global `TenantClsInterceptor` is mounted (via `createSubgraphMicroservice`)

## Testing

### Unit Tests

```typescript
describe('TenantContextService', () => {
  let service: TenantContextService;
  let cls: ClsService<TenantClsStore>;

  beforeEach(() => {
    cls = {
      get: jest.fn().mockReturnValue('acme'),
      set: jest.fn(),
      run: jest.fn((fn) => fn()),
    } as any;

    service = new TenantContextService(cls);
  });

  it('should getTenantSlug from CLS', () => {
    expect(service.getTenantSlug()).toBe('acme');
    expect(cls.get).toHaveBeenCalledWith('tenantSlug');
  });

  it('should throw if slug not in CLS', () => {
    cls.get = jest.fn().mockReturnValue(null);
    expect(() => service.getTenantSlug()).toThrow();
  });
});
```

### Integration Tests

```typescript
describe('TenantClsInterceptor (Integration)', () => {
  let app: INestApplication;
  let cls: ClsService<TenantClsStore>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [TenantClsModule],
      controllers: [TestController],
    }).compile();

    app = module.createNestApplication();
    cls = module.get(ClsService);
    await app.init();
  });

  it('should set tenant slug in CLS for HTTP requests', async () => {
    await request(app.getHttpServer())
      .get('/test')
      .set('x-tenant-slug', 'acme')
      .expect(200);

    expect(cls.get('tenantSlug')).toBe('acme');
  });
});
```

## Debugging

### Check if CLS is initialized

```bash
# In any service, add logging:
constructor(private cls: ClsService<TenantClsStore>) {
  console.log('ClsService available:', !!this.cls);
  console.log('Current tenant:', this.cls.get('tenantSlug'));
}
```

### Verify middleware order

The Express middleware stack should show `ClsMiddleware` early:

```bash
# In gateway or service main.ts:
app.getHttpServer()._events.request.listeners.forEach((listener, i) => {
  console.log(`[${i}] ${listener.name}`);
});

# Expected output:
# [0] ClsMiddleware
# [1] ... other middleware
# [N] Apollo
```

### Check RPC payload

Ensure `_tenantSlug` is being injected by `TenantAwareClientProxy`:

```typescript
// In service logs, RPC payloads should include:
console.log('RPC payload:', { ...originalPayload, _tenantSlug: 'acme' });
```

If `_tenantSlug` is missing, check:
1. Service is using `TenantAwareClientsModule` (not raw `ClientsModule`)
2. `ClsService` is injected into the client proxy
3. `INTERNAL_HEADER_SECRET` env var is set

## Performance Impact

- **Negligible**: nestjs-cls adds only a request-scoped DI lookup
- **Faster than before**: Avoids manual `TenantContext.run()` calls for RPC operations
- **CLS context copy**: Each async operation in a RPC handler gets a copy of the context (safe isolation)

## Rollback Plan

If issues arise (unlikely), reverting is straightforward:

1. Revert PR #21, #22, #323
2. Restore `TenantContext` class
3. Re-register old middleware via `MiddlewareConsumer.forRoutes()`
4. Revert context file injections to `TenantContext`

But this is **not recommended** — the new approach is architecturally superior and solves fundamental federation issues.
