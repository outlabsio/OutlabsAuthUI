import { z } from 'zod'
import { optionalText, requiredText, tagList } from '~/schemas/common'

// Role create and edit forms (AppRoleFormDialog). Keys follow the form's visual order, so the
// first failing field is the one focused: Type first (it decides which entity is required), then
// where the role lives, its names, description, permissions and settings.
// - role_type (global/root/entity) maps to is_global + root_entity_id + scope_entity_id on submit.
// - name is the machine slug (derived from the display name until edited); fixed after creation,
//   like the type and the owning organization or entity.
// - assignable_at_types is a list of entity types (UInputMenu-style multi-select with create);
//   the backend lowercases and dedupes it.
// - A role that is auto-assigned must be active: an inactive auto-assigned role grants nothing.

const roleSettingsShape = {
  description: optionalText(500),
  permissions: z.array(z.string()),
  status: z.enum(['active', 'inactive']),
  scope: z.enum(['hierarchy', 'entity_only']),
  is_auto_assigned: z.boolean(),
  assignable_at_types: tagList
}

function autoAssignNeedsActive(value: { status: 'active' | 'inactive', is_auto_assigned: boolean }, ctx: z.RefinementCtx) {
  if (value.is_auto_assigned && value.status !== 'active') {
    ctx.addIssue({ code: 'custom', path: ['is_auto_assigned'], message: 'An auto-assigned role must be active. Make it active or turn auto-assign off.' })
  }
}

export const createRoleSchema = z
  .object({
    role_type: z.enum(['global', 'root', 'entity']),
    root_entity_id: z.string(),
    scope_entity_id: z.string(),
    display_name: requiredText('Display name', 200),
    name: requiredText('Name', 100).regex(/^[a-z0-9_-]+$/, 'Use lowercase letters, numbers, hyphens or underscores.'),
    ...roleSettingsShape
  })
  .superRefine((value, ctx) => {
    if (value.role_type === 'root' && !value.root_entity_id) {
      ctx.addIssue({ code: 'custom', path: ['root_entity_id'], message: 'Choose the organization that owns this role.' })
    }
    if (value.role_type === 'entity' && !value.scope_entity_id) {
      ctx.addIssue({ code: 'custom', path: ['scope_entity_id'], message: 'Choose the entity where this role is defined.' })
    }
    autoAssignNeedsActive(value, ctx)
  })

export type CreateRoleSchema = z.output<typeof createRoleSchema>

// Edit: the name, type and owning organization or entity are fixed after creation.
export const updateRoleSchema = z
  .object({
    display_name: requiredText('Display name', 200),
    ...roleSettingsShape
  })
  .superRefine(autoAssignNeedsActive)

export type UpdateRoleSchema = z.output<typeof updateRoleSchema>
