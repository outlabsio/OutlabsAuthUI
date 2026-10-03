import type { Request } from '@playwright/test'
import { backendConfigured, expect, test } from '../support/fixtures'
import type { ApiEntity } from '../support/api-client'
import { backendHasSurface, isEnterpriseBackend, withPasswordPolicy } from '../support/capabilities'
import { pickEntity } from '../support/entities'
import { openUserAction } from '../support/users'

// The users area's dialogs, as an admin meets them: where the focus lands, what they say about
// passwords and superusers on each preset, and what Invite does with the chosen roles when the
// entity changes (the 2026-10-02 follow-ups v-users-03, v-users-07, v-users-08 and v-users-10).

test.describe('user dialogs', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.use({ errorGuardMode: 'strict' })

  test('Add user opens on Email; its superuser switch names organizations only where they exist', async ({ page }) => {
    await page.goto('/app/users')
    await page.getByRole('button', { name: 'Add user' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add user' })
    // Typing is the next step, as in Invite (v-users-08).
    await expect(dialog.getByLabel('Email')).toBeFocused()
    // F-008: SimpleRBAC has no organizations, so its copy names none (v-users-03).
    if (await isEnterpriseBackend()) {
      await expect(dialog.getByText('Bypasses every permission check across every organization. Grant only to platform operators.', { exact: true })).toBeVisible()
    } else {
      await expect(dialog.getByText('Bypasses every permission check. Grant only to platform operators.', { exact: true })).toBeVisible()
      await expect(dialog.getByText(/organization/i)).toHaveCount(0)
    }
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })

  test('Reset password opens on New password and states the password rules up front', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'dialog-reset' })
    await page.goto(`/app/users/${user.id}`)
    await openUserAction(page, 'Reset password')
    const dialog = page.getByRole('dialog', { name: `Reset password of ${user.email}` })
    await expect(dialog.getByLabel('New password', { exact: true })).toBeFocused()
    // As Add user does, instead of only after a refused submit (v-users-07).
    await expect(dialog.getByText(/^At least 8 characters, with an uppercase/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })

  // The passwords an admin sets follow the backend's published policy, stated under the field
  // (F-097): a served 12-character policy without the symbol rule. Nothing is sent.
  test('Add user and Reset password follow the served password policy', async ({ page, api }) => {
    await withPasswordPolicy(page, { min_length: 12, require_special_char: false })
    const writes: Request[] = []
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname
      if ((request.method() === 'POST' && path.endsWith('/users/')) || (request.method() === 'PATCH' && path.endsWith('/password'))) writes.push(request)
    })
    const rules = 'At least 12 characters, with an uppercase and a lowercase letter and a digit.'

    await page.goto('/app/users')
    await page.getByRole('button', { name: 'Add user' }).click()
    const create = page.getByRole('dialog', { name: 'Add user' })
    await expect(create.getByText(rules, { exact: true })).toBeVisible()
    await create.getByLabel('Email').fill('policy-check@example.com')
    await create.getByLabel('Initial password').fill('Abcdefghij1')
    await create.getByLabel('Confirm password').fill('Abcdefghij1')
    await create.getByRole('button', { name: 'Create user' }).click()
    await expect(create.getByText('Password must be at least 12 characters.')).toBeVisible()
    // Twelve characters without a symbol meet this policy: the message goes as it is typed.
    await create.getByLabel('Initial password').fill('Abcdefghij12')
    await expect(create.getByText('Password must be at least 12 characters.')).toHaveCount(0)
    await create.getByRole('button', { name: 'Cancel' }).click()
    await page.getByRole('dialog', { name: 'Discard changes?' }).getByRole('button', { name: 'Discard changes' }).click()
    await expect(create).toBeHidden()

    const user = await api.createUser({ kind: 'dialog-policy' })
    await page.goto(`/app/users/${user.id}`)
    await openUserAction(page, 'Reset password')
    const reset = page.getByRole('dialog', { name: `Reset password of ${user.email}` })
    await expect(reset.getByText(rules, { exact: true })).toBeVisible()
    await reset.getByLabel('New password', { exact: true }).fill('Abcdefghij1')
    await reset.getByLabel('Confirm password', { exact: true }).fill('Abcdefghij1')
    await reset.getByRole('button', { name: 'Reset password' }).click()
    await expect(reset.getByText('Password must be at least 12 characters.')).toBeVisible()
    await reset.getByLabel('New password', { exact: true }).fill('Abcdefghij12')
    await expect(reset.getByText('Password must be at least 12 characters.')).toHaveCount(0)
    expect(writes, 'nothing is sent').toHaveLength(0)
  })

  test('the superuser grant names organizations only on EnterpriseRBAC', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'dialog-su' })
    await page.goto(`/app/users/${user.id}`)
    await openUserAction(page, 'Grant superuser')
    const effects = page.getByRole('dialog', { name: `Grant superuser to ${user.email}` }).getByTestId('confirm-effects')
    if (await isEnterpriseBackend()) await expect(effects).toContainText('Every permission check is bypassed for them, in every organization.')
    else await expect(effects).not.toContainText(/organization|workspace/)
  })

  test('a deleted account\'s notices name memberships only where they exist', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'dialog-deleted' })
    await api.delete(`/users/${user.id}`)
    const memberships = await isEnterpriseBackend() && await backendHasSurface('memberships')
    await page.goto(`/app/users/${user.id}`)
    await expect(page.getByTestId('user-state-notice')).toContainText(memberships
      ? 'Its roles, memberships, sessions and API keys were revoked.'
      : 'Its roles, sessions and API keys were revoked.')
    await page.goto(`/app/users/${user.id}?tab=access`)
    const notice = page.getByText(/^Deleting it revoked its roles/)
    await expect(notice).toBeVisible()
    if (memberships) await expect(notice).toContainText('its roles and memberships')
    else await expect(notice).not.toContainText('membership')
  })

  // The role pool follows the entity, so a change clears the chosen roles: the Roles field says
  // so instead of losing them silently, and the entity sits right before the roles (v-users-10).
  test('Invite says the chosen roles were cleared when the entity changes', async ({ page, api, requires }) => {
    await requires({ preset: 'EnterpriseRBAC', features: ['invitations'], surfaces: ['entities', 'memberships', 'roles'] })
    const acme = (await api.listAll<ApiEntity>('/entities/')).find(entity => entity.name === 'acme_realty')
    test.skip(!acme, 'The seed has no acme_realty organization.')

    await page.goto('/app/users')
    await page.getByRole('button', { name: 'Invite', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Invite user' })
    const editor = dialog.getByTestId('role-access-editor')
    await editor.getByRole('option').first().click()
    const selection = editor.getByTestId('role-access-selection')
    await expect(selection.getByRole('button', { name: /^Remove / })).toHaveCount(1)
    await expect(dialog.getByText(/were cleared/)).toHaveCount(0)

    await pickEntity(page, dialog.getByLabel('Entity', { exact: true }), acme!.display_name ?? acme!.name, { search: true })
    await expect(selection.getByRole('button', { name: /^Remove / })).toHaveCount(0)
    await expect(dialog.getByText('The roles you chose were cleared because the entity changed: choose from this entity\'s roles.')).toBeVisible()
    // Choosing again lifts the note.
    await editor.getByRole('option').first().click()
    await expect(dialog.getByText(/were cleared/)).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })
})
