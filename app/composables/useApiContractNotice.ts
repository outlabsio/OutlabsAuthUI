import { SUPPORTED_API_CONTRACT } from '~/utils/capabilities'

// The warning shown when this console cannot verify the auth server's API contract: no version
// reported (an older library) or a string it cannot parse. Neither blocks the console (only a
// differing major does, see checkApiContract); Settings and the admin dashboard show it.
export function useApiContractNotice() {
  const { apiContract } = useAuth()
  return computed(() => {
    const check = apiContract.value
    if (check.status !== 'unknown') return null
    return check.version
      ? {
          title: 'API contract version not recognized',
          description: `This auth server reports "${check.version}", which this console can't read, so compatibility can't be verified. This console supports ${SUPPORTED_API_CONTRACT}.`
        }
      : {
          title: 'API contract version not reported',
          description: 'This auth server doesn\'t report which API contract it implements, so compatibility with this console can\'t be verified. Upgrade the server library to one that reports it.'
        }
  })
}
