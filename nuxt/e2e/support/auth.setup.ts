import { promises as fs } from 'node:fs'
import { expect, test as setup } from '@playwright/test'

// Auth setup project — logs in once through the UI and persists storageState (tokens live
// in localStorage) for the authenticated matrix. Requires a seeded outlabsAuth backend;
// when E2E_API_BASE_URL is unset it self-skips so a bare checkout still runs the guest smoke.
const authFile = 'e2e/.auth/admin.json'
const email = process.env.E2E_ADMIN_EMAIL ?? 'admin@test.com'
const password = process.env.E2E_ADMIN_PASSWORD ?? 'Test123!!'

setup('authenticate as admin', async ({ page }) => {
  setup.skip(!process.env.E2E_API_BASE_URL, 'No E2E backend configured (set E2E_API_BASE_URL).')

  await page.goto('/auth/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(/\/app\//)

  await fs.mkdir('e2e/.auth', { recursive: true })
  await page.context().storageState({ path: authFile })
})
