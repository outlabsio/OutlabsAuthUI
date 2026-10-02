<script setup lang="ts">
import { updatePermissionSchema } from '~/schemas/permission'
import type { Permission } from '~/types/permission'

// Edit a custom permission (display only; logic in usePermissionEditDialog). The name
// (resource:action) is fixed and reads as the description: as one unbroken word it would run
// under the close button in a phone-width title.
const props = defineProps<{ permission: Permission | null }>()
const open = defineModel<boolean>('open', { default: false })

const { state, error, dirty, statusEffect, onSubmit } = usePermissionEditDialog(() => props.permission, open)
</script>

<template>
  <AppFormDialog
    ref="permissionDialog"
    v-model:open="open"
    title="Edit permission"
    :description="permission?.name"
    :schema="updatePermissionSchema"
    :state="state"
    :error="error"
    :dirty="dirty"
    require-changes
    submit-label="Save changes"
    @submit="onSubmit"
  >
    <UFormField name="display_name" label="Display name" required>
      <UInput v-model="state.display_name" class="w-full" />
    </UFormField>
    <UFormField name="description" label="Description" hint="Optional">
      <UTextarea
        v-model="state.description"
        class="w-full"
        :rows="3"
        autoresize
      />
    </UFormField>
    <UFormField
      name="tags"
      label="Tags"
      hint="Optional"
      help="Press Enter after each tag."
    >
      <UInputTags
        v-model="state.tags"
        placeholder="Add a tag"
        add-on-blur
        add-on-paste
        class="w-full"
      />
    </UFormField>
    <UFormField
      name="is_active"
      label="Active"
      description="Inactive permissions grant nothing and can't be added to roles."
    >
      <USwitch v-model="state.is_active" aria-label="Active" />
    </UFormField>
    <UAlert
      v-if="statusEffect"
      :color="statusEffect.color"
      variant="subtle"
      icon="i-lucide-info"
      :title="statusEffect.title"
      :description="statusEffect.description"
      data-testid="permission-status-effect"
    />
  </AppFormDialog>
</template>
