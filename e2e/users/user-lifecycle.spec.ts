import { backendConfigured, expect, expectSeeded, personaState, test } from '../support/fixtures'
import type { ApiUser } from '../support/api-client'
import { captureAvailable } from '../support/capabilities'
import { captureInviteToken } from '../support/passwordless-capture'
import { openUserAction, userActionsButton } from '../support/users'

// User lifecycle actions on the detail (WP-12: F-207, F-175, F-128, F-015's invited part): resend
// invite and restore ask first and say what they do, the superuser change records a reason,
// Delete is the menu's last item. Arranged through the API as the admin persona (no password
// login), acted through the UI, verified through the API.

type AuditPage = { items: Array<{ event_type: string, reason?: string | null }> }

test.describe('user lifecycle actions', () => {
  test.skip(!backendConfigured, 'Needs the backend + seeded admin (E2E_API_BASE_URL).')
  test.use({ errorGuardMode: 'strict' })

  test('an invited account offers Resend invite, not Change status or Reset password, and the resend asks first', async ({ page, api, requires, testData }) => {
    // Both presets: only the regenerated-token check at the end reads the dev invite capture.
    await requires({ features: ['invitations'] })
    const capture = await captureAvailable('invite')
    const email = testData.email('lifecycle-invite')
    await api.post('/auth/invite', { email })
    const invited = await api.findUserByEmail(email)
    expect(invited, 'invited user').toBeTruthy()
    const firstToken = capture ? await captureInviteToken(email) : null

    await page.goto(`/app/users/${invited!.id}`)
    await expect(page.getByTestId('user-state-notice')).toContainText('Invitation pending')
    // The notice names Resend invite because this admin is offered it (v-users-04).
    await expect(page.getByTestId('user-state-notice')).toContainText('Resend invite sends a new link.')
    await userActionsButton(page).click()
    const menu = page.getByRole('menu')
    await expect(menu.getByRole('menuitem', { name: 'Resend invite' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Change status' })).toHaveCount(0)
    await expect(menu.getByRole('menuitem', { name: 'Reset password' })).toHaveCount(0)
    await menu.getByRole('menuitem', { name: 'Resend invite' }).click()

    const confirm = page.getByRole('dialog', { name: `Resend invitation to ${email}` })
    await expect(confirm.getByTestId('confirm-effects')).toContainText('The link sent before stops working')
    const resend = page.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith(`/users/${invited!.id}/resend-invite`))
    await confirm.getByRole('button', { name: 'Resend invitation' }).click()
    expect((await resend).status(), 'POST /users/{id}/resend-invite').toBeLessThan(300)
    await expect(confirm).toBeHidden()
    await expect(page.getByText('Invitation resent', { exact: true })).toBeVisible()
    // The backend regenerated the token: where the dev capture is mounted, it holds a new one.
    if (capture) await expect.poll(() => captureInviteToken(email)).not.toBe(firstToken)
  })

  test('restore asks first, says access stays revoked, and brings the identity back', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'lifecycle-restore' })
    await api.delete(`/users/${user.id}`)

    await page.goto(`/app/users/${user.id}`)
    await expect(page.getByTestId('user-state-notice')).toContainText('Deleted account')
    // A deleted account is not edited: no Edit button.
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
    await openUserAction(page, 'Restore user')
    const confirm = page.getByRole('dialog', { name: `Restore user ${user.email}` })
    await expect(confirm.getByTestId('confirm-effects')).toContainText('stay revoked')
    await confirm.getByRole('button', { name: 'Restore user' }).click()
    await expect(page.getByText('User restored', { exact: true })).toBeVisible()
    await expect.poll(async () => (await api.get<ApiUser>(`/users/${user.id}`)).status).toBe('active')
    await userActionsButton(page).click()
    await expect(page.getByRole('menuitem', { name: 'Restore user' })).toHaveCount(0)
    await page.keyboard.press('Escape')
  })

  test('granting superuser needs a reason and the typed email; both changes are audited (F-175)', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'lifecycle-su' })
    expect(user.is_superuser).toBe(false)

    await page.goto(`/app/users/${user.id}`)
    await openUserAction(page, 'Grant superuser')
    const grant = page.getByRole('dialog', { name: `Grant superuser to ${user.email}` })
    await expect(grant.getByTestId('confirm-effects')).toContainText('Every permission check is bypassed')
    const confirmGrant = grant.getByRole('button', { name: 'Grant superuser' })
    await expect(confirmGrant).toBeDisabled()
    await grant.getByLabel(`Type ${user.email} to confirm`).fill(user.email)
    // The reason is required for a grant: the field says so instead of sending it.
    await confirmGrant.click()
    await expect(grant.getByText('A reason is required.')).toBeVisible()
    await grant.getByLabel('Reason').fill('Covers the on-call rotation')
    await confirmGrant.click()
    await expect(grant).toBeHidden()
    await expect(page.getByText('Superuser granted', { exact: true })).toBeVisible()
    await expect.poll(async () => (await api.get<ApiUser>(`/users/${user.id}`)).is_superuser).toBe(true)
    const granted = await api.get<AuditPage>(`/users/${user.id}/audit-events`, { query: { category: 'privilege' } })
    expect(granted.items.find(event => event.event_type === 'user.superuser_granted')?.reason).toBe('Covers the on-call rotation')

    // Revoke: the reason is optional.
    await openUserAction(page, 'Revoke superuser')
    const revoke = page.getByRole('dialog', { name: `Revoke superuser from ${user.email}` })
    await revoke.getByRole('button', { name: 'Revoke superuser' }).click()
    await expect(page.getByText('Superuser revoked', { exact: true })).toBeVisible()
    await expect.poll(async () => (await api.get<ApiUser>(`/users/${user.id}`)).is_superuser).toBe(false)
  })

  test('Delete is the menu\'s last item, takes the typed email, and leaves a restorable account (F-128)', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'lifecycle-delete' })
    await page.goto(`/app/users/${user.id}`)
    await userActionsButton(page).click()
    const items = page.getByRole('menu').getByRole('menuitem')
    await expect(items.last()).toHaveText('Delete user')
    await items.last().click()

    const confirm = page.getByRole('dialog', { name: `Delete user ${user.email}` })
    const remove = confirm.getByRole('button', { name: 'Delete user' })
    await expect(remove).toBeDisabled()
    await confirm.getByLabel(`Type ${user.email} to confirm`).fill(user.email)
    await remove.click()
    await expect(page.getByText('User deleted', { exact: true })).toBeVisible()
    await expect.poll(async () => (await api.get<ApiUser>(`/users/${user.id}`)).status).toBe('deleted')
    // The page stays on the record, now deleted, and offers Restore only.
    await expect(page.getByTestId('user-status')).toHaveText('Deleted')
    await userActionsButton(page).click()
    await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText(['Restore user'])
    await page.keyboard.press('Escape')
  })
})

// The invited notice names Resend invite only where the admin is offered it: user:update and the
// invitations feature (v-users-04). The read-only auditor (EnterpriseRBAC seed) has user:read
// only; an account of its organization is answered as invited.
test.describe('user lifecycle: read-only auditor', () => {
  test.skip(!backendConfigured, 'Needs the backend + seeded admin (E2E_API_BASE_URL).')
  test.use({ errorGuardMode: 'strict', storageState: personaState('auditor') })

  test('an invited account\'s notice does not point to an action the admin lacks', async ({ page, api, requires }) => {
    await requires({ personas: ['auditor'], features: ['invitations'] })
    const agent = await api.findUserByEmail('agent@sf.acme.com')
    expectSeeded(agent, 'the agent of the first organization')
    await page.route(url => url.pathname.endsWith(`/users/${agent!.id}`) && !url.pathname.startsWith('/app/'), async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      const response = await route.fetch()
      return route.fulfill({ response, json: { ...(await response.json() as object), status: 'invited' } })
    })
    await page.goto(`/app/users/${agent!.id}`)
    const notice = page.getByTestId('user-state-notice')
    await expect(notice).toContainText('The account has no password until the invitation is accepted.')
    await expect(notice).not.toContainText('Resend invite')
  })
})
