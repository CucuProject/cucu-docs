# Project Sharing

This guide explains how to share projects, revoke access, and transfer ownership using the Share UI and the underlying APIs.

## Who Can Share

Not every user can share a project. The ability to share is determined by your effective access level:

| Your role | Can share? | Can transfer ownership? |
|-----------|-----------|------------------------|
| Owner | ✅ | ❌ |
| `collaborator` | ✅ | ❌ |
| `editor` | ❌ | ❌ |
| `viewer` | ❌ | ❌ |
| Supervisor of owner | ✅ | ✅ |
| SUPERADMIN | ✅ | ✅ |

> **Key rule:** Only supervisors (in the owner's chain) and SUPERADMINs can transfer ownership. The owner themselves cannot initiate a transfer.

## Sharing a Project

### From the UI

1. Open the project
2. Click the **Share** button
3. In the share modal, select a user and assign a role (`viewer`, `editor`, or `collaborator`)
4. Confirm — the user immediately gains access

### What Happens Behind the Scenes

```
shareProject(input: ShareProjectInput!)
  → assertCanShare(caller, project)
  → upsert ProjectAccess record { projectId, userId, role }
```

If the target user already has an explicit access record, it is updated to the new role. If not, a new record is created.

### Available Roles

| Role | What the recipient can do |
|------|--------------------------|
| `viewer` | View the project and its data |
| `editor` | View + edit the project |
| `collaborator` | View + edit + share with others |

> You cannot assign `owner` via sharing — ownership is set at creation or via transfer.

## Revoking Access

### From the UI

1. Open the Share modal
2. Find the user in the list
3. Click the **Revoke** button next to their name
4. The user's explicit access is removed immediately

### Rules

- You **cannot revoke the owner's record** — use Transfer Ownership instead
- Revoking explicit access does **not** remove implicit access: if the user is allocated to a milestone (M2U) in the project, they retain `viewer` access. The M2U allocation must be removed separately.
- Caller must be the owner, `collaborator`, supervisor of the owner, or SUPERADMIN

```
revokeAccess(input: RevokeAccessInput!)
  → assertCanShare(caller, project)
  → assert target is NOT the owner
  → delete ProjectAccess record
```

## Transferring Ownership

### From the UI

1. Open the Share modal
2. On the owner's row, click **Transfer Ownership**
3. An inline sub-form appears with a dropdown of non-owner users
4. Select the new owner and click **Confirm** (or **Cancel** to abort)
5. A success/error toast is shown

### What Happens

```
transferOwnership(input: TransferOwnershipInput!)
  → assertCanTransferOwnership(caller, project)
  → previous owner's record → COLLABORATOR
  → new owner's record → OWNER
  → emit UPDATE_PROJECT_CREATED_BY to Projects service
```

The previous owner is downgraded to `collaborator` (not `editor`) so they retain the ability to share the project with others.

### Who Can Transfer

Only two types of users can transfer ownership:

1. **Supervisor chain** — any direct or indirect supervisor of the current owner
2. **SUPERADMIN** — members of the SUPERADMIN group

The owner themselves cannot transfer ownership.

## Access Resolution Flow

When the system checks a user's access to a project, it evaluates all sources and returns the **highest** level:

```
┌──────────────────────────┐
│ GET_PROJECT_ACCESS_LEVEL │
├──────────────────────────┤
│ 1. Explicit DB record    │ → role as stored (owner/collaborator/editor/viewer)
│ 2. Supervisor chain      │ → editor (+ share/transfer capabilities)
│ 3. M2U implicit          │ → viewer
│ 4. SUPERADMIN group      │ → unrestricted
├──────────────────────────┤
│ Return: max(all matches) │
└──────────────────────────┘
```

> **Example:** A user with an explicit `viewer` record who is also a supervisor of the owner will have effective level `editor`.

## Common Scenarios

### "I shared a project but the user can't edit"

Check the role you assigned. `viewer` grants read-only access. Change the share to `editor` or `collaborator`.

### "I revoked access but the user can still see the project"

The user likely has implicit access via M2U — they are allocated to a milestone in the project. Remove the M2U allocation to fully revoke access.

### "I want to transfer ownership but the button is disabled"

Only supervisors of the current owner and SUPERADMINs can transfer. If you are the owner or an `collaborator`, you cannot transfer — ask a supervisor.

### "The previous owner lost share capability after transfer"

This should not happen — the previous owner is downgraded to `collaborator`, which retains share capability. If they were downgraded to `editor`, this is a bug.
