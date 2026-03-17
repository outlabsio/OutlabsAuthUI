import fs from 'node:fs/promises'

import type { FullConfig } from '@playwright/test'

import {
  authPersonas,
  authStorageDir,
  e2eApiBaseURL,
  e2eBaseURL,
} from './auth-personas'
import { runBackendReset, shouldResetBackend } from './reset-backend'

type LoginResponse = {
  access_token: string
  refresh_token: string
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
  await waitForOkResponse(`${e2eApiBaseURL}/v1/auth/config`, 'Auth backend')

  if (shouldResetBackend()) {
    await runBackendReset()
    await waitForOkResponse(`${e2eApiBaseURL}/v1/auth/config`, 'Auth backend after reset')
  }

  await fs.mkdir(authStorageDir, { recursive: true })

  for (const persona of Object.values(authPersonas)) {
    const response = await fetch(`${e2eApiBaseURL}/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: persona.email,
        password: persona.password,
      }),
    })

    if (!response.ok) {
      const detail = await response.text()
      throw new Error(
        `Unable to create auth state for ${persona.label} (${persona.email}): ${response.status} ${detail}`
      )
    }

    const tokens = (await response.json()) as LoginResponse
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
  }
}
