import { apiClient } from '@/lib/api/client'

export function requestPhoneVerification() {
  return apiClient.post<void>('/users/me/phone/request-code')
}
