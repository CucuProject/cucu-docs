# Roadmaps Service

Roadmaps owns Roadmap, Release, and ReleaseToProject commitments. It governs macro delivery sequence and release commitment, not Project execution details.

## Runtime Role

- Owns `Roadmap`, `Release`, and `ReleaseToProject`.
- Exposes roadmap CRUD/archive.
- Exposes release CRUD/delete/reorder.
- Exposes release-project commitment add/remove/move/copy/reorder.
- Derives `Roadmap.projects` and `Roadmap.releaseToProjects` from visible release commitments.
- Distinguishes target windows from commitment windows.

## GraphQL Surface

- Roadmap: `findAllRoadmaps`, `findOneRoadmap`, `createRoadmap`, `updateRoadmap`, `archiveRoadmap`.
- Release: `findOneRelease`, `createRelease`, `updateRelease`, `deleteRelease`, `reorderReleases`.
- ReleaseToProject: `addProjectToRelease`, `removeProjectFromRelease`, `moveProjectBetweenReleases`, `copyProjectToRelease`, `reorderReleaseProjects`.
- Derived fields: releases, releaseToProjects, projects, target/commitment dates, slipping, counts.

## RPC and Events

Inbound RPC:

- `ROADMAP_EXISTS`
- `RELEASE_EXISTS`
- `CREATE_ROADMAP`
- `FIND_ONE_ROADMAP`
- `FIND_ROADMAPS`
- `UPDATE_ROADMAP`
- `ARCHIVE_ROADMAP`
- `CREATE_RELEASE`
- `FIND_ONE_RELEASE`
- `FIND_RELEASES_BY_ROADMAP_ID`
- `UPDATE_RELEASE`
- `DELETE_RELEASE`
- `REORDER_RELEASES`
- `ADD_PROJECT_TO_RELEASE`
- `FIND_RELEASE_PROJECTS`

Inbound events:

- `PERMISSIONS_CHANGED`

## Access Rules

- Roadmap/Release writes are owner-only.
- Reads are owner or derived from at least one visible project commitment.
- Metadata must fail closed if ProjectAccess cannot verify project visibility.
- Internal calls without user context bypass object-access filtering; user-context calls remain filtered.

## Failure Modes

- `getAccessibleProjectSnapshot()` returns an empty restricted set when ProjectAccess fails, so non-owner reads lose derived visibility instead of leaking Roadmaps/Releases.
- Roadmap and Release writes do not currently use a generic sharing model. Owner-only write semantics are code-current, not just product policy.
- Release/project reorders are `Promise.all` updates across multiple rows, not a single multi-document transaction.

## Commercial Boundary

CUC-12 defines the future Engagement primary delivery scope contract (`ROADMAP | RELEASE | PROJECT`) but does not move Engagement ownership into Roadmaps. `customerName` and `accountId` are legacy placeholders.
