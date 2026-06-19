# Resources Service

Resources is the unified catalog of assignable resources. A resource can represent a user, an AI agent, or another future assignable source.

## Runtime Role

- Owns `Resource` and capacity periods.
- Exposes GraphQL CRUD/list.
- Exposes RPC CRUD/list and source lookup.
- Consumes user and AI agent lifecycle events.
- Keeps assignable catalog state separate from allocation state.

## GraphQL Surface

- `getResources`
- `getResource`
- `createResource`
- `updateResource`
- `removeResource`

## RPC and Events

Inbound RPC:

- `CREATE_RESOURCE`
- `UPDATE_RESOURCE`
- `GET_RESOURCE`
- `GET_RESOURCE_BY_SOURCE`
- `LIST_RESOURCES`
- `DELETE_RESOURCE`
- `REMOVE_RESOURCE`

Inbound events:

- `RESOURCE_USER_UPSERT`
- `RESOURCE_USER_DELETED`
- `RESOURCE_AI_AGENT_UPSERT`
- `RESOURCE_AI_AGENT_DELETED`

## Boundaries

Resources does not own User or AiAgent source-of-truth data and does not own Milestone allocation. Milestone to Resource assigns catalog resources to milestones.
