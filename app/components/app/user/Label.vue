<script setup lang="ts">
// An account named by its email (display only; logic in useUserLabel): a link to its detail
// when the admin can open it, "You" for the admin themself. `subject-id` is the account whose
// history the label sits in. It wraps anywhere, so a long email in a narrow table column (the
// Audit and key inventory phone lines) breaks instead of widening the table.
const props = defineProps<{ userId: string, subjectId?: string }>()
const userId = computed(() => props.userId)
const subjectId = computed(() => props.subjectId)

const { label, to, title } = useUserLabel(userId, subjectId)
</script>

<template>
  <ULink
    v-if="to"
    :to="to"
    :title="title"
    class="wrap-anywhere font-medium text-default hover:underline"
  >
    {{ label }}
  </ULink>
  <span v-else :title="title" class="wrap-anywhere text-default">{{ label }}</span>
</template>
