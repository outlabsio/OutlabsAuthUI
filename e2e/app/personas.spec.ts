import { expect, persona, personaState, test } from '../support/fixtures'
import { PERSONA_KEYS } from '../support/personas'

// Harness smoke: every persona globalSetup minted for this backend is a real, distinct session
// that the console accepts. Personas the preset does not seed skip with a reason.
test.describe('persona sessions', () => {
  for (const key of PERSONA_KEYS) {
    test(`${key}: the minted session belongs to the persona and boots the console`, async ({ apiAs, requires, sessionContext }) => {
      await requires({ personas: [key] })
      const me = await apiAs(key).me()
      expect(me.email.toLowerCase()).toBe(persona(key).email.toLowerCase())

      const page = await (await sessionContext(personaState(key))).newPage()
      await page.goto('/app/dashboard')
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
      await expect(page).toHaveURL(/\/app\/dashboard/)
    })
  }

  test('admin is a superuser and the low-privilege agent is not', async ({ api, apiAs, requires }) => {
    await requires({ personas: ['admin', 'agent'] })
    expect((await api.me()).is_superuser).toBe(true)
    expect((await apiAs('agent').me()).is_superuser).toBe(false)
  })
})
