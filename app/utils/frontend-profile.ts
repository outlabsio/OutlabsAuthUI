// Frontend-profile rejection (the console's `frontendProfileKey`, sent as `app` on sign-in).
// The backend answers 403 with code `wrong_application` when the key names no registered
// profile, or when that profile does not accept the account. Its error envelope carries the
// code under `details` ({ error, message, details: { code } }); a bare FastAPI error puts it
// under `detail`. Pure helpers so the sign-in flow can explain it inline instead of a generic
// "Sign in failed".

function codeOf(value: unknown): unknown {
  return value != null && typeof value === 'object' ? (value as { code?: unknown }).code : undefined
}

export function isWrongApplicationError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false
  const { status, data } = error as { status?: unknown, data?: unknown }
  if (status !== 403 || data == null || typeof data !== 'object') return false
  const payload = data as { details?: unknown, detail?: unknown }
  return [codeOf(payload.details), codeOf(payload.detail), codeOf(payload)].includes('wrong_application')
}

export function wrongApplicationMessage(frontendProfileKey: string | undefined): string {
  if (!frontendProfileKey) {
    return 'The auth backend does not allow this account to sign in to this console. '
      + 'Ask an administrator to check which frontend profile the console should use.'
  }
  return `The auth backend does not accept this account for the console's frontend profile "${frontendProfileKey}". `
    + 'If every account fails, frontendProfileKey in app-config.json does not match a profile the backend registers.'
}
