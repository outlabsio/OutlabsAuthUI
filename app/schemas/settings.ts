import { z } from 'zod'

// Entity-type config form (F-187): four type lists edited as tags. Types are normalised (trimmed,
// lower-case, de-duplicated) on submit. outlabs-auth requires one root type across the two
// classes; a class may have no default child types (the per-class rule was the console's own).
export const normalizeTypeList = (types: readonly string[]) => [...new Set(types.map(t => t.trim().toLowerCase()).filter(Boolean))]

const typeList = z.array(z.string().trim().min(1).max(64, 'Keep type names under 64 characters.'))

export const entityTypeConfigSchema = z
  .object({
    structuralRootTypes: typeList,
    accessGroupRootTypes: typeList,
    structuralChildTypes: typeList,
    accessGroupChildTypes: typeList
  })
  .superRefine((v, ctx) => {
    if (normalizeTypeList(v.structuralRootTypes).length === 0 && normalizeTypeList(v.accessGroupRootTypes).length === 0) {
      ctx.addIssue({ code: 'custom', path: ['structuralRootTypes'], message: 'Allow at least one root type, structural or access group.' })
    }
  })

export type EntityTypeConfigSchema = z.output<typeof entityTypeConfigSchema>
