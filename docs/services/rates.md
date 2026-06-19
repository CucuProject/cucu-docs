# Rates Service

Rates owns rate/cost rules, resolution, and project economics read models.

## Runtime Role

- Owns `Rate` and `Cost`.
- Resolves rates and costs by specificity and effective dates.
- Exposes project cost summary and economic snapshot views.
- Uses Milestone to Resource assignment/allocation details for project economics.
- Uses frozen snapshots when available to avoid retroactive economics drift.
- Uses external Frankfurter exchange rates with a 4-hour in-process cache for currency conversion.

## GraphQL Surface

Rates:

- `getRates`
- `getRatesForScope`
- `getRate`
- `resolveRate`
- `resolveMatrixRate`
- `projectCostSummary`
- `projectEconomicSnapshot`
- `createRate`
- `updateRate`
- `deleteRate`

Costs:

- `getCosts`
- `getCostsForScope`
- `getCost`
- `resolveCost`
- `createCost`
- `updateCost`
- `deleteCost`

## RPC and Events

Inbound RPC:

- `CREATE_RATE`
- `RESOLVE_RATE`
- `RESOLVE_RATES_BATCH`
- `GET_RATES_FOR_TARGET`
- `CREATE_COST`
- `RESOLVE_COST`
- `RESOLVE_COSTS_BATCH`
- `GET_COSTS_FOR_TARGET`

Inbound events:

- `PERMISSIONS_CHANGED`

## Access Rules

Rates/costs are economics-sensitive. Keep operation and field grants explicit. Do not expose commercial or cost data through unrelated service surfaces.

## Failure Modes

- `projectCostSummary` returns an empty zero-valued summary when Milestone to Resource assignment/allocation lookups fail or when live rate/cost resolution throws.
- Once any allocation has `FROZEN` or `INCOMPLETE` economic snapshot state, summary calculation uses persisted snapshot values instead of live rate/cost rules for consistency.
- Missing rate or cost values contribute zero revenue/cost in summaries and snapshots.
- Exchange-rate fetch failures are logged and use `1.0` for that currency pair inside project summary/snapshot reads.
- Tenant default currency falls back to `EUR` if Tenants cannot resolve it.
- AI agents do not fall through to human organization matrix rates/costs. They require project-agent/agent overrides or snapshot/catalog values.

## Boundaries

Rates does not own allocation, resource catalog, or organization lookup data. It consumes those domains for resolution and summaries.
