<script setup lang="ts">
// A service account named by its record (display only; logic in useServiceAccountLabel), linked
// to its page. `entity-id` is the entity the account is anchored at. It wraps anywhere, like
// AppUserLabel, so a long name never widens a narrow table column.
const props = defineProps<{ accountId: string, entityId: string }>()
const accountId = computed(() => props.accountId)
const entityId = computed(() => props.entityId)

const { label, to, title } = useServiceAccountLabel(accountId, entityId)
</script>

<template>
  <ULink
    :to="to"
    :title="title"
    class="wrap-anywhere text-sm text-default hover:underline"
  >
    {{ label }}
  </ULink>
</template>
