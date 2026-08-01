import type {
  CreateEntityInput,
  Entity,
} from '@/features/entities/types/entities.types'
import { apiClient } from '@/lib/api/client'

export function createEntity(input: CreateEntityInput) {
  return apiClient.post<Entity>('/entities', {
    body: input,
  })
}
