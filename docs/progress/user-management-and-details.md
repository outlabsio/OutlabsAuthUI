# User Management And Details

This document is the restart point for the users surface. Update it whenever the user list, user details page, or supporting backend contract changes.

## Current State

Implemented on the frontend:

- Users directory route at `/app/users`
- Dedicated user details route at `/app/users/$userId`
- User profile editing
- User status updates
- Invite resend from the details page for invited users
- Admin password reset dialog
- User delete dialog with self-delete protection
- Entity membership management with lifecycle fields
- Direct role assignment
- Direct role removal
- Effective permissions view

Implemented in the backend and already used by the frontend:

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

- There is still no API to edit an existing direct role membership in place. The UI can assign and revoke direct roles, but not patch the validity window of an existing assignment.
- There is no admin session/device API yet for another user.
- There is no admin-readable audit timeline API yet for user-level events.
- API keys are only available through current-user routes, not admin-manage-any-user routes.

## Immediate Tasks

- [x] Expose direct role memberships from the backend and use them in the user details page.
- [x] Keep this document updated with the final direct-role lifecycle shape after that work lands.
- [ ] Run a true end-to-end invite flow with a real invite token path: invite user, receive email, open accept-invite link, set password, and confirm the account lands in the expected status/state.
- [ ] Recheck membership lifecycle persistence live against the restarted backend by saving `status`, `valid_from`, and `valid_until` from the UI and confirming the round-trip reads back correctly.
- [ ] If direct role windows must be editable, add a backend update route for direct role memberships before building more UI around that section.
- [ ] Decide whether the next backend slice is `sessions/devices` or `audit timeline`.

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
