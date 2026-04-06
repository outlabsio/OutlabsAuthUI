import fs from 'node:fs/promises'

import type { FullConfig } from '@playwright/test'

import {
  authPersonas,
  authStorageDir,
  buildE2eAuthApiUrl,
  e2eBaseURL,
  requestedAuthPersonas,
} from './auth-personas'
import { runBackendReset, shouldResetBackend } from './reset-backend'

type LoginResponse = {
  access_token: string
  refresh_token: string
}

async function loginWithRetry(email: string, password: string) {
  const timeoutMs = 30_000
  const deadline = Date.now() + timeoutMs
  let lastStatus: number | null = null
  let lastDetail = ''

  while (Date.now() < deadline) {
    const response = await fetch(buildE2eAuthApiUrl('/auth/login'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
      }),
    })

    if (response.ok) {
      return (await response.json()) as LoginResponse
    }

    lastStatus = response.status
    lastDetail = await response.text()

    if (response.status < 500) {
      break
    }

    await sleep(1_000)
  }

  throw new Error(
    `${String(lastStatus ?? 'unknown')} ${lastDetail || 'Unable to log in during E2E setup'}`
  )
}

async function sleep(ms: number) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function waitForOkResponse(url: string, label: string) {
  const timeoutMs = 30_000
  const deadline = Date.now() + timeoutMs
  let lastError: unknown = null

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }

      lastError = new Error(`${label} responded with ${response.status}`)
    } catch (error) {
      lastError = error
    }

    await sleep(1_000)
  }

  throw new Error(
    `${label} was not reachable within ${timeoutMs}ms. Last error: ${String(lastError)}`
  )
}

export default async function globalSetup(config: FullConfig) {
  const configuredBaseURL =
    process.env.E2E_BASE_URL ??
    config.projects[0]?.use?.baseURL?.toString() ??
    e2eBaseURL
  const baseOrigin = new URL(configuredBaseURL).origin

  await waitForOkResponse(`${configuredBaseURL}/auth/login`, 'Frontend dev server')
  await waitForOkResponse(buildE2eAuthApiUrl('/auth/config'), 'Auth backend')

  if (shouldResetBackend()) {
    await runBackendReset()
    await waitForOkResponse(buildE2eAuthApiUrl('/auth/config'), 'Auth backend after reset')
  }

  await fs.mkdir(authStorageDir, { recursive: true })

  for (const personaKey of requestedAuthPersonas) {
    const persona = authPersonas[personaKey]
    try {
      const tokens = await loginWithRetry(persona.email, persona.password)
      const storageState = {
        cookies: [],
        origins: [
          {
            origin: baseOrigin,
            localStorage: [
              {
                name: 'outlabs-auth.access-token',
                value: tokens.access_token,
              },
              {
                name: 'outlabs-auth.refresh-token',
                value: tokens.refresh_token,
              },
            ],
          },
        ],
      }

      await fs.writeFile(
        persona.storageState,
        JSON.stringify(storageState, null, 2),
        'utf8'
      )
    } catch (error) {
      throw new Error(
        `Unable to create auth state for ${persona.label} (${persona.email}): ${String(error)}`
      )
    }
  }
}
