<script setup lang="ts">
import { editEntitySchema } from '~/schemas/entity'
import type { Entity } from '~/types/entity'

// Edit entity (display only; logic in useEntityEditDialog). No "Archived" status here: archiving
// is the detail's Archive action, which revokes what the entity grants (F-004).
const props = defineProps<{ entity: Entity }>()
const open = defineModel<boolean>('open', { default: false })
const entity = computed(() => props.entity)

const { state, error, conflict, dirty, inactiveSelected, onSubmit, onOverwrite, reload } = useEntityEditDialog(entity, open)
</script>

<template>
  <AppFormDialog
    ref="editEntityDialog"
    v-model:open="open"
    :title="`Edit ${entity.display_name}`"
    :schema="editEntitySchema"
    :state="state"
    :error="error"
    :dirty="dirty"
    :conflict="conflict"
    require-changes
    submit-label="Save changes"
    size="lg"
    @submit="onSubmit"
    @overwrite="onOverwrite"
    @reload="reload"
  >
    <UFormField name="displayName" label="Display name" required>
      <UInput v-model="state.displayName" class="w-full" />
    </UFormField>
    <UFormField name="description" label="Description" hint="Optional">
      <UTextarea
        v-model="state.description"
        :rows="2"
        autoresize
        class="w-full"
      />
    </UFormField>
    <UFormField
      name="status"
      label="Status"
      required
      description="Inactive blocks this entity's API keys and service accounts."
    >
      <USelect v-model="state.status" :items="ENTITY_STATUS_ITEMS" class="w-full" />
    </UFormField>
    <UAlert
      v-if="inactiveSelected"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      title="Inactive does not revoke member access"
      description="Members keep their roles here. To revoke memberships, keys and service accounts, archive the entity instead."
      data-testid="entity-inactive-note"
    />
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <UFormField
        name="validFrom"
        label="Valid from"
        hint="Optional"
        :help="startOfDayHelp()"
      >
        <AppDateField v-model="state.validFrom" label="Valid from" />
      </UFormField>
      <UFormField
        name="validUntil"
        label="Valid until"
        hint="Optional"
        :help="endOfDayHelp()"
      >
        <AppDateField v-model="state.validUntil" label="Valid until" />
      </UFormField>
    </div>
    <p class="text-xs text-muted">
      Outside the validity window the entity's API keys and service accounts are blocked. Member access is not limited by it.
    </p>
  </AppFormDialog>
</template>
