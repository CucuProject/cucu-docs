# AI Agents Service

AI Agents owns AI agent metadata and AI model pricing catalog/sync.

## Runtime Role

- Owns `AiAgent` and `AiModelPricing`.
- Exposes GraphQL CRUD/list for agents and model pricing.
- Syncs model pricing from OpenRouter.
- Emits resource lifecycle events so AI agents become assignable resources.
- Extends User through `supervisorUserId` federation references.
- Computes token-based hourly cost/rate from selected model pricing, expected tokens/hour, and markup.

## GraphQL Surface

AI agents:

- `getAiAgents`
- `getAiAgent`
- `createAiAgent`
- `updateAiAgent`
- `deleteAiAgent`
- `removeAiAgent`
- `supervisor`

Model pricing:

- `getAiModelPricings`
- `getAiModelPricing`
- `createAiModelPricing`
- `updateAiModelPricing`
- `syncAiModelPricingsFromOpenRouter`

## RPC and Events

Inbound RPC:

- `CREATE_AI_AGENT`
- `UPDATE_AI_AGENT`
- `GET_AI_AGENT`
- `LIST_AI_AGENTS`
- `FIND_AI_AGENTS_BY_IDS`
- `DELETE_AI_AGENT`
- `REMOVE_AI_AGENT`
- `CREATE_AI_MODEL_PRICING`
- `UPDATE_AI_MODEL_PRICING`
- `LIST_AI_MODEL_PRICINGS`
- `GET_AI_MODEL_PRICING`
- `GET_AI_MODEL_PRICING_BY_PROVIDER_MODEL`
- `SYNC_AI_MODEL_PRICINGS_FROM_OPENROUTER`

Outbound events:

- `RESOURCE_AI_AGENT_UPSERT`
- `RESOURCE_AI_AGENT_DELETED`

## Failure Modes

- Resource synchronization is event-driven. `create`, `update`, and `remove` emit `RESOURCE_AI_AGENT_*` events without waiting for Resources to persist the catalog change.
- `findAllPricings()` hydrates the OpenRouter catalog automatically when the unfiltered active catalog has fewer than 50 records. If OpenRouter fetch fails, the query fails rather than silently using stale external data in that path.
- Token-based cost fields are recalculated only when cost-mode/pricing/token/markup inputs are included in the update payload.
- Deleting an AI agent hard-deletes the agent record and emits a resource-deleted event; existing assignments/snapshots must be handled by consumers.

## Boundaries

AI Agents does not own the Resource catalog, allocation, or project economics. It feeds those services through events and pricing lookup contracts.
