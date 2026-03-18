type MutationToastConfig = {
  error?: string
  errorTitle?: string
  skipErrorToast?: boolean
  success?: string
  successTitle?: string
}

const mutationToastMetaKey = 'mutationToast'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

export function withMutationToast(config: MutationToastConfig) {
  return {
    [mutationToastMetaKey]: config,
  } as const
}

export function getMutationToastConfig(
  meta: unknown
): MutationToastConfig | null {
  if (!isRecord(meta)) {
    return null
  }

  const value = meta[mutationToastMetaKey]

  if (!isRecord(value)) {
    return null
  }

  return {
    error: typeof value.error === 'string' ? value.error : undefined,
    errorTitle:
      typeof value.errorTitle === 'string' ? value.errorTitle : undefined,
    skipErrorToast: value.skipErrorToast === true,
    success: typeof value.success === 'string' ? value.success : undefined,
    successTitle:
      typeof value.successTitle === 'string' ? value.successTitle : undefined,
  }
}
