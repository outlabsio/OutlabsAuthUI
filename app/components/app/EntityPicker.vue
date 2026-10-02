<script setup lang="ts">
import type { EntityClassValue } from '~/types/entity'

// The one entity select (F-072): a USelectMenu whose options carry the entity's path
// ("ACME Realty / West Coast Region · office") and a class icon, grouped by organisation, so
// similarly named units in different organisations stay distinguishable. Scope it with
// `root-id` (the organisation the choice must stay in: the actor's or the record's root) —
// then the whole subtree loads and filters locally. Without `root-id` (superusers, system-wide
// admins) it searches the server as you type. A delegated admin is always anchored on their own
// organisation, whatever `root-id` says (useEntityScope). The bound value always stays listed
// (disabled with the reason when a filter excludes it). Data and rules live in useEntityPicker.
//   <UFormField name="entity_id" label="Entity" required>
//     <AppEntityPicker v-model="state.entityId" :root-id="user.root_entity_id" :exclude-ids="memberEntityIds" />
//   </UFormField>
// Props: root-id, entity-class ('structural' | 'access_group'), allowed-types, exclude-ids,
// exclude-subtree-of (e.g. the entity being moved), include-root (default true),
// include-inactive (default false: inactive entities are listed but disabled), placeholder,
// disabled. Emits update:modelValue with the entity id (undefined when cleared).
// `id` and other attributes belong on the select trigger (label association), not the wrapper.
defineOptions({ inheritAttrs: false })

const model = defineModel<string | undefined>()

const props = withDefaults(defineProps<{
  rootId?: string | null
  entityClass?: EntityClassValue | null
  allowedTypes?: string[] | null
  excludeIds?: string[] | null
  excludeSubtreeOf?: string | null
  includeRoot?: boolean
  includeInactive?: boolean
  placeholder?: string
  disabled?: boolean
}>(), {
  rootId: null,
  entityClass: null,
  allowedTypes: null,
  excludeIds: null,
  excludeSubtreeOf: null,
  includeRoot: true,
  includeInactive: false,
  placeholder: 'Select an entity',
  disabled: false
})

const { searchTerm, serverSearch, items, status, error, loading, hint, retry } = useEntityPicker({
  rootId: () => props.rootId,
  entityClass: () => props.entityClass,
  allowedTypes: () => props.allowedTypes,
  excludeIds: () => props.excludeIds,
  excludeSubtreeOf: () => props.excludeSubtreeOf,
  includeRoot: () => props.includeRoot,
  includeInactive: () => props.includeInactive,
  selectedId: () => model.value,
  enabled: () => !props.disabled
})
const errorMessage = useApiErrorMessage(error)

const searchInputProps = computed(() => ({
  'placeholder': serverSearch.value ? 'Search all entities...' : 'Filter entities...',
  'type': 'search' as const,
  'aria-label': 'Search entities'
}))

// USelectMenu's own model is `string | undefined`; '' from legacy form state means "none".
const selected = computed({
  get: () => model.value || undefined,
  set: (value: string | undefined) => { model.value = value }
})
</script>

<template>
  <div class="space-y-2">
    <USelectMenu
      v-model="selected"
      v-model:search-term="searchTerm"
      :items="items"
      value-key="value"
      :filter-fields="['label', 'description']"
      :ignore-filter="serverSearch"
      :loading="loading"
      :placeholder="placeholder"
      :disabled="disabled"
      :search-input="searchInputProps"
      class="w-full"
      v-bind="$attrs"
    >
      <template #empty="{ searchTerm: term }">
        <span v-if="status === 'error'">Could not load entities.</span>
        <span v-else-if="status === 'pending'">Loading entities...</span>
        <span v-else-if="term">No entity matches "{{ term }}".</span>
        <span v-else>No entities available.</span>
      </template>
      <template v-if="hint" #content-bottom>
        <p class="border-t border-default px-2 py-1.5 text-xs text-muted">
          {{ hint }}
        </p>
      </template>
    </USelectMenu>
    <UAlert
      v-if="status === 'error'"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Could not load entities"
      :description="errorMessage"
      :actions="[{ label: 'Retry', icon: 'i-lucide-refresh-cw', color: 'neutral', variant: 'outline', onClick: retry }]"
    />
  </div>
</template>
