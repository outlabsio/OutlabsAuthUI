<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'
import {
  appSection,
  capabilityAvailable,
  requirementPermissions,
  requiresCapabilities,
  resolveRequirement,
  type AccessRequirement,
  type AppSectionId
} from '~/utils/capabilities'

// Access gate — renders its slot only when the actor may see the content; otherwise an
// in-place UEmpty (never a redirect). Two uses:
// - Page level: `section` (an APP_SECTIONS id). The requirement is the SAME one the sidebar
//   and the route guard read, so a visible nav item never lands on a denial and a hidden one
//   denies in place with the missing permission named.
// - Inline (a card inside a page): `permission` (any-of) plus a `label` for the copy, usually
//   with `compact`.
// Superusers always pass the permission half. A section that needs backend capabilities
// fails closed while /auth/config is unavailable, with a Retry action; one that needs a
// permission fails closed while the actor's permissions are loading or could not be loaded,
// saying so (with Retry) rather than denying access.
const props = withDefaults(defineProps<{
  section?: AppSectionId
  permission?: string | string[]
  // What is being protected, e.g. "members" — defaults to the section label.
  label?: string
  compact?: boolean
}>(), {
  section: undefined,
  permission: undefined,
  label: undefined,
  compact: false
})

const { capabilities, configState, refetchConfig, isSuperuser, hasAnyPermission, permissionsState, refetchPermissions } = useAuth()

// Resolved against this backend (resolveRequirement), like the nav and the route guard, so the
// permissions a denial names are the ones that would open it here.
const requirement = computed<AccessRequirement>(() => {
  const base = props.section ? appSection(props.section).requires : {}
  return resolveRequirement(props.permission ? { ...base, consoleAdmin: false, permission: props.permission } : base, capabilities.value)
})
const subject = computed(() => props.label ?? (props.section ? appSection(props.section).label.toLowerCase() : 'this section'))

type GateState = 'allowed' | 'config-unavailable' | 'unsupported' | 'permissions-unavailable' | 'denied'
const state = computed<GateState>(() => {
  const req = requirement.value
  if (requiresCapabilities(req)) {
    if (configState.value !== 'ready') return 'config-unavailable'
    if (!capabilityAvailable(req, capabilities.value)) return 'unsupported'
  }
  if (req.superuser) return isSuperuser.value ? 'allowed' : 'denied'
  const needed = requirementPermissions(req)
  if (!needed.length || isSuperuser.value) return 'allowed'
  // Without the actor's permissions nothing is known to be granted, but nothing is known to be
  // missing either.
  if (permissionsState.value !== 'ready') return 'permissions-unavailable'
  // hasAnyPermission applies the backend permission algebra (see utils/permissions.ts).
  return hasAnyPermission(needed) ? 'allowed' : 'denied'
})

function describePermissions(permissions: string[]) {
  if (!permissions.length) return 'superuser access'
  if (permissions.length === 1) return `the ${permissions[0]} permission`
  return `one of these permissions: ${permissions.join(', ')}`
}

const size = computed(() => (props.compact ? 'sm' : 'md'))
const variant = computed(() => (props.compact ? 'naked' : 'outline'))
const loading = computed(() => (state.value === 'config-unavailable' && configState.value === 'pending')
  || (state.value === 'permissions-unavailable' && permissionsState.value === 'pending'))
const dashboardAction: ButtonProps = { label: 'Go to dashboard', to: '/app/dashboard', color: 'neutral', variant: 'outline' }
const retryAction = (retry: () => unknown): ButtonProps => ({ label: 'Retry', icon: 'i-lucide-refresh-cw', color: 'neutral', variant: 'outline', onClick: () => void retry() })

const empty = computed(() => {
  switch (state.value) {
    case 'config-unavailable':
      return {
        icon: 'i-lucide-cloud-off',
        title: configState.value === 'pending' ? 'Loading server capabilities' : 'Server capabilities unavailable',
        description: configState.value === 'pending'
          ? 'Checking what this auth server supports.'
          : 'Couldn\'t load what this auth server supports. This section stays hidden until it does.',
        actions: configState.value === 'pending' ? [] : [retryAction(refetchConfig)]
      }
    case 'permissions-unavailable':
      return {
        icon: 'i-lucide-shield-question-mark',
        title: permissionsState.value === 'pending' ? 'Loading your permissions' : 'Couldn\'t load your permissions',
        description: permissionsState.value === 'pending'
          ? 'Checking what your account may open.'
          : 'This stays closed until they load. It\'s a loading problem, not a missing permission.',
        actions: permissionsState.value === 'pending' ? [] : [retryAction(refetchPermissions)]
      }
    case 'unsupported':
      return {
        icon: 'i-lucide-circle-off',
        title: 'Not available on this server',
        description: `This auth server doesn't expose ${subject.value}.`,
        actions: props.compact ? [] : [dashboardAction]
      }
    default:
      return {
        icon: 'i-lucide-lock',
        title: `No access to ${subject.value}`,
        description: `You need ${describePermissions(requirementPermissions(requirement.value))}. Ask an administrator if you should have access.`,
        actions: props.compact ? [] : [dashboardAction]
      }
  }
})
</script>

<template>
  <slot v-if="state === 'allowed'" />
  <UEmpty
    v-else
    :icon="empty.icon"
    :title="empty.title"
    :description="empty.description"
    :actions="empty.actions"
    :size="size"
    :variant="variant"
    :loading="loading"
    :role="loading ? 'status' : undefined"
    :data-access-state="state"
  />
</template>
