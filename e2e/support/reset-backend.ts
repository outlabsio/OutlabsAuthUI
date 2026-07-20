import { access } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

const disabledResetValues = new Set(['0', 'false', 'no'])

export const defaultBackendRepoDir =
  process.env.E2E_BACKEND_REPO_DIR ??
  '/Users/macbookm3/Documents/projects/outlabsAuth'

export const defaultBackendResetScript =
  process.env.E2E_BACKEND_RESET_SCRIPT ??
  path.join(defaultBackendRepoDir, 'examples/enterprise_rbac/reset_test_env.py')

export function shouldResetBackend() {
  const rawValue = process.env.E2E_RESET_BACKEND

  if (!rawValue) {
    return true
  }

  return !disabledResetValues.has(rawValue.trim().toLowerCase())
}

async function assertPathExists(targetPath: string, label: string) {
  try {
    await access(targetPath)
  } catch (error) {
    throw new Error(`${label} not found at ${targetPath}: ${String(error)}`)
  }
}

export async function runBackendReset() {
  await assertPathExists(defaultBackendRepoDir, 'Backend repo')
  await assertPathExists(defaultBackendResetScript, 'Backend reset script')

  // Drop ambient DATABASE_URL unless E2E_DATABASE_URL is set. Otherwise a shell
  // pointed at enterprise can make the SimpleRBAC reset seed the wrong database.
  const env = { ...process.env }
  if (process.env.E2E_DATABASE_URL) {
    env.DATABASE_URL = process.env.E2E_DATABASE_URL
  } else {
    delete env.DATABASE_URL
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn('uv', ['run', 'python', defaultBackendResetScript], {
      cwd: defaultBackendRepoDir,
      env,
      stdio: 'inherit',
    })

    child.on('error', (error) => {
      reject(
        new Error(
          `Unable to start backend reset with uv. Ensure uv is installed and available on PATH. ${String(error)}`
        )
      )
    })

    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(
        new Error(
          `Backend reset failed with ${
            signal ? `signal ${signal}` : `exit code ${String(code)}`
          }.`
        )
      )
    })
  })
}

if (import.meta.main) {
  if (!shouldResetBackend()) {
    console.log('Skipping backend reset because E2E_RESET_BACKEND is disabled.')
    process.exit(0)
  }

  console.log(`Resetting backend using ${defaultBackendResetScript}`)
  await runBackendReset()
  console.log('Backend reset complete.')
}
