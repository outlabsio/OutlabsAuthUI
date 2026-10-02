<script setup lang="ts">
import type { OneTimeSecret } from '~/types/api-key'

// The one-time secret dialog for API keys and machine keys (F-183). It:
// - names the key the secret belongs to (name, prefix, owner, expiry), so an admin minting
//   several keys can tell them apart;
// - cannot be dismissed by accident: no close button, ESC and outside clicks are ignored, and
//   Done stays disabled until "I have stored this key" is ticked;
// - copies with visible feedback (the button turns into "Copied"), falling back to selecting
//   the text when the clipboard is blocked;
// - shows how to use the key (the X-API-Key header);
// - clears the secret once the dialog has closed (sets the model to null);
// - is held by useDialogGuard until the key is marked as stored: browser Back asks "Close
//   without storing the key?" instead of dropping it, and a reload or tab close is warned.
// Bind a ref holding the create/rotate response; set it to open the dialog. The model must be
// the ONLY copy: build the create/rotate mutation with useSecretMutation (queries/
// secret-mutation.ts) and call its discard() right after filling the model, otherwise Pinia
// Colada's mutation cache keeps the plaintext after the dialog has closed.
//   const revealed = ref<OneTimeSecret | null>(null)
//   const res = await run(() => createKey.mutateAsync(input), { ... })
//   if (res.ok) {
//     revealed.value = oneTimeSecretFrom(res.data, ownerLabel)   // opens
//     createKey.discard()                                         // drops the cached response
//   }
//   <AppSecretReveal v-model:secret="revealed" />                 // closes and clears it
const revealed = defineModel<OneTimeSecret | null>('secret', { required: true })

const props = withDefaults(defineProps<{
  title?: string
  // Accessible name of the read-only secret field.
  secretLabel?: string
  // The request header the key authenticates with.
  headerName?: string
}>(), {
  title: 'Store the new API key now',
  secretLabel: 'API key secret',
  headerName: 'X-API-Key'
})

const toast = useToast()
// "X-API-Key: sk_live_ab12…" — the prefix only; the secret itself is in the field above.
const usageExample = computed(() => `${props.headerName}: ${revealed.value?.prefix ? `${revealed.value.prefix}…` : '<key>'}`)
const open = ref(false)
const acknowledged = ref(false)
const copied = ref(false)
const secretInput = useTemplateRef<{ inputRef?: HTMLInputElement | null }>('secretInput')
let copiedTimer: ReturnType<typeof setTimeout> | undefined
// ESC and outside clicks stay ignored (the modal is not dismissible); the guard covers browser
// Back and unloading while the key has not been marked as stored. Done closes directly.
useDialogGuard({ open, hold: () => !acknowledged.value, discard: SECRET_NOT_STORED })

watch(revealed, (value) => {
  if (!value) return
  acknowledged.value = false
  copied.value = false
  open.value = true
}, { immediate: true })

function selectSecret() {
  secretInput.value?.inputRef?.select()
}

async function copy() {
  if (!revealed.value) return
  try {
    await navigator.clipboard.writeText(revealed.value.secret)
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      copied.value = false
    }, 2500)
  } catch {
    selectSecret()
    toast.add({ title: 'Copy the key manually', description: 'Clipboard access was blocked. The key is selected; press Ctrl+C or Cmd+C.', color: 'warning', icon: 'i-lucide-triangle-alert' })
  }
}

function done() {
  if (!acknowledged.value) return
  open.value = false
}

// Drop the plaintext once the leave transition has finished (and on unmount, if the page
// goes away while the dialog is open).
function clear() {
  clearTimeout(copiedTimer)
  acknowledged.value = false
  copied.value = false
  revealed.value = null
}
onBeforeUnmount(() => {
  if (revealed.value) clear()
})
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :description="revealed ? `This is the only time the full secret of ${revealed.name} is shown.` : undefined"
    :dismissible="false"
    :close="false"
    @after:leave="clear"
  >
    <template #body>
      <div v-if="revealed" class="space-y-4">
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Copy this key now"
          description="It cannot be retrieved again. If it is lost, rotate the key to get a new secret."
        />

        <dl class="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <div class="min-w-0">
            <dt class="text-xs text-muted">
              Key
            </dt>
            <dd class="break-words text-sm font-medium text-highlighted">
              {{ revealed.name }}
            </dd>
          </div>
          <div v-if="revealed.prefix" class="min-w-0">
            <dt class="text-xs text-muted">
              Prefix
            </dt>
            <dd class="break-all font-mono text-sm text-default">
              {{ revealed.prefix }}
            </dd>
          </div>
          <div v-if="revealed.owner" class="min-w-0">
            <dt class="text-xs text-muted">
              Owner
            </dt>
            <dd class="break-words text-sm text-default">
              {{ revealed.owner }}
            </dd>
          </div>
          <div class="min-w-0">
            <dt class="text-xs text-muted">
              Expires
            </dt>
            <dd class="text-sm text-default">
              <AppTimestamp :value="revealed.expiresAt" fallback="Never" />
            </dd>
          </div>
        </dl>

        <div class="flex items-center gap-2">
          <UInput
            ref="secretInput"
            :model-value="revealed.secret"
            readonly
            class="w-full font-mono"
            :aria-label="secretLabel"
            @focus="selectSecret"
          />
          <UButton
            :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            :color="copied ? 'success' : 'neutral'"
            variant="outline"
            :label="copied ? 'Copied' : 'Copy'"
            :aria-label="copied ? 'Copied to clipboard' : 'Copy API key'"
            @click="copy"
          />
        </div>

        <div class="space-y-1">
          <p class="text-sm text-muted">
            Send it in the <code class="font-mono text-default">{{ headerName }}</code> request header:
          </p>
          <code class="block break-words font-mono text-sm text-default">{{ usageExample }}</code>
        </div>

        <UCheckbox v-model="acknowledged" label="I have stored this key somewhere safe" />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end">
        <UButton label="Done" :disabled="!acknowledged" @click="done" />
      </div>
    </template>
  </UModal>
</template>
