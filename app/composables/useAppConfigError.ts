import { useQuery } from '@pinia/colada'
import { authConfigQuery } from '~/queries/session'
import type { RuntimeConfigError } from '~/utils/runtime-config'
import { apiContractError } from '~/utils/capabilities'

// The one "refuse to boot" signal app.vue renders as AppConfigErrorScreen:
// 1. the runtime config (backend target) failed to resolve — set by the boot plugin; or
// 2. the backend reports an api_contract_version this console does not support (F-055), e.g.
//    a future outlabs-auth.api/v2. Derived from the Colada-owned /auth/config, so it covers
//    the boot fetch and any later reload. An ABSENT version (older library) is not blocking;
//    Settings shows it as unknown.
export function useAppConfigError() {
  const configError = useState<RuntimeConfigError | null>('app:config-error', () => null)
  // Never query a backend whose target failed to resolve.
  const { data: authConfig } = useQuery(() => ({ ...authConfigQuery, enabled: configError.value == null }))
  return computed<RuntimeConfigError | null>(() => configError.value ?? apiContractError(authConfig.value))
}
