import { z } from 'zod'

// Entity-type config form — four comma-separated type lists. Kept as text; parsed to normalized
// arrays on submit. Mirrors the React rules: at least one child type per class, and at least one root
// type across the two classes.
export const parseTypeList = (text: string) => [...new Set(text.split(',').map(t => t.trim().toLowerCase()).filter(Boolean))]

export const entityTypeConfigSchema = z
  .object({
    structural_root_types: z.string(),
    access_group_root_types: z.string(),
    structural_child_types: z.string(),
    access_group_child_types: z.string()
  })
  .superRefine((v, ctx) => {
    if (parseTypeList(v.structural_child_types).length === 0) {
      ctx.addIssue({ code: 'custom', path: ['structural_child_types'], message: 'Add at least one structural child type.' })
    }
    if (parseTypeList(v.access_group_child_types).length === 0) {
      ctx.addIssue({ code: 'custom', path: ['access_group_child_types'], message: 'Add at least one access-group child type.' })
    }
    if (parseTypeList(v.structural_root_types).length === 0 && parseTypeList(v.access_group_root_types).length === 0) {
      ctx.addIssue({ code: 'custom', path: ['structural_root_types'], message: 'Configure at least one root type across the two classes.' })
    }
  })

export type EntityTypeConfigSchema = z.output<typeof entityTypeConfigSchema>
