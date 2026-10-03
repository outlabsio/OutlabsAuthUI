<script setup lang="ts">
import type { AbacScopeKind } from '~/types/abac'

// ABAC editor for a role or a permission: conditions arranged as the engine evaluates them
// (ungrouped conditions, then each AND/OR group), with add / edit / move / delete when
// `canManage`. When it is not, `readOnlyReason` says why instead of silently hiding controls.
const props = defineProps<{
  kind: AbacScopeKind
  id: string
  canManage: boolean
  readOnlyReason?: string | null
}>()

const {
  scope,
  explainer,
  loading,
  failed,
  loadErrorMessage,
  retry,
  groups,
  sections,
  isEmpty,
  issueCount,
  conditionFormOpen,
  editingCondition,
  conditionDefaultGroupId,
  openAddCondition,
  groupFormOpen,
  editingGroup,
  openAddGroup,
  conditionMenu,
  groupMenu,
  deleteItem,
  deleteSummary
} = useAbacConditions({ kind: () => props.kind, id: () => props.id, canManage: () => props.canManage })
</script>

<template>
  <div class="space-y-4">
    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      title="How conditions are evaluated"
      :description="explainer"
    />

    <UAlert
      v-if="!canManage && readOnlyReason"
      color="neutral"
      variant="outline"
      icon="i-lucide-lock"
      title="Read-only"
      :description="readOnlyReason"
    />

    <div
      v-if="loading"
      class="space-y-2"
      aria-busy="true"
      aria-label="Loading conditions"
    >
      <USkeleton class="h-16 w-full" />
      <USkeleton class="h-16 w-full" />
    </div>

    <UAlert
      v-else-if="failed"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Could not load conditions"
      :description="loadErrorMessage"
      :actions="[{ label: 'Retry', color: 'neutral', variant: 'outline', onClick: retry }]"
    />

    <template v-else>
      <UAlert
        v-if="issueCount"
        color="error"
        variant="subtle"
        icon="i-lucide-octagon-alert"
        :title="issueCount === 1 ? '1 condition cannot be evaluated' : `${issueCount} conditions cannot be evaluated`"
        description="They never pass until they are fixed or deleted."
      />

      <div v-if="canManage && !isEmpty" class="flex flex-wrap justify-end gap-2">
        <UButton
          icon="i-lucide-plus"
          label="Add group"
          color="neutral"
          variant="outline"
          size="sm"
          @click="openAddGroup"
        />
        <UButton
          icon="i-lucide-plus"
          label="Add condition"
          size="sm"
          @click="openAddCondition()"
        />
      </div>

      <UEmpty
        v-if="isEmpty"
        icon="i-lucide-list-filter"
        title="No conditions"
        :description="kind === 'roles' ? 'This role grants its permissions without attribute checks.' : 'Holders get this permission without attribute checks.'"
        :actions="canManage ? [
          { label: 'Add condition', icon: 'i-lucide-plus', onClick: () => openAddCondition() },
          { label: 'Add group', icon: 'i-lucide-plus', color: 'neutral', variant: 'outline', onClick: openAddGroup }
        ] : undefined"
      />

      <template v-else>
        <section
          v-for="section in sections"
          :key="section.key"
          :aria-label="section.title"
          class="rounded-lg border border-default"
          data-testid="abac-section"
        >
          <header class="flex items-start justify-between gap-3 border-b border-default px-4 py-3">
            <div class="min-w-0 space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-sm font-semibold text-highlighted">
                  {{ section.title }}
                </h3>
                <UBadge
                  v-if="section.operator"
                  :label="section.operator"
                  color="neutral"
                  variant="outline"
                  size="sm"
                />
                <span class="text-sm text-muted">{{ section.rule }}</span>
              </div>
              <p v-if="section.description" class="text-sm text-muted">
                {{ section.description }}
              </p>
            </div>
            <UDropdownMenu
              v-if="canManage && section.group"
              :items="groupMenu(section.group, section.index)"
              :content="{ align: 'end' }"
            >
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="ghost"
                size="sm"
                :aria-label="`Actions for ${section.title.toLowerCase()}`"
              />
            </UDropdownMenu>
          </header>

          <ul v-if="section.rows.length" class="divide-y divide-default">
            <li
              v-for="row in section.rows"
              :key="row.condition.id"
              class="flex items-start justify-between gap-3 px-4 py-3"
              data-testid="abac-condition"
            >
              <div class="min-w-0 flex-1 space-y-1">
                <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <code class="font-mono break-all text-highlighted">{{ row.condition.attribute }}</code>
                  <span class="text-muted">{{ row.operatorLabel }}</span>
                  <template v-if="row.value.kind === 'list'">
                    <UBadge
                      v-for="(item, i) in row.value.items"
                      :key="`${i}-${item}`"
                      :label="item"
                      color="neutral"
                      variant="subtle"
                      class="font-mono"
                    />
                  </template>
                  <code v-else-if="row.value.kind === 'text'" class="font-mono break-all text-highlighted">{{ row.value.quoted ? `"${row.value.text}"` : row.value.text }}</code>
                </p>
                <p v-if="row.condition.description" class="text-sm text-muted">
                  {{ row.condition.description }}
                </p>
                <p
                  v-if="row.issue"
                  class="flex items-start gap-1.5 text-sm"
                  :class="row.issue.severity === 'error' ? 'text-error' : 'text-warning'"
                >
                  <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0" />
                  <span>{{ row.issue.message }}</span>
                </p>
              </div>
              <UDropdownMenu v-if="canManage" :items="conditionMenu(row.condition)" :content="{ align: 'end' }">
                <UButton
                  icon="i-lucide-ellipsis-vertical"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  :aria-label="`Actions for condition ${row.condition.attribute}`"
                />
              </UDropdownMenu>
            </li>
          </ul>
          <div v-else class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <p class="text-sm text-muted">
              No conditions yet. An empty group always passes.
            </p>
            <UButton
              v-if="canManage && section.group"
              icon="i-lucide-plus"
              label="Add condition"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="openAddCondition(section.group.id)"
            />
          </div>
        </section>
      </template>
    </template>

    <AppAbacConditionForm
      v-model:open="conditionFormOpen"
      :scope="scope"
      :condition="editingCondition"
      :default-group-id="conditionDefaultGroupId"
      :groups="groups"
    />

    <AppAbacGroupForm v-model:open="groupFormOpen" :scope="scope" :group="editingGroup" />

    <AppConfirmDialog v-model:open="deleteItem.open" v-bind="deleteItem.dialog" @confirm="deleteItem.confirm">
      <p class="text-sm break-all text-highlighted" :class="{ 'font-mono': deleteItem.target?.type === 'condition' }">
        {{ deleteSummary }}
      </p>
    </AppConfirmDialog>
  </div>
</template>
