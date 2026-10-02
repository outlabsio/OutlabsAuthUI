import type { AccessCodeChannel } from '~/types/auth'
import type { AuthUiConfig, RuntimeConfig } from '~/utils/runtime-config'
import { oauthProviderLabel } from '~/utils/auth-messages'

// F0 — the single resolver for "what does the sign-in surface offer". Combines the
// deployment's declared surfacing config (runtime app-config / nuxt.config — the product
// choice) with the backend's discovered capabilities (/auth/config — the hard gate).
// A method renders only when BOTH allow it. Nothing here imports the phone stack: the country
// list and masks load with AppAuthPhoneInput, only where phone sign-in is offered.

const DEFAULT_OTP_LENGTH = 6

export function useAuthUiConfig() {
  const runtimeConfig = useState<RuntimeConfig | null>('app:runtime-config')
  const { capabilities, hasSurface } = useAuth()

  const authUi = computed<AuthUiConfig>(() => runtimeConfig.value?.authUi ?? {
    signup: true,
    identifier: 'email-or-phone',
    defaultCountry: 'AR',
    channels: ['whatsapp', 'sms'],
    oauthProviders: [],
    magicLink: true
  })

  const methods = computed(() => capabilities.value?.auth_methods)

  // Backend capabilities — password defaults on, passwordless defaults OFF when unknown
  // (a backend that doesn't report a method doesn't get its affordance).
  const passwordEnabled = computed(() => methods.value?.password !== false)
  const magicLinkEnabled = computed(() => Boolean(methods.value?.magic_link) && authUi.value.magicLink)
  const accessCodeEnabled = computed(() => Boolean(methods.value?.access_code))

  // Phone OTP = access-code capability AND the deployment surfacing phone channels AND the
  // identifier mode accepting phone numbers.
  const phoneChannels = computed<AccessCodeChannel[]>(() =>
    accessCodeEnabled.value && authUi.value.identifier === 'email-or-phone'
      ? authUi.value.channels
      : []
  )
  const phoneEnabled = computed(() => phoneChannels.value.length > 0)

  // OAuth sign-in needs the oauth router mounted on the backend (F-007): the deployment's
  // provider list alone would render buttons that dead-end on a 404.
  const oauthProviders = computed(() => (hasSurface('oauth') ? authUi.value.oauthProviders : []))
  // Linking a provider to an existing account is a separate router (oauth_associate).
  const linkableOauthProviders = computed(() => (hasSurface('oauth_associate') ? authUi.value.oauthProviders : []))
  // Self-registration is a deployment choice. `false` closes the signup page entirely (route
  // middleware); the backend's /auth/register must be disabled on the server as well.
  const signupEnabled = computed(() => authUi.value.signup)

  // ISO country preselected in the phone country code.
  const defaultCountry = computed(() => authUi.value.defaultCountry)

  // Digits in a one-time code: the backend's advertised access_code_length when a library
  // version publishes it, else the deployment's authUi.otpLength, else the library default 6.
  const otpLength = computed(() => capabilities.value?.access_code_length ?? authUi.value.otpLength ?? DEFAULT_OTP_LENGTH)

  return {
    authUi,
    passwordEnabled,
    magicLinkEnabled,
    accessCodeEnabled,
    phoneChannels,
    phoneEnabled,
    oauthProviders,
    linkableOauthProviders,
    signupEnabled,
    defaultCountry,
    otpLength,
    providerLabel: oauthProviderLabel
  }
}
