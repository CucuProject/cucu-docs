# AI Agents Service

AI Agents owns AI agent metadata and AI model pricing catalog/sync.

## Runtime Role

- Owns `AiAgent` and `AiModelPricing`.
- Exposes GraphQL CRUD/list for agents and model pricing.
- Syncs model pricing from OpenRouter.
- Emits resource lifecycle events so AI agents become assignable resources.
- Extends User through `supervisorUserId` federation references.

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

## Boundaries

AI Agents does not own the Resource catalog, allocation, or project economics. It feeds those services through events and pricing lookup contracts.
