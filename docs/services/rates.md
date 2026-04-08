# Rates Service

The rates microservice manages rate levels with a 5-level inheritance cascade. Each level can have multiple rates with validity periods (effective dating).

## Rate Cascade: `resolveRate`

The `resolveRate` function resolves the effective rate for a given context. Each level is checked only if the corresponding parameter is provided. **First match wins.**

```
1. project-user     (projectId + userId)          → most specific
2. user             (userId)
3a. seniorityLevel + jobRoleId (specific cross)
3b. seniorityLevel  (generic, no jobRoleId)
4. jobRole          (jobRoleId)
5. roleCategory     (roleCategoryId)               → least specific
```

**Temporal filter** (same for all levels):
```
validFrom <= date  AND  (validTo IS NULL OR validTo >= date)
```
`date` defaults to today.

### Example

A user with:
- seniorityLevel = "Senior" (rate: €80/day)
- jobRole = "Developer" (rate: €100/day)

Query: `resolveRate({ userId: "...", jobRoleId: "...", seniorityLevelId: "..." })`

Result: level 3a matches (seniorityLevel + jobRoleId cross) → €100/day. The jobRole rate (level 4) and seniorityLevel generic rate (level 3b) are skipped because 3a matched first.

## Rate Entity

```typescript
Rate {
  targetType: 'roleCategory' | 'jobRole' | 'seniorityLevel' | 'user' | 'project-user'
  targetId: string           // ObjectId of the target entity
  projectId?: string         // only for targetType='project-user'
  jobRoleId?: string         // only for targetType='seniorityLevel' (cross-level)
  amount: number             // Float, >= 0
  currency: string           // default 'EUR'
  validFrom: string          // ISO date YYYY-MM-DD
  validTo?: string           // null = still active (open-ended)
}
```

## RPC Patterns

| Pattern | Payload | Returns |
|---------|---------|---------|
| `RESOLVE_RATE` | `{ userId?, projectId?, jobRoleId?, seniorityLevelId?, date? }` | `{ amount, currency, source, rateId }` |
| `RESOLVE_RATES_BATCH` | `{ items: [...same as above] }` | `[{ amount, currency, source, rateId }]` |
| `GET_RATES_FOR_TARGET` | `{ targetType, targetId }` | `Rate[]` |
| `CREATE_RATE` | `{ targetType, targetId, amount, currency, validFrom, ... }` | `Rate` |

## User Integration

The users service exposes `employmentData.rates` as a `@ResolveField` that calls `RESOLVE_RATE` via RPC:

```graphql
query {
  findOneUser(userId: "...") {
    employmentData {
      rates {       # ResolvedRate type
        amount
        currency
        source      # which level resolved the rate
      }
    }
  }
}
```

The `source` field indicates which cascade level provided the rate (e.g., `"user"`, `"jobRole"`, `"seniorityLevel"`).

## Currency Conversion

The rates service includes a `CurrencyConverter` that converts rates to EUR using the Frankfurter API (ECB rates). Stored rates can be in any currency; `resolveRate` always returns amounts in the rate's original currency.

## Overlap Validation

Rates for the same target cannot have overlapping validity periods. The `CREATE_RATE` and `UPDATE_RATE` mutations validate:
```
NOT (existing.validFrom < new.validTo AND new.validFrom < existing.validTo)
```

## Settings FE Integration

The settings pages (`/setup/settings/rates`, `/setup/settings/job-roles`, `/setup/settings/seniority`) show inline rate editing with:
- `RateInline` component for single-rate display/edit
- Cascading rate display (what the rate would be for a given context)
- Inherited rate visualization with source indicator
