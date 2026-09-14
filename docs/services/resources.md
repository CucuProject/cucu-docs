# Resources Service

Resources is the unified catalog of assignable resources. A resource can represent a user, an AI agent, or another future assignable source.

## Runtime Role

- Owns `Resource` and capacity periods.
- Exposes GraphQL CRUD/list.
- Exposes RPC CRUD/list and source lookup.
- Consumes user and AI agent lifecycle events.
- Keeps assignable catalog state separate from allocation state.
- Stores source snapshots from Users/AI Agents and normalizes capacity from the latest received event payload.

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

## Failure Modes

- Resources is event-fed from Users and AI Agents. If a lifecycle event is missed, the catalog can be stale until bootstrap/backfill or another update event arrives.
- Delete events deactivate resources by `(type, sourceId)`; they do not hard-delete catalog records.
- `upsertUser()` trusts the payload snapshot it receives. Capacity periods and daily capacity are only as fresh as the last Users event.
- `sourceSnapshot` is JSON best effort. If parsing fails later, normalized capacity falls back to stored resource fields or empty capacity periods.

## Boundaries

Resources does not own User or AiAgent source-of-truth data and does not own Milestone allocation. Milestone to Resource assigns catalog resources to milestones.
