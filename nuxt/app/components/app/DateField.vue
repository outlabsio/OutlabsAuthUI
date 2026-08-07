<script setup lang="ts">
import { CalendarDate } from '@internationalized/date'
import type { DateValue } from '@internationalized/date'

// Nuxt UI date field — a UCalendar in a popover behind a button trigger, used instead of a native
// <input type="date">. v-model is a plain 'YYYY-MM-DD' string ('' when empty); DateValue conversion
// is internal. The popover closes on select via a macrotask (setTimeout 0), not synchronously —
// closing it mid-click would unmount it before the pointer event settles, and a surrounding UModal
// would then treat the trailing event as an outside click and dismiss itself.
const model = defineModel<string>({ default: '' })
withDefaults(defineProps<{ placeholder?: string }>(), { placeholder: 'Pick a date' })

const open = ref(false)

const calendarValue = computed<DateValue | undefined>({
  get() {
    const [y, m, d] = model.value.split('-').map(Number)
    if (!y || !m || !d) return undefined
    return new CalendarDate(y, m, d)
  },
  set(value) {
    model.value = value ? `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}` : ''
    if (value) setTimeout(() => { open.value = false }, 0)
  }
})

function clear() {
  model.value = ''
  open.value = false
}
</script>

<template>
  <UPopover v-model:open="open">
    <UButton
      color="neutral"
      variant="outline"
      icon="i-lucide-calendar"
      class="w-full justify-start font-normal"
      :class="{ 'text-dimmed': !model }"
    >
      {{ model || placeholder }}
    </UButton>
    <template #content>
      <div class="p-2">
        <UCalendar v-model="calendarValue" />
        <div v-if="model" class="mt-2 flex justify-end border-t border-default pt-2">
          <UButton size="xs" color="neutral" variant="ghost" label="Clear" @click="clear" />
        </div>
      </div>
    </template>
  </UPopover>
</template>
