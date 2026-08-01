import { expect, test as base } from '@playwright/test'

import {
  authPersonas,
  type AuthPersona,
} from './auth-personas'

type PersonaOptions = {
  persona: AuthPersona
}

export const test = base.extend<PersonaOptions>({
  persona: ['admin', { option: true }],
  storageState: async ({ persona }, applyStorageState) => {
    await applyStorageState(authPersonas[persona].storageState)
  },
})

export { expect }
