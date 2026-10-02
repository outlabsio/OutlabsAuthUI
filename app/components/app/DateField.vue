<script setup lang="ts">
import { parseDate, type DateValue } from '@internationalized/date'
import { formBusInjectionKey, formFieldInjectionKey } from '#ui/composables/useFormField'

// The console's date field: Nuxt UI's UInputDate (type the day into its month / day / year
// segments) with a trailing calendar button. Use it inside a UFormField, which labels it and
// wires its help and error text:
//
//   <UFormField name="validUntil" label="Valid until" :help="endOfDayHelp()">
//     <AppDateField v-model="state.validUntil" label="Valid until" />
//   </UFormField>
//
// v-model is a calendar day, 'YYYY-MM-DD', '' when not set, or INCOMPLETE_DAY while only some of
// the segments are typed (utils/validity.ts; `dateInput` rejects it with "Enter the whole date,
// or clear it.", so a half-typed date is never saved as "not set"). The admin's time zone decides
// what instant a day means (startOfDayIso / endOfDayIso). `label` names the segment group and the
// calendar button for assistive technology. The calendar code loads only when the
// popover first opens. The popover closes on a macrotask after a pick: closing it inside the click
// would unmount it before the pointer event settles, and the surrounding UModal would read the
// trailing event as an outside click.
const model = defineModel<string>({ default: '' })
const props = defineProps<{
  label: string
  disabled?: boolean
}>()

const calendarOpen = ref(false)

// UInputDate reports typed edits to the surrounding UForm; a calendar pick or a partly typed date
// changes the value from outside it, so report those the same way and the field re-validates.
// The bus and field keys are Nuxt UI's form-field integration point for custom inputs, imported
// from its '#ui/composables/useFormField' alias (not a documented export: recheck on upgrades;
// the dialog-kit E2E fails if calendar picks stop re-validating).
const formBus = inject(formBusInjectionKey, undefined)
const formField = inject(formFieldInjectionKey, undefined)
function reportChange() {
  const name = formField?.value?.name
  if (formBus && name) formBus.emit({ type: 'change', name })
}

// Clearing a partly typed field: UInputDate keeps its typed segments while its value stays
// empty, so Clear mounts a fresh one (a new generation).
const generation = ref(0)

// UInputDate reports a day once every segment is filled, and "no day" when a segment is emptied;
// typing only some segments of an empty field reports nothing. So when focus leaves the field
// (as it does before any click on Save), read the segments themselves: some typed and some empty
// is INCOMPLETE_DAY, none typed is ''. Not on every key: typing a date passes through partial
// states and should not flash an error on the way.
function onFocusout(event: FocusEvent) {
  const field = event.currentTarget as HTMLElement
  // Focus moving between segments or to the calendar button stays in the field; and a field
  // replaced by Clear (below) is not read again as it goes.
  if (field.contains(event.relatedTarget as Node | null) || field.dataset.generation !== String(generation.value)) return
  const segments = Array.from(field.querySelectorAll('[data-reka-date-field-segment]:not([data-reka-date-field-segment="literal"])'))
  const empty = segments.filter(segment => segment.hasAttribute('data-placeholder')).length
  // None empty: UInputDate has reported the day itself.
  if (segments.length && empty) model.value = empty === segments.length ? '' : INCOMPLETE_DAY
  reportChange()
}

const value = computed<DateValue | undefined>({
  get: () => (isDateInput(model.value) ? parseDate(model.value) : undefined),
  set: (next) => {
    // Undefined means a segment was emptied: leaving the field decides between '' and
    // INCOMPLETE_DAY.
    if (next) model.value = next.toString().slice(0, 10)
  }
})

function pick(next: DateValue | DateValue[] | undefined | null) {
  model.value = next && !Array.isArray(next) ? next.toString().slice(0, 10) : ''
  reportChange()
  setTimeout(() => {
    calendarOpen.value = false
  }, 0)
}

function clear() {
  if (model.value === INCOMPLETE_DAY) generation.value++
  model.value = ''
  reportChange()
  calendarOpen.value = false
}
</script>

<template>
  <UInputDate
    :key="generation"
    v-model="value"
    :aria-label="props.label"
    :data-generation="generation"
    :disabled="disabled"
    class="w-full"
    @focusout="onFocusout"
  >
    <template #trailing>
      <UPopover v-model:open="calendarOpen">
        <UButton
          color="neutral"
          variant="link"
          size="sm"
          icon="i-lucide-calendar"
          :aria-label="`Open calendar for ${props.label}`"
          :disabled="disabled"
          class="px-0"
        />
        <template #content>
          <div class="p-2">
            <LazyUCalendar :model-value="value" @update:model-value="pick" />
            <div v-if="model" class="mt-2 flex justify-end border-t border-default pt-2">
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                label="Clear"
                @click="clear"
              />
            </div>
          </div>
        </template>
      </UPopover>
    </template>
  </UInputDate>
</template>
