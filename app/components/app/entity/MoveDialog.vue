<script setup lang="ts">
import { moveEntitySchema } from '~/schemas/entity'
import type { Entity } from '~/types/entity'
import type { EntityIndex } from '~/utils/entity-tree'

// Move dialog (display only; logic in useEntityMoveDialog, F-076).
const props = defineProps<{
  entity: Entity
  rootId: string | null
  organisation: EntityIndex
  descendantCount: number
  memberCount: number | null
}>()
const open = defineModel<boolean>('open', { default: false })

const {
  state,
  error,
  isRoot,
  canMoveToTop,
  destinationItems,
  pickerRootId,
  excludedIds,
  changed,
  currentParentName,
  impact,
  onSubmit
} = useEntityMoveDialog(computed(() => ({ ...props })), open)
</script>

<template>
  <AppFormDialog
    ref="moveEntityDialog"
    v-model:open="open"
    :title="`Move ${entity.display_name}`"
    :description="currentParentName ? `Currently under ${currentParentName}.` : 'Currently a top-level organization.'"
    :schema="moveEntitySchema"
    :state="state"
    :error="error"
    :dirty="changed"
    require-changes
    submit-label="Move entity"
    size="lg"
    @submit="onSubmit"
  >
    <UFormField
      v-if="canMoveToTop"
      name="destination"
      label="Destination"
      required
    >
      <URadioGroup
        v-model="state.destination"
        :items="destinationItems"
        variant="card"
        orientation="horizontal"
        class="w-full"
      />
    </UFormField>
    <UFormField
      v-if="state.destination === 'parent'"
      name="parentId"
      label="New parent"
      required
      :help="isRoot ? 'Search every organization.' : 'Entities that cannot hold it (its own branch, access groups for a structural entity, parents limited to other types) are not offered.'"
    >
      <AppEntityPicker
        id="entity-move-parent"
        v-model="state.parentId"
        aria-label="New parent"
        :root-id="pickerRootId"
        :exclude-ids="excludedIds"
        :exclude-subtree-of="entity.id"
        placeholder="Choose the new parent"
      />
    </UFormField>
    <UAlert
      :color="isRoot ? 'warning' : 'neutral'"
      variant="subtle"
      icon="i-lucide-git-branch"
      title="What moving changes"
      data-testid="move-impact"
    >
      <template #description>
        <ul class="list-disc space-y-1 ps-4">
          <li v-for="line in impact" :key="line">
            {{ line }}
          </li>
        </ul>
      </template>
    </UAlert>
  </AppFormDialog>
</template>
