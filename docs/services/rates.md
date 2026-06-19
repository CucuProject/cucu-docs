# Rates Service

Rates owns rate/cost rules, resolution, and project economics read models.

## Runtime Role

- Owns `Rate` and `Cost`.
- Resolves rates and costs by specificity and effective dates.
- Exposes project cost summary and economic snapshot views.
- Uses Milestone to Resource assignment/allocation details for project economics.
- Uses frozen snapshots when available to avoid retroactive economics drift.

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

## Boundaries

Rates does not own allocation, resource catalog, or organization lookup data. It consumes those domains for resolution and summaries.
