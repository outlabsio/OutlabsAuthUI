<script setup lang="ts">
import { appSection, type AppSectionId } from '~/utils/capabilities'

// Detail-page back link for UDashboardNavbar's leading slot, next to the sidebar collapse
// control (F-216). The fallback is the owning section's list (`section` reads its route and
// label from APP_SECTIONS; `to` / `label` override them). When the previous history entry is
// another console page, it goes back there instead (useBackNavigation).
const props = defineProps<{
  section?: AppSectionId
  to?: string
  label?: string
}>()

const fallbackTo = computed(() => props.to ?? (props.section ? appSection(props.section).to : '/app/dashboard'))
const fallbackLabel = computed(() => props.label ?? (props.section ? appSection(props.section).label : 'Dashboard'))

const { href, label: accessibleLabel, onClick } = useBackNavigation(fallbackTo, fallbackLabel)
</script>

<template>
  <UTooltip :text="accessibleLabel">
    <UButton
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      :to="href"
      :aria-label="accessibleLabel"
      @click="onClick"
    />
  </UTooltip>
</template>
