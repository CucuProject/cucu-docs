# Agent AI Hybrid Gantt FE Audit / Implementation Map

Source: migrated from `CucuProject/cucu-frontend` PR #467  
Scope: audit only; no Gantt behavior implemented.

## Goal

Extend the project Gantt so one milestone can show both human assignees and AI agent assignees, with:

- separate human + AI agent resource rows under the same milestone;
- a supervisor badge for AI rows;
- add/edit assignment UI that can create or convert human/role/AI assignments;
- GraphQL operations/types aligned with the Agent AI backend schema;
- seed/demo validation and Playwright coverage for the hybrid Gantt path.

## Current FE shape

### Gantt rendering

- `src/components/GanttChart/types.ts`
  - `MTRSlot` is the single resource row model.
  - Resource rows are `RowItem { type: 'resource'; mtr; task; rowIndex }`.
  - There is no assignee kind discriminator yet; a row is inferred as person if `userId` exists, otherwise role/draft.
- `src/components/GanttChart/components/GanttSidebar.tsx`
  - Renders one milestone row and N resource rows.
  - Resource name/cost/actions are tied to `MTRSlot.user`, `roleCategory`, `jobRole`, `seniorityLevel`, `rate`.
  - This is the right place to add row-level AI visual treatment and supervisor badge.
- `src/components/GanttChart/components/GanttTimelineBars.tsx`
  - Resource timeline rows are generic by `mtr._id`; allocation editing already works for any `MTRSlot` if the BE exposes daily allocations.
  - No AI-specific timeline changes are required unless AI rows need read-only/default allocation rules.
- `src/components/GanttChart/hooks/useGanttTasks.ts`
  - Builds `GanttTask.mtrSlots` from `mtrByMilestone`.
  - Sorting/grouping is resource-agnostic; add AI rows by extending slot data, not by introducing a parallel row pipeline.

### Data layer and GraphQL

- `src/components/GanttDataLayer/GanttDataLayer.tsx`
  - Passes initial `milestone.users` into `useMTRData` and then to `GanttChart`.
- `src/components/GanttDataLayer/hooks/useMTRData.ts`
  - Fetches MTR slots lazily via `GET_MILESTONE_TO_RESOURCE_BY_MILESTONE` and allocations via `GET_ALLOCATIONS_BY_MTR_IDS`.
- `src/graphql/milestones.ts`
  - `GET_PROJECT_DETAIL` asks for `milestone.users` with human/role fields only.
- `src/graphql/milestone-to-resource.ts`
  - Create/update mutations accept generic input variables but selection sets return only `_id`, human/role fields and dates.
- `src/graphql/generated.ts`
  - Currently a placeholder. The project uses hand-written GraphQL constants/types; if backend schema is extended, codegen can be used but is not presently the source of truth.

### Assignment UI

- `src/components/GanttChart/components/ResourceAddPopover.tsx`
  - Mode toggle is `role | person`.
  - Person search uses `useUserSearch()` and `SEARCH_USERS_BASIC`.
  - Creation sets `userId` + `isDraft: false` for person, or role dimensions + `isDraft: true` for role.
- `src/components/GanttChart/components/ResourceEditPopover.tsx`
  - Mode toggle is also `role | person`.
  - Editing can switch role/person but only manages `userId`/`roleCategoryId`.

### Project summary / cost

- `src/graphql/rates.ts` already defines `GET_PROJECT_COST_SUMMARY`, but it is not used in `src/app/(authenticated)/projects/[id]/page.tsx`.
- Project header/details currently show planned hours/days and resource count from local Gantt callbacks.
- If AI agents have a different cost model, the project page needs a real cost summary query rather than inferring cost from visible rows.

### Playwright setup

- `playwright.config.ts` uses `testDir: './e2e'` and `baseURL: http://localhost:4000`.
- Existing E2E files are minimal and not Gantt-specific.
- There are historical `test-results/gantt-drag-*` artifacts, but no committed Gantt hybrid assignment spec.

## Required model changes

Add an explicit assignee kind to FE types instead of inferring from `userId`:

```ts
type AssignmentKind = 'ROLE' | 'HUMAN' | 'AI_AGENT';

interface MTRSlot {
  // existing fields...
  assignmentKind?: AssignmentKind;
  aiAgentId?: string;
  aiAgent?: {
    _id: string;
    name: string;
    avatarColor?: string;
    status?: string;
    supervisorUserId?: string;
    supervisor?: { _id: string; authData?: { name?: string; surname?: string; email?: string } } | null;
  } | null;
  supervisorUserId?: string;
  supervisor?: { _id: string; authData?: { name?: string; surname?: string; email?: string } } | null;
}
```

Recommendation: keep the backend field names in FE (`aiAgent`, `supervisor`) and derive UI labels with helpers (`getResourceDisplayName`, `getResourceKind`) so GanttSidebar does not accumulate more conditional rendering.

## Required GraphQL changes

Update all MTR selection sets that hydrate Gantt rows:

- `GET_PROJECT_DETAIL` in `src/graphql/milestones.ts`.
- `GET_MILESTONE_TO_RESOURCE_BY_MILESTONE` in `src/graphql/milestone-to-resource.ts`.
- `UPDATE_MILESTONE_TO_RESOURCE` response in `src/graphql/milestone-to-resource.ts`.
- `CREATE_MILESTONE_TO_RESOURCE` response if optimistic/local refresh should identify AI rows immediately.
- `GET_ALL_RESOURCE_DAILY_ALLOCATIONS` and `GET_ALLOCATED_USER_IDS_BY_PROJECT` only if allocation views/counts must include AI identity or prevent duplicate AI assignment.

