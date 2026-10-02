<script setup lang="ts">
import type { Entity } from '~/types/entity'

// Governance dialog (display only; logic in useEntityGovernanceDialog): child limits for every
// entity, naming rules on a root organisation only (F-075).
const props = defineProps<{ entity: Entity, root: Entity | null, isRoot: boolean }>()
const open = defineModel<boolean>('open', { default: false })

const { state, schema, patternHelp, error, conflict, dirty, childTypesHelp, inheritedRules, onSubmit, onOverwrite, reload } = useEntityGovernanceDialog(
  computed(() => props.entity),
  computed(() => props.root),
  computed(() => props.isRoot),
  open
)
</script>

<template>
  <AppFormDialog
    ref="governanceDialog"
    v-model:open="open"
    :title="`Governance of ${entity.display_name}`"
    description="What can be created beneath this entity, and how many members it holds."
    :schema="schema"
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
      description="Advisory: shown to admins, not enforced by the server. Access groups can never hold structural entities."
    >
      <UCheckboxGroup
        v-model="state.allowedChildClasses"
        :items="ENTITY_CLASS_ITEMS"
        orientation="horizontal"
      />
    </UFormField>
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

    <template v-if="isRoot">
      <USeparator label="Naming rules for everything beneath" />
      <p class="text-xs text-muted">
        Regular expressions matched against the whole name, as the server does (Python full match). Leave empty for no rule.
      </p>
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
      <UFormField
        name="childNamingGuidance"
        label="Naming guidance"
        hint="Optional"
        help="Shown to admins when they create an entity in this organization."
      >
        <UTextarea
          v-model="state.childNamingGuidance"
          :rows="2"
          autoresize
          class="w-full"
        />
      </UFormField>
    </template>
    <UAlert
      v-else
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      :title="root ? `Naming rules are set by ${root.display_name}` : 'Naming rules are set by the organization'"
      :description="inheritedRules.length ? undefined : 'It sets none.'"
      data-testid="governance-inherited-naming"
    >
      <template v-if="inheritedRules.length" #description>
        <dl class="space-y-1">
          <div v-for="rule in inheritedRules" :key="rule.label" class="flex flex-wrap gap-x-2">
            <dt>{{ rule.label }}:</dt>
            <dd class="break-all font-mono">
              {{ rule.value }}
            </dd>
          </div>
        </dl>
      </template>
    </UAlert>
  </AppFormDialog>
</template>
