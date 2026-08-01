import type { CreateUserInput, User } from '@/features/users/types/users.types'
import { apiClient } from '@/lib/api/client'

export function createUser(input: CreateUserInput) {
  return apiClient.post<User>('/users/', {
    body: input,
  })
}
