<script setup lang="ts">
import { listSummary } from '~/utils/pagination'

// List footer: the true total (announced politely to screen readers when it changes) and a
// UPagination bound to it. Every paginated list shows both, so nothing is ever capped
// silently. The pagination is a named <nav>, so two lists on one page stay distinguishable.
//   <AppListPagination v-model:page="page" :total="total" :page-size="pageSize" noun="permission" />
const page = defineModel<number>('page', { required: true })

const props = withDefaults(defineProps<{
  total: number
  pageSize: number
  // Singular noun for the summary ("permission"); `plural` defaults to noun + "s".
  noun: string
  plural?: string
}>(), {
  plural: undefined
})

const pluralNoun = computed(() => props.plural ?? `${props.noun}s`)
const summary = computed(() => listSummary(page.value, props.pageSize, props.total, props.noun, pluralNoun.value))
const navLabel = computed(() => `${pluralNoun.value.charAt(0).toUpperCase()}${pluralNoun.value.slice(1)} pages`)
</script>

<template>
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <p class="text-sm text-muted" role="status">
      {{ summary }}
    </p>
    <UPagination
      v-if="total > pageSize"
      v-model:page="page"
      :total="total"
      :items-per-page="pageSize"
      :aria-label="navLabel"
    />
  </div>
</template>
