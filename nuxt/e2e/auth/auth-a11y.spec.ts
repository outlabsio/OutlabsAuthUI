import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '../support/fixtures'

// P3 a11y sweep — unauthenticated sign-in page (guest project, no backend needed).
test('no a11y violations on the sign-in page', async ({ page }) => {
  await page.goto('/auth/login')
  await page.getByRole('heading', { name: 'Sign in' }).waitFor()
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    // See a11y-smoke.spec.ts — color-contrast is scoped out as a documented amber-brand
    // decision; all structural/ARIA/label rules are enforced.
    .disableRules(['color-contrast'])
    .analyze()
  expect(results.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }))).toEqual([])
})
