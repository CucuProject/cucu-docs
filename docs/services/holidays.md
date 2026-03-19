# Holidays Service

The Holidays service manages **national holidays**, **company closures**, and **user absences**. It features a dual database architecture: a shared database for national holidays (consistent across all tenants) and tenant-specific databases for company closures and user absences.

## Overview

| Property | Value |
|----------|-------|
| Port | 3013 |
| Shared Database | `holidays` (national holidays) |
| Tenant Database | `holidays_{tenantSlug}` (closures, absences) |
| Collections | `holidaycalendars` (shared), `companyclosures`, `userabsences` (tenant) |
| Module | `HolidaysModule` |
| Context | `HolidaysContext` (request-scoped) |

## Dual Database Architecture

Unlike other services that use only tenant-isolated databases, the Holidays service operates on two database layers:

### Shared Database (`holidays`)

National holidays are the same for all tenants — storing them per-tenant would be wasteful and inconsistent. The `HolidayCalendar` collection lives in a shared database accessed via a dedicated connection provider:

```typescript
const SharedHolidaysConnectionProvider = {
  provide: 'HOLIDAYS_SHARED_CONNECTION',
  inject: [ConfigService],
  useFactory: async (configService: ConfigService) => {
    const host = configService.get<string>('HOLIDAYS_SHARED_DB_HOST') || 'holidays-shared-db';
    const dbName = 'holidays';
    const uri = `mongodb://${host}:${port}/${dbName}`;
    return mongoose.createConnection(uri).asPromise();
  },
};
```

The `HolidayCalendarService` injects this connection and registers its model on it — completely bypassing the tenant routing layer.

### Tenant Database (`holidays_{tenantSlug}`)

Company closures and user absences are tenant-specific data. These use the standard `TenantDatabaseModule.forService('holidays')` pattern, resulting in per-tenant databases like `holidays_acme`, `holidays_globex`, etc.

## Schemas

### HolidayCalendar (Shared Database)

```typescript
@ObjectType()
class Holiday {
  date: string       // ISO YYYY-MM-DD
  name: string       // e.g., "Christmas Day"
}

@ObjectType()
class HolidayCalendar {
  _id: string
  countryCode: string   // ISO 3166-1 alpha-2: "IT", "UA", "DE"
  countryName: string   // "Italia", "Ukraine", "Germany"
  year: number
  holidays: Holiday[]
}

// Unique index: { countryCode: 1, year: 1 }
```

### CompanyClosure (Tenant Database)

```typescript
@ObjectType()
class CompanyClosure {
  _id: string
  name: string          // e.g., "Summer Shutdown"
  date: string          // ISO YYYY-MM-DD
  recurring?: boolean   // If true, repeats every year (MM-DD match)
  countryCode?: string  // Optional: specific country office
  description?: string
  createdAt: Date
  updatedAt: Date
}

// Indexes: { date: 1 }, { countryCode: 1, date: 1 }
```

### UserAbsence (Tenant Database)

```typescript
enum AbsenceType {
  VACATION = 'VACATION'
  SICK_LEAVE = 'SICK_LEAVE'
  PERSONAL = 'PERSONAL'
  PARENTAL = 'PARENTAL'
  BEREAVEMENT = 'BEREAVEMENT'
  UNPAID = 'UNPAID'
  OTHER = 'OTHER'
}

@ObjectType()
class UserAbsence {
  _id: string
  userId: string        // → User._id
  startDate: string     // ISO YYYY-MM-DD
  endDate: string       // ISO YYYY-MM-DD
  type: AbsenceType
  description?: string
  createdAt: Date
  updatedAt: Date
}

