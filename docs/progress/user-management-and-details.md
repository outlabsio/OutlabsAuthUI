# User Management And Details

This document is the restart point for the users surface. Update it whenever the user list, user details page, or supporting backend contract changes.

## Current State

Implemented on the frontend:

- Users directory route at `/app/users`
- Orphaned users discovery view (`view=orphaned`) via `GET /users/orphaned`
- Dedicated user details route at `/app/users/$userId`
- User profile editing
- User status updates
- Invite user (email) and admin create-user with password (`POST /users/`)
- Invite resend from the details page for invited users
- Admin password reset dialog
- User delete dialog with self-delete protection
- Entity membership management with lifecycle fields
- Direct role assignment
- Direct role removal
- Effective permissions view
- Entity-context permission check dialog (`POST /permissions/check`)

Implemented in the backend and already used by the frontend:

- `POST /v1/users/`
- `GET /v1/users/orphaned`
- `GET /v1/users/{id}`
- `PATCH /v1/users/{id}`
- `PATCH /v1/users/{id}/status`
- `PATCH /v1/users/{id}/password`
- `DELETE /v1/users/{id}`
- `POST /v1/users/{id}/resend-invite`
- `GET /v1/users/{id}/roles`
- `GET /v1/users/{id}/role-memberships`
- `POST /v1/users/{id}/roles`
- `DELETE /v1/users/{id}/roles/{role_id}`
- `GET /v1/users/{id}/permissions`
- membership lifecycle routes under `/v1/memberships/...`

Important read-model notes:

- Direct account roles on the details page now come from `GET /v1/users/{id}/role-memberships`, not the flattened `roles` list.
- `is_currently_valid` on both user-role memberships and entity memberships is time-window only.
- `can_grant_permissions` is the field that reflects whether the assignment is actually effective right now after status is considered.

## Known Gaps

- Direct role membership validity windows are editable via `PATCH /users/{id}/role-memberships/{membership_id}` and the user-details “Edit window” dialog.
- There is no admin session/device API yet for another user.
- User-level audit timeline is available via `GET /users/{id}/audit-events` and is shown on the History tab. Broader cross-user audit search is still out of scope.
- Personal API keys are self-service for create/rotate (`/api-keys`). Admins can list and revoke another user’s personal keys from user details Access (`GET/DELETE /users/{id}/api-keys...`). System/integration keys stay in the System API Keys workspace.
- Open self-registration is intentionally not part of this console; new accounts are invited or created by an admin with a password.

## Immediate Tasks

- [x] Expose direct role memberships from the backend and use them in the user details page.
- [x] Keep this document updated with the final direct-role lifecycle shape after that work lands.
- [x] Run a true end-to-end invite flow with a real invite token path: invite user, capture token via `/dev/auth/invite/latest`, open accept-invite link, set password, and land on the dashboard.
- [x] Membership lifecycle round-trip covered in entities e2e: suspend on create, reactivate with reason, set/clear `valid_until`, and confirm user-details + members-table readback.
- [x] Editable direct role membership windows (backend PATCH + user-details Edit window dialog).
- [x] Admin list/revoke of another user’s personal API keys on user details.
- [ ] Decide whether the next backend slice is `sessions/devices` or broader audit search.

## Frontend Files To Recheck First

- [`src/features/users/components/user-details-page.tsx`](../../src/features/users/components/user-details-page.tsx)
- [`src/features/users/components/direct-role-assignment-dialog.tsx`](../../src/features/users/components/direct-role-assignment-dialog.tsx)
- [`src/features/users/components/membership-access-dialog.tsx`](../../src/features/users/components/membership-access-dialog.tsx)
- [`src/features/users/api/users.query-options.ts`](../../src/features/users/api/users.query-options.ts)
- [`src/features/users/types/users.types.ts`](../../src/features/users/types/users.types.ts)

## Backend Files To Recheck First

- `/Users/macbookm3/Documents/projects/outlabsAuth/outlabs_auth/routers/users.py`
- `/Users/macbookm3/Documents/projects/outlabsAuth/outlabs_auth/services/role.py`
- `/Users/macbookm3/Documents/projects/outlabsAuth/outlabs_auth/models/sql/user_role_membership.py`
- `/Users/macbookm3/Documents/projects/outlabsAuth/outlabs_auth/routers/memberships.py`
- `/Users/macbookm3/Documents/projects/outlabsAuth/outlabs_auth/services/membership.py`