Expected additional fields, subject to BE schema names:

```graphql
assignmentKind
aiAgentId
supervisorUserId
aiAgent {
  _id
  name
  avatarColor
  status
}
supervisor {
  _id
  authData { name surname email }
}
```

Add a dedicated AI search/list operation if the BE exposes agents outside `findAllUsers`, e.g.:

```graphql
query SearchAiAgents($filter: AiAgentFilterInput, $pagination: PaginationInput) {
  findAllAiAgents(filter: $filter, pagination: $pagination) {
    items { _id name avatarColor status supervisorUserId supervisor { _id authData { name surname email } } }
  }
}
```

Do not overload `SEARCH_USERS_BASIC` for agents unless the backend deliberately models agents as users.

## Required UI changes

### Resource rows

In `GanttSidebar`:

- render AI rows with a distinct icon/badge, e.g. `AI` pill before the display name;
- show supervisor badge on AI rows, preferably compact: `Supervisor: Name Surname` or `Sup. Name`;
- keep existing rate/allocation/cost popover behavior if `rate` and daily allocations are available for AI rows;
- ensure delete/edit controls use the same read-only guards as human rows.

Suggested helper locations:

- `src/components/GanttChart/resourceDisplay.ts` for pure label/kind helpers;
- tests under `src/components/GanttChart/__tests__/resourceDisplay.test.ts`.

### Add assignment popover

In `ResourceAddPopover`:

- extend mode to `role | person | aiAgent`;
- add `useAiAgentSearch()` or equivalent GraphQL hook;
- require `aiAgentId` for AI mode;
- pass `assignmentKind: 'AI_AGENT'`, `aiAgentId`, and optional `supervisorUserId` in `CreateMilestoneToResourceInput` if supported;
- keep date range/default hours behavior identical to human rows unless BE says AI capacity differs.

### Edit assignment popover

In `ResourceEditPopover`:

- detect original mode with `assignmentKind` first, then fallback to legacy fields;
- allow switching among role/person/AI only if BE update input supports clearing incompatible fields;
- clear `userId`, role dimensions, or `aiAgentId` explicitly when mode changes;
- preserve allocation diff logic unchanged.

## Project cost summary

Use `GET_PROJECT_COST_SUMMARY` from `src/graphql/rates.ts` on the project page or inside `GanttDataLayer` if cost must refresh after allocation edits.

Implementation option:

1. Query in `ProjectPage` with `projectId`.
2. Display `totalCost`/`currency` in header/details near planned hours.
3. Refetch or update after `onSavingChange` transitions from saving to idle, or expose an `onAllocationsChanged` callback from Gantt mutations.

Reason: local FE only knows hours reliably; cost resolution belongs to the backend because rates can be inherited/matrix-based and AI agents may have their own rate source.

## Seed/demo validation

Before FE implementation is considered complete, validate demo data has:

- one project with at least one milestone containing both a human MTR and an AI-agent MTR;
- AI MTR includes `aiAgentId`/`aiAgent` and supervisor data;
- both rows have allocations in the milestone date range;
- `projectCostSummary(projectId)` includes human + AI costs;
- archived/viewer permission states still make both human and AI rows read-only.

Suggested validation query set:

- `findOneProject(projectId)` → inspect `milestones[].milestone.users[]`;
- `findMilestoneToResourceByMilestoneId(milestoneId)` → verify lazy expansion parity;
- `findAllocationsByMTRIds(mtrIds)` → verify row cells render;
- `projectCostSummary(projectId)` → verify cost total.

## Required tests

### Unit/component tests

- `GanttSidebar` renders:
  - human row label unchanged;
  - role/draft row label unchanged;
  - AI row with AI badge and supervisor badge;
  - AI row action buttons obey `isReadOnly`.
- `ResourceAddPopover`:
  - AI mode searches/selects agent;
  - create mutation variables include AI fields and no human/role leftovers;
  - allocation ops are still generated for selected date range.
- `ResourceEditPopover`:
  - loads AI assignment mode from existing slot;
  - switching AI → human/role clears AI fields;
  - switching human/role → AI clears incompatible fields.

### Playwright E2E

Create `e2e/gantt-hybrid-agent.spec.ts` once seeded data exists:

1. Login/open seeded hybrid project.
2. Expand milestone.
3. Assert one human resource row and one AI row are visible.
4. Assert AI row shows supervisor badge.
5. Open add resource popover, switch to AI Agent, search/select an agent, set period/hours, save.
6. Assert new AI row appears and allocation cells are visible.
7. Reload page and assert rows persist from GraphQL.
8. Assert project cost summary is visible/non-zero if cost summary UI is added.

Add stable selectors while implementing UI (`data-testid="gantt-resource-row"`, `data-assignment-kind`, `data-testid="ai-supervisor-badge"`) to avoid brittle class/text selectors.

## Risks / open questions

- Backend schema names for AI fields are not yet visible in this FE branch; confirm exact GraphQL fields before implementation.
- If AI agents are not `User` records, do not reuse person search. Add a dedicated operation and hook.
- Existing `MTRSlot.isDraft` currently means role/unassigned. AI rows need `assignmentKind`; otherwise AI without `userId` could be misrendered as draft role.
- Cost summary is defined but unused; decide whether the hybrid Gantt feature owns adding visible cost or only preserving backend summary compatibility.
- `src/graphql/generated.ts` is a placeholder. If codegen becomes required, wire generated types consistently rather than mixing generated and hand-written partials.
