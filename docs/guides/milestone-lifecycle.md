# Milestone Lifecycle

This guide explains the lifecycle of a milestone from creation to completion, including how dates, locking, and project status interact.

## Creation (via Project Wizard)

When creating a project through the wizard:

1. User selects a project template (e.g., "Standard Web Application")
2. Template phases become milestones, each with:
   - `plannedStartDate` / `plannedEndDate` on the Milestone (baseline)
   - `startDate` / `endDate` on the MilestoneToProject record (operative)
3. Dates are distributed proportionally based on template phase percentages
4. All dates are adjusted to **working days** — no milestone starts or ends on a weekend or public holiday

## Date Model

```
┌─────────────────────────────┐     ┌───────────────────────────────────┐
│ Milestone                   │     │ MilestoneToProject (M2P)          │
│ ─────────                   │     │ ─────────────────────             │
│ plannedStartDate (baseline) │◄───►│ startDate (operative/actual)      │
│ plannedEndDate   (baseline) │     │ endDate   (operative/actual)      │
└─────────────────────────────┘     └───────────────────────────────────┘
         │                                        │
         │  Frozen when project                   │  Changes via Gantt
         │  becomes ACTIVE                        │  drag/resize
         ▼                                        ▼
    Read-only baseline                    Living schedule
```

## Project Status Transitions

| From | To | Effect on Milestones |
|------|-----|---------------------|
| DRAFT → ACTIVE | Planned dates freeze | Only M2P dates editable |
| ACTIVE → ARCHIVED | Planned dates remain frozen | Full read-only state |

## Locking

Milestones can be individually locked (`isLocked: true`) regardless of project status:

- **Locked:** No modifications allowed (name, dates, resources, color, status). Only the lock itself can be toggled. Not draggable/resizable in Gantt.
- **Unlocked:** Normal editing rules apply (subject to project status for planned dates).

UI shows locked milestones with a 🔒 icon. Edit and delete controls are visible but disabled.

## Communication Architecture

Milestones service follows strict dependency rules:

```
Milestones ──► MilestoneToProject ──► Projects
   (M2U)            (M2P)              (Projects)
```

- **Milestones knows about:** M2U (resources), M2P (project assignments)
- **Milestones does NOT know about:** Projects directly
- **M2P is the intermediary:** When milestones needs project info (e.g., status for freeze guard), it asks M2P, which in turn asks Projects

## Permissions

All groups can delete milestones (`removeMilestone: execute: true`). The lock mechanism provides fine-grained control per milestone.

| Operation | SUPERADMIN | TOP_MANAGER | PROJECT_MANAGER | CONSULTANT | ADMIN |
|-----------|-----------|-------------|-----------------|------------|-------|
| Create | ✅ | ✅ | ✅ | ❌ | ✅ |
| Update | ✅ | ✅ | ✅ | ❌ | ✅ |
| Delete | ✅ | ✅ | ✅ | ✅ | ✅ |
| Lock/Unlock | ✅ | ✅ | ✅ | ❌ | ✅ |
