<script setup lang="ts">
// Where a key may act (EnterpriseRBAC, F-083): the entity it is restricted to, named by its path
// when the viewer can read entities, and whether child entities are included. A key with no
// entity acts wherever its owner's access applies.
const props = withDefaults(defineProps<{
  entityId?: string | null
  inheritFromTree?: boolean
  /** Path under the name (the key detail); the tables show the name only. */
  detailed?: boolean
}>(), { entityId: null, inheritFromTree: false, detailed: false })

const { name, label, inactive } = useEntityPathLabel(() => props.entityId)
</script>

<template>
  <span v-if="!entityId" class="text-muted">Not restricted</span>
  <span v-else class="inline-flex min-w-0 flex-col">
    <span class="break-words">
      {{ name ?? 'One entity' }}<template v-if="inactive">
        (inactive)
      </template><span v-if="inheritFromTree" class="text-muted"> and below</span>
    </span>
    <span v-if="detailed && label && label !== name" class="break-words text-xs text-muted">{{ label }}</span>
    <span v-else-if="detailed && !name" class="text-xs text-muted">Its name is not visible to your account.</span>
  </span>
</template>
