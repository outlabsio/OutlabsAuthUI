<script setup lang="ts">
// A component importing the transport by a relative path, and defining its own query.
import * as api from '../api/client' // expect-error: @typescript-eslint/no-restricted-imports
import { defineQueryOptions } from '@pinia/colada-nuxt' // expect-error: @typescript-eslint/no-restricted-imports

const options = defineQueryOptions({ key: ['me'], query: () => api.apiClient.get('/users/me') })
const detail = useInfiniteQuery({ key: ['audit'] }) // expect-error: no-restricted-globals
</script>

<template>
  <div>{{ options }} {{ detail }}</div>
</template>
