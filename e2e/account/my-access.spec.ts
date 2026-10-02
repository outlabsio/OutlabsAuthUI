import { backendConfigured, expect, persona, test } from '../support/fixtures'
import { isEnterpriseBackend } from '../support/capabilities'
import { personaState } from '../support/personas'
import { openUserMenu } from '../support/shell'

// Account › Access (F-103): what the signed-in account may do, for every persona — a
// low-privilege one included, which can read nothing else about itself. And the user menu's
// cue for who is signed in: the organization a delegated admin administers, and superusers.

test.describe('my access', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.use({ errorGuardMode: 'strict' })

  test.describe('as the low-privilege persona', () => {
    test.use({ storageState: personaState('agent') })

    test('lists its effective permissions and memberships without admin reads', async ({ page, apiAs }) => {
      const agent = apiAs('agent')
      const permissions = await agent.get<string[]>('/permissions/me')
      expect(permissions.length).toBeGreaterThan(0)

      await page.goto('/app/account/access')
      const card = page.getByRole('heading', { name: 'Permissions' }).locator('xpath=ancestor::*[@data-slot="root"][1]')
      await expect(card).toBeVisible()
      const resource = permissions[0]!.split(':')[0]!.replace(/[_-]/g, ' ')
      await expect(card.getByText(resource, { exact: true }).first()).toBeVisible()
      await expect(card.getByText('No permissions')).toHaveCount(0)

      if (await isEnterpriseBackend()) {
        const memberships = await agent.get<unknown[]>('/memberships/me')
        await expect(page.getByRole('heading', { name: 'Memberships' })).toBeVisible()
        await expect(page.getByTestId('my-membership')).toHaveCount(memberships.length)
        // The Organization card speaks to the account itself: its organization (or none) and
        // the memberships in force, never an admin's note about roles it cannot read.
        const me = await agent.get<{ root_entity_name?: string | null }>('/users/me')
        const all = await agent.get<{ is_currently_valid: boolean }[]>('/memberships/me?include_inactive=true')
        const inForce = all.filter(membership => membership.is_currently_valid).length
        const scope = page.getByTestId('account-access-scope')
        await expect(scope).toContainText(me.root_entity_name || 'No organization')
        await expect(scope).toContainText(me.root_entity_name ? 'Your organization.' : 'You are not placed in an organization.')
        await expect(scope).toContainText(inForce === 0
          ? 'You have no memberships in force.'
          : `You are a member of ${inForce} ${inForce === 1 ? 'entity' : 'entities'}.`)
        await expect(scope).not.toContainText(/root organization|system-wide/i)
      } else {
        await expect(page.getByRole('heading', { name: 'Memberships' })).toHaveCount(0)
      }
    })
  })

  test.describe('as the delegated organization admin', () => {
    test.use({ storageState: personaState('orgAdmin') })

    test('the user menu names the organization it administers', async ({ page, apiAs }) => {
      test.skip(!persona('orgAdmin').available, 'The preset seeds no delegated organization admin.')
      const me = await apiAs('orgAdmin').get<{ root_entity_name?: string | null }>('/users/me')
      test.skip(!me.root_entity_name, 'The persona has no root organization.')
      await page.goto('/app/dashboard')
      const menu = await openUserMenu(page)
      await expect(menu.getByText(me.root_entity_name!, { exact: true })).toBeVisible()
      await expect(menu.getByText('Superuser', { exact: true })).toHaveCount(0)
    })
  })

  test('the user menu marks a superuser', async ({ page }) => {
    await page.goto('/app/dashboard')
    const menu = await openUserMenu(page)
    await expect(menu.getByText('Superuser', { exact: true })).toBeVisible()
  })
})
