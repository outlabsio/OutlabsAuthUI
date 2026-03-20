import { z } from 'zod'

export const entityTypeConfigFormSchema = z.object({
  allowedRootTypesText: z.string().trim().min(1, 'At least one root entity type is required.'),
  structuralChildTypesText: z.string().trim().min(1, 'Add at least one structural child type.'),
  accessGroupChildTypesText: z.string().trim().min(1, 'Add at least one access-group child type.'),
})

export type EntityTypeConfigFormValues = z.infer<typeof entityTypeConfigFormSchema>
