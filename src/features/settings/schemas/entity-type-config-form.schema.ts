import { z } from 'zod'

export const entityTypeConfigFormSchema = z.object({
  structuralRootTypesText: z.string().trim(),
  accessGroupRootTypesText: z.string().trim(),
  structuralChildTypesText: z.string().trim().min(1, 'Add at least one structural child type.'),
  accessGroupChildTypesText: z.string().trim().min(1, 'Add at least one access-group child type.'),
}).refine(
  (value) =>
    value.structuralRootTypesText.length > 0 ||
    value.accessGroupRootTypesText.length > 0,
  {
    message: 'Configure at least one root entity type across the two classes.',
    path: ['structuralRootTypesText'],
  }
)

export type EntityTypeConfigFormValues = z.infer<typeof entityTypeConfigFormSchema>
