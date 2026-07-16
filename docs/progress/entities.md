# Entities Workspace

Restart point for the entity hierarchy surface.

## Implemented

- Hierarchy navigator with root scope switching (superuser) and locked scope (root-scoped admins)
- Create root / create child with type and class constraints from parent governance + settings
- Edit entity details and root governance
- Move non-root entities to a new parent in the current scope (`POST /entities/{id}/move`)
- Archive entities via `DELETE /entities/{id}` (backend soft-archives to `archived`, with required cascade when active children exist)
- Members, invite, membership lifecycle (via shared membership dialogs)
- Create/edit entity-scoped roles from entity context

## Known gaps

- Promote-to-root (`new_parent_id: null`) is not exposed in the move dialog
- No dedicated entity audit timeline
- Admin create-user with password remains invite-only from this console

## Backend contracts used

- `GET/POST /entities`
- `GET/PATCH/DELETE /entities/{id}`
- `POST /entities/{id}/move`
- `GET /entities/{id}/path`
- `GET /entities/{id}/descendants`
- `GET /entities/type-suggestions`
- Membership and role routes used from entity context

## Frontend files

- [`src/features/entities/components/entities-page.tsx`](../../src/features/entities/components/entities-page.tsx)
- [`src/features/entities/components/delete-entity-dialog.tsx`](../../src/features/entities/components/delete-entity-dialog.tsx)
- [`src/features/entities/components/move-entity-dialog.tsx`](../../src/features/entities/components/move-entity-dialog.tsx)
