<script setup lang="ts">
// A page that reaches for server state itself instead of calling its composable.
import type { DataStateStatus } from '@pinia/colada'
import { useQueryCache } from '@pinia/colada' // expect-error: @typescript-eslint/no-restricted-imports
import { apiClient } from '~/api/client' // expect-error: @typescript-eslint/no-restricted-imports
import type { ApiError } from '~/api/client'
import { useMutation as runMutation, useFetch } from '#imports' // expect-error: @typescript-eslint/no-restricted-imports
import { useAsyncData as loadData } from '#app' // expect-error: @typescript-eslint/no-restricted-imports
import type { NuxtError } from '#app'
import { useRevokeApiKey } from '~/queries/api-keys' // expect-error: @typescript-eslint/no-restricted-imports
import { usersListQuery } from '../queries/users' // expect-error: @typescript-eslint/no-restricted-imports
import type { AbacScope } from '~/queries/abac'

const status: DataStateStatus = 'pending'
const users = useQuery({ key: ['users'], query: () => apiClient.get('/users/') }) // expect-error: no-restricted-globals
const remove = useMutation({ mutation: (id: string) => apiClient.delete(`/users/${id}`) }) // expect-error: no-restricted-globals
const settings = await $fetch('/v1/config') // expect-error: no-restricted-globals
const config = await fetch('/app-config.json') // expect-error: no-restricted-globals
const { data } = await useAsyncData('roles', () => Promise.resolve([])) // expect-error: no-restricted-globals
const viaWindow = await window.fetch('/v1/config') // expect-error: no-restricted-properties
const viaGlobal = await globalThis.fetch('/v1/config') // expect-error: no-restricted-properties
const viaNuxt = await useNuxtApp().$fetch('/v1/config') // expect-error: no-restricted-properties
const { $fetch: nuxtFetch } = useNuxtApp() // expect-error: no-restricted-properties
const cache = useQueryCache()
const revoke = useRevokeApiKey()
const imported = { runMutation, useFetch, loadData, usersListQuery, nuxtFetch }
let lastError: ApiError | NuxtError | null = null
let scope: AbacScope | null = null

// Allowed: the page calls its feature composable.
const { rows } = useUsersWorkspace()
</script>

<template>
  <div>{{ status }} {{ users }} {{ remove }} {{ settings }} {{ config }} {{ data }} {{ viaWindow }} {{ viaGlobal }} {{ viaNuxt }} {{ cache }} {{ revoke }} {{ imported }} {{ lastError }} {{ scope }} {{ rows }}</div>
</template>
