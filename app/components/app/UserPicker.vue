<script setup lang="ts">
// One account, chosen by name or email from a server-searched list (display only; data in
// useUserPicker). Lists only the accounts the admin can read. `id` and other attributes go to
// the select trigger (label association); clearing emits undefined.
//   <UFormField label="Actor"><AppUserPicker v-model="actorUserId" placeholder="Anyone" /></UFormField>
defineOptions({ inheritAttrs: false })

const model = defineModel<string | undefined>()
const props = withDefaults(defineProps<{ placeholder?: string, disabled?: boolean }>(), {
  placeholder: 'Choose an account',
  disabled: false
})

const { searchTerm, items, loading, status, hint, onOpen } = useUserPicker({
  selectedId: () => model.value,
  enabled: () => !props.disabled
})
const searchInput = { 'placeholder': 'Search by name or email...', 'type': 'search' as const, 'aria-label': 'Search accounts' }

const selected = computed({
  get: () => model.value || undefined,
  set: (value: string | undefined) => { model.value = value }
})
</script>

<template>
  <USelectMenu
    v-model="selected"
    v-model:search-term="searchTerm"
    :items="items"
    value-key="value"
    ignore-filter
    :loading="loading"
    :placeholder="placeholder"
    :disabled="disabled"
    :search-input="searchInput"
    clear
    class="w-full"
    v-bind="$attrs"
    @update:open="onOpen"
  >
    <template #empty>
      <span v-if="status === 'error'">Could not load accounts.</span>
      <span v-else-if="loading">Loading accounts...</span>
      <span v-else-if="searchTerm">No account matches "{{ searchTerm }}".</span>
      <span v-else>No accounts available.</span>
    </template>
    <template v-if="hint" #content-bottom>
      <p class="border-t border-default px-2 py-1.5 text-xs text-muted">
        {{ hint }}
      </p>
    </template>
  </USelectMenu>
</template>
