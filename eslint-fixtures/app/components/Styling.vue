<script setup lang="ts">
const on = ref(true)
const size = ref<'md' | 'xl'>('md')
const width = 'sm:max-w-3xl'
const n = 12
const badge = 'text-emerald-500 font-medium' // expect-error: console/no-raw-tailwind
const allowed = 'text-muted bg-elevated border-default text-error ring-primary sm:max-w-2xl'
</script>

<template>
  <div class="max-w-[260px] text-red-500 bg-white">{{ badge }} {{ allowed }}</div> <!-- expect-error: console/no-raw-tailwind -->
  <div :class="['h-[32rem]', { 'dark:text-blue-400': on }]" /> <!-- expect-error: console/no-raw-tailwind -->
  <div class="lg:grid-cols-[320px_1fr] data-[state=open]:bg-muted [&>svg]:size-4" /> <!-- expect-error: console/no-raw-tailwind -->
  <div class="[mask-type:luminance] bg-(--brand)" /> <!-- expect-error: console/no-raw-tailwind -->
  <div :class="`w-[${n}px] data-[state=${size}]:bg-muted`" /> <!-- expect-error: console/no-raw-tailwind -->
  <div class="text-primary-500 bg-error-50/40" /> <!-- expect-error: console/no-raw-tailwind -->
  <div :class="`text-${on ? 'primary' : 'muted'} bg-primary/10 ring-error`" />
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-highlighted bg-default" />
  <div style="color: red" /> <!-- expect-error: vue/no-restricted-static-attribute -->
  <div :style="{ width: '10rem' }" /> <!-- expect-error: vue/no-restricted-v-bind -->
  <UCard :ui="{ root: 'p-4' }" /> <!-- expect-error: console/ui-allowlist -->
  <UButton ui="rounded-full" /> <!-- expect-error: console/ui-allowlist -->
  <UModal :ui="{ content: 'max-w-lg p-4' }" /> <!-- expect-error: console/ui-allowlist -->
  <UModal :ui="{ overlay: 'bg-black/50' }" /> <!-- expect-error: console/ui-allowlist, console/no-raw-tailwind -->
  <USlideover :ui="slideoverUi" /> <!-- expect-error: console/ui-allowlist -->
  <u-dashboard-navbar :ui="{ right: 'gap-3' }" /> <!-- expect-error: console/ui-allowlist -->
  <USlideover :ui="{ content: width }" /> <!-- expect-error: console/ui-allowlist -->
  <UModal :ui="{ content: on ? 'sm:max-w-3xl' : 'max-w-lg p-8' }" /> <!-- expect-error: console/ui-allowlist -->
  <UButton v-bind="{ ui: { base: 'px-1' }, label: 'Spread' }" /> <!-- expect-error: console/ui-allowlist -->
  <UModal :ui="{ content: 'sm:max-w-2xl' }" />
  <UModal :ui="{ content: size === 'xl' ? 'sm:max-w-3xl' : undefined }" />
  <USlideover :ui="{ content: on && 'max-w-md' }" />
  <UButton v-bind="{ label: 'Bound', color: 'neutral' }" />
  <UDashboardPanel id="fixture" :ui="{ body: 'lg:py-12' }" />
  <UDashboardSidebar :ui="{ footer: 'lg:border-t lg:border-default' }" />
</template>

<style>/* expect-error: vue/no-restricted-block */
.fixture { color: red }
</style>
