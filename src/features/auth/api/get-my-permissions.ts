import { apiClient } from '@/lib/api/client'

export function getMyPermissions() {
  return apiClient.get<string[]>('/permissions/me')
}