// Indexes: { userId: 1, startDate: 1, endDate: 1 }, { startDate: 1, endDate: 1 }
```

## GraphQL Schema

### Holiday Calendar (Shared, Read by All)

| Operation | Type | Args | Return | Guard |
|-----------|------|------|--------|-------|
| `holidayCalendars` | Query | `countryCodes: [String]!, startYear: Int!, endYear: Int!` | `[HolidayCalendar]!` | — |
| `availableHolidayCountries` | Query | — | `[HolidayCountryOption]!` | — |
| `upsertHolidayCalendar` | Mutation | `input: UpsertHolidayCalendarInput!` | `HolidayCalendar!` | `PlatformAdminGuard` |
| `deleteHolidayCalendar` | Mutation | `input: DeleteHolidayCalendarInput!` | `Boolean!` | `PlatformAdminGuard` |
| `syncHolidayCalendars` | Mutation | — | `Boolean!` | `PlatformAdminGuard` |

**HolidayCountryOption:**
```typescript
@ObjectType()
class HolidayCountryOption {
  countryCode: string
  countryName: string
}
```

### Company Closure (Tenant)

| Operation | Type | Args | Return |
|-----------|------|------|--------|
| `companyClosures` | Query | `startDate?: String, endDate?: String` | `[CompanyClosure]!` |
| `companyClosure` | Query | `id: ID!` | `CompanyClosure!` |
| `createCompanyClosure` | Mutation | `input: CreateCompanyClosureInput!` | `CompanyClosure!` |
| `updateCompanyClosure` | Mutation | `id: ID!, input: UpdateCompanyClosureInput!` | `CompanyClosure!` |
| `deleteCompanyClosure` | Mutation | `id: ID!` | `Boolean!` |

### User Absence (Tenant)

| Operation | Type | Args | Return |
|-----------|------|------|--------|
| `userAbsences` | Query | `userId?: String, startDate?: String, endDate?: String` | `[UserAbsence]!` |
| `userAbsence` | Query | `id: ID!` | `UserAbsence!` |
| `createUserAbsence` | Mutation | `input: CreateUserAbsenceInput!` | `UserAbsence!` |
| `updateUserAbsence` | Mutation | `id: ID!, input: UpdateUserAbsenceInput!` | `UserAbsence!` |
| `deleteUserAbsence` | Mutation | `id: ID!` | `Boolean!` |

## RPC Patterns

### National Holidays (Shared)

| Pattern | Type | Input | Output | Purpose |
|---------|------|-------|--------|---------|
| `GET_HOLIDAYS` | Message | `{countryCode, year}` | `HolidayCalendar \| null` | Single country/year lookup |
| `GET_HOLIDAYS_BULK` | Message | `{countryCodes[], startYear, endYear}` | `HolidayCalendar[]` | Multi-country, year-range lookup |
| `GET_AVAILABLE_COUNTRIES` | Message | — | `{countryCode, countryName}[]` | List seeded countries |

### Company Closures (Tenant-Aware)

| Pattern | Type | Input | Output | Purpose |
|---------|------|-------|--------|---------|
| `GET_COMPANY_CLOSURES` | Message | `{startDate, endDate}` | `CompanyClosure[]` | Date range lookup |

### User Absences (Tenant-Aware)

| Pattern | Type | Input | Output | Purpose |
|---------|------|-------|--------|---------|
| `GET_USER_ABSENCES` | Message | `{userId, startDate, endDate}` | `UserAbsence[]` | User's absences in range |

### Business Days Calculator

| Pattern | Type | Input | Output | Purpose |
|---------|------|-------|--------|---------|
| `GET_BUSINESS_DAYS` | Message | `{userId?, countryCode, startDate, endDate}` | `BusinessDay[]` | Calculate business days |

**BusinessDay:**
```typescript
@ObjectType()
class BusinessDay {
  date: string        // ISO YYYY-MM-DD
  isBusinessDay: boolean
  reason?: string     // "Weekend", "Holiday: Christmas", "Company closure: Summer", "User absence: VACATION"
}
```

The `GET_BUSINESS_DAYS` RPC aggregates:
1. Weekend detection (Saturday/Sunday)
2. National holidays (from shared DB)
3. Company closures (from tenant DB, supports recurring)
4. User absences (if `userId` provided)

### Event Listeners

| Pattern | Type | Payload | Action |
|---------|------|---------|--------|
| `PERMISSIONS_CHANGED` | Event | `{groupIds}` | Invalidate permission cache |

## Platform Admin Guard

Holiday calendar mutations (upsert, delete, sync) are restricted to **platform administrators** via `PlatformAdminGuard`:

```typescript
@Mutation(() => HolidayCalendar)
@UseGuards(PlatformAdminGuard)
async upsertHolidayCalendar(@Args('input') input: UpsertHolidayCalendarInput) { ... }
```

The guard:
1. Reads `x-user-email` header (propagated by gateway from JWT)
2. Calls `CHECK_PLATFORM_ADMIN` RPC on the Tenants service
3. Throws `ForbiddenException` if user is not a platform admin

This ensures only platform-level administrators (not tenant admins) can modify national holiday data that affects all tenants.

## Module Initialization

The Holidays service seeds national holiday data on startup:

```typescript
async onModuleInit() {
  this.introspectionFields.configure({
    maxDepth: 2,
    allowedTypes: ['HolidayCalendar', 'Holiday', 'HolidayCountryOption', 'CompanyClosure', 'UserAbsence', 'AbsenceType'],
  });
  this.introspectionFields.warmUpEntities(['HolidayCalendar', 'CompanyClosure', 'UserAbsence']);

  // Seed national holidays on startup (no tenant context needed)
  await this.holidayCalendarService.seedHolidays();
}
```

The seed process uses `bulkWrite` with upserts, making it idempotent — safe to run on every startup without duplicating data.

## Module Dependencies

```typescript
@Module({
  imports: [
    TenantDatabaseModule.forService('holidays'),
    ConfigModule.forRoot({ isGlobal: true }),
    RedisClientsModule,  // GRANTS_SERVICE, TENANTS_SERVICE
    KeycloakM2MModule,
    MicroservicesOrchestratorModule,
    GraphQLModule.forRoot<ApolloFederationDriverConfig>({ ... }),
  ],
  providers: [
    SharedHolidaysConnectionProvider,
    HolidaysContext,
    HolidayCalendarService, HolidayCalendarResolver,
    CompanyClosureService, CompanyClosureResolver,
    UserAbsenceService, UserAbsenceResolver,
    PlatformAdminGuard,
    // Field-level grants
    LocalSchemaFieldsService, PermissionsCacheService, Reflector, FieldViewInterceptor,
    // Guards and interceptors
    { provide: APP_GUARD, useClass: OperationGuard },
    { provide: APP_INTERCEPTOR, useClass: createViewFieldsInterceptor([...]) },
  ],
})
```

**Key dependency:** The module registers `TENANTS_SERVICE` RPC client because `PlatformAdminGuard` needs to call `CHECK_PLATFORM_ADMIN`.
