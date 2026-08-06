import { promises as fs } from 'node:fs'
import { expect, type Page, test as setup } from '@playwright/test'

// Auth setup project — logs each persona in once through the UI and persists storageState
// (tokens live in localStorage) for the authenticated matrix. Requires a seeded outlabsAuth
// backend; each persona self-skips when E2E_API_BASE_URL is unset so a bare checkout still
// runs the guest smoke.
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@test.com'
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'Test123!!'
// A deliberately low-privilege persona for the access-control matrix. In EnterpriseRBAC the
// "agent" holds only lead:* permissions and is NOT a superuser. Falls back to the admin creds
// so a minimal single-persona seed still produces a usable (if over-privileged) session.
const agentEmail = process.env.E2E_AGENT_EMAIL ?? 'agent@sf.acme.com'
const agentPassword = process.env.E2E_AGENT_PASSWORD ?? 'Testpass1!'

async function loginAndPersist(page: Page, email: string, password: string, statePath: string) {
  await page.goto('/auth/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(/\/app\//)

  await fs.mkdir('e2e/.auth', { recursive: true })
  await page.context().storageState({ path: statePath })
}

setup('authenticate as admin', async ({ page }) => {
  setup.skip(!process.env.E2E_API_BASE_URL, 'No E2E backend configured (set E2E_API_BASE_URL).')
  await loginAndPersist(page, adminEmail, adminPassword, 'e2e/.auth/admin.json')
})

setup('authenticate as agent', async ({ page }) => {
  setup.skip(!process.env.E2E_API_BASE_URL, 'No E2E backend configured (set E2E_API_BASE_URL).')
  await loginAndPersist(page, agentEmail, agentPassword, 'e2e/.auth/agent.json')
})
