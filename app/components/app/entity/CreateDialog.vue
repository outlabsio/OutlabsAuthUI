<script setup lang="ts">
import type { Entity } from '~/types/entity'

// Create entity (display only; logic in useEntityCreateDialog, F-073/F-074). Opened by the
// workspace with the parent preselected (the selected entity, or the organisation in view).
const props = defineProps<{ parentId: string | null }>()
const emit = defineEmits<{ created: [entity: Entity] }>()
const open = defineModel<boolean>('open', { default: false })

const {
  state,
  schema,
  error,
  placement,
  placementItems,
  canChoosePlacement,
  isRoot,
  advancedOpen,
  classItems,
  typeItems,
  typeHelp,
  childTypesHelp,
  enforcedTypes,
  onCreateType,
  namingGuidance,
  patternHelp,
  pickerRootId,
  pickerClass,
  submitDisabled,
  onSubmit,
  onInvalid
} = useEntityCreateDialog(computed(() => props.parentId), open, entity => emit('created', entity))
</script>

<template>
  <AppFormDialog
    ref="createEntityDialog"
    v-model:open="open"
    title="Create entity"
    :schema="schema"
    :state="state"
    :error="error"
    submit-label="Create entity"
    :submit-disabled="submitDisabled"
    size="lg"
    @submit="onSubmit"
    @invalid="onInvalid"
  >
    <URadioGroup
      v-if="canChoosePlacement"
      v-model="placement"
      :items="placementItems"
      variant="card"
      orientation="horizontal"
      legend="Placement"
      class="w-full"
    />
    <UFormField
      v-if="!isRoot"
      name="parentId"
      label="Parent"
      required
    >
      <AppEntityPicker
        id="entity-parent"
        v-model="state.parentId"
        aria-label="Parent"
        :root-id="pickerRootId"
        :entity-class="pickerClass"
        placeholder="Choose the parent"
      />
    </UFormField>

    <UAlert
      v-if="namingGuidance"
      color="info"
      variant="subtle"
      icon="i-lucide-book-open"
      :title="namingGuidance.title"
      :description="namingGuidance.description"
      data-testid="parent-governance"
    />

    <UFormField name="entityClass" label="Class" required>
      <URadioGroup
        v-model="state.entityClass"
        :items="classItems"
        variant="card"
        orientation="horizontal"
        class="w-full"
      />
    </UFormField>
    <UFormField
      name="entityType"
      label="Type"
      required
      :help="typeHelp"
    >
      <UInputMenu
        v-model="state.entityType"
        :items="typeItems"
        :create-item="enforcedTypes ? false : 'always'"
        open-on-click
        placeholder="e.g. region, office, team"
        class="w-full"
        @create="onCreateType"
      />
    </UFormField>

    <UFormField name="displayName" label="Display name" required>
      <UInput v-model="state.displayName" placeholder="West Coast Region" class="w-full" />
    </UFormField>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <UFormField
        name="name"
        label="System name"
        required
        help="Follows the display name until you edit it."
      >
        <UInput v-model="state.name" class="w-full font-mono" />
      </UFormField>
      <UFormField
        name="slug"
        label="Slug"
        required
        help="Unique across every organization."
      >
        <UInput v-model="state.slug" class="w-full font-mono" />
      </UFormField>
    </div>
    <UFormField name="description" label="Description" hint="Optional">
      <UTextarea
        v-model="state.description"
        :rows="2"
        autoresize
        class="w-full"
      />
    </UFormField>

    <UCollapsible v-model:open="advancedOpen" :unmount-on-hide="false" class="flex flex-col gap-4">
      <UButton
        color="neutral"
        variant="link"
        :label="advancedOpen ? 'Hide advanced options' : 'Advanced options'"
        :trailing-icon="advancedOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        class="self-start px-0"
      />
      <template #content>
        <div class="space-y-4">
          <UFormField
            name="status"
            label="Status"
            required
            description="Inactive blocks this entity's API keys and service accounts; members keep their access."
          >
            <USelect v-model="state.status" :items="ENTITY_STATUS_ITEMS" class="w-full sm:w-48" />
          </UFormField>
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
          <UFormField
            name="maxMembers"
            label="Max members"
            hint="Optional"
            help="Active members allowed at this entity. Leave empty for no limit."
          >
            <UInputNumber
              v-model="state.maxMembers"
              :min="1"
              :step="1"
              placeholder="No limit"
              class="w-full sm:w-48"
            />
          </UFormField>
          <UFormField
            name="allowedChildTypes"
            label="Allowed child types"
            hint="Optional"
            :help="childTypesHelp"
          >
            <UInputTags
              v-model="state.allowedChildTypes"
              placeholder="Add a type"
              add-on-blur
              add-on-paste
              class="w-full"
            />
          </UFormField>
          <UFormField
            name="allowedChildClasses"
            label="Allowed child classes"
            hint="Optional"
            description="Advisory: shown to admins, not enforced by the server."
          >
            <UCheckboxGroup
              v-model="state.allowedChildClasses"
              :items="ENTITY_CLASS_ITEMS"
              orientation="horizontal"
            />
          </UFormField>
          <template v-if="isRoot">
            <USeparator label="Naming rules for everything beneath" />
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <UFormField
                name="childNamePattern"
                label="System-name pattern"
                hint="Optional"
                :help="patternHelp.childNamePattern"
              >
                <UInput v-model="state.childNamePattern" class="w-full font-mono" placeholder="[a-z0-9_]+" />
              </UFormField>
              <UFormField
                name="childDisplayNamePattern"
                label="Display-name pattern"
                hint="Optional"
                :help="patternHelp.childDisplayNamePattern"
              >
                <UInput v-model="state.childDisplayNamePattern" class="w-full font-mono" placeholder=".{2,}" />
              </UFormField>
              <UFormField
                name="childSlugPattern"
                label="Slug pattern"
                hint="Optional"
                :help="patternHelp.childSlugPattern"
              >
                <UInput v-model="state.childSlugPattern" class="w-full font-mono" placeholder="[a-z0-9-]+" />
              </UFormField>
            </div>
            <UFormField name="childNamingGuidance" label="Naming guidance" hint="Optional">
              <UTextarea
                v-model="state.childNamingGuidance"
                :rows="2"
                autoresize
                class="w-full"
              />
            </UFormField>
          </template>
        </div>
      </template>
    </UCollapsible>
  </AppFormDialog>
</template>
