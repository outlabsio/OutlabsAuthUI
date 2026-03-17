import { z } from 'zod'

const entityClassSchema = z.enum(['structural', 'access_group'])
const entityStatusSchema = z.enum(['active', 'inactive', 'archived'])
const maxMembersFieldSchema = z
  .string()
  .optional()
  .refine((value) => {
    if (!value || !value.trim()) {
      return true
    }

    const parsedValue = Number(value)
    return Number.isInteger(parsedValue) && parsedValue > 0
  }, 'Max members must be a whole number greater than zero.')

function isValidWindow(validFrom?: string, validUntil?: string) {
  if (!validFrom || !validUntil) {
    return true
  }

  return new Date(validUntil).getTime() >= new Date(validFrom).getTime()
}

export const createEntityFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'System name is required.')
      .max(100, 'System name must be 100 characters or fewer.'),
    displayName: z
      .string()
      .trim()
      .min(1, 'Display name is required.')
      .max(200, 'Display name must be 200 characters or fewer.'),
    slug: z
      .string()
      .trim()
      .min(1, 'Slug is required.')
      .max(100, 'Slug must be 100 characters or fewer.'),
    description: z
      .string()
      .trim()
      .max(500, 'Description must be 500 characters or fewer.')
      .optional(),
    entityClass: entityClassSchema,
    entityType: z
      .string()
      .trim()
      .min(1, 'Entity type is required.')
      .max(50, 'Entity type must be 50 characters or fewer.'),
    status: entityStatusSchema,
    validFrom: z.string().optional(),
    validUntil: z.string().optional(),
    allowedChildClasses: z.array(entityClassSchema).default([]),
    allowedChildTypes: z.string().optional(),
    maxMembers: maxMembersFieldSchema,
  })
  .refine(
    (value) => isValidWindow(value.validFrom, value.validUntil),
    {
      message: 'Valid until must be after valid from.',
      path: ['validUntil'],
    }
  )

export type CreateEntityFormValues = z.infer<typeof createEntityFormSchema>

export const updateEntityFormSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, 'Display name is required.')
      .max(200, 'Display name must be 200 characters or fewer.'),
    description: z
      .string()
      .trim()
      .max(500, 'Description must be 500 characters or fewer.')
      .optional(),
    status: entityStatusSchema,
    validFrom: z.string().optional(),
    validUntil: z.string().optional(),
    allowedChildClasses: z.array(entityClassSchema).default([]),
    allowedChildTypes: z.string().optional(),
    maxMembers: maxMembersFieldSchema,
  })
  .refine(
    (value) => isValidWindow(value.validFrom, value.validUntil),
    {
      message: 'Valid until must be after valid from.',
      path: ['validUntil'],
    }
  )

export type UpdateEntityFormValues = z.infer<typeof updateEntityFormSchema>
