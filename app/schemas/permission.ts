import { z } from 'zod'
import { optionalText, requiredText, tagList } from '~/schemas/common'

// Permission create form. The backend stores a single `name` in resource:action form and derives
// resource/action from it; the form splits the two into separate inputs (combined at submit) and
// adds tags + an active flag. is_system is intentionally absent: the API rejects
// `is_system: true` (system permissions are seeder-owned), so admin-created ones are always custom.
// Each segment uses the backend's charset: lowercase letters/numbers/_/- or the "*" wildcard
// (the colon is the separator, so it's excluded).
const segment = /^(\*|[a-z0-9_-]+)$/

// Keys follow the form's visual order: the first failing field is the one focused.
export const createPermissionSchema = z.object({
  display_name: requiredText('Display name'),
  resource: requiredText('Resource', 100).regex(segment, 'Use lowercase letters, numbers, _ and - (or *).'),
  action: requiredText('Action', 100).regex(segment, 'Use lowercase letters, numbers, _ and - (or *).'),
  description: optionalText(500),
  tags: tagList,
  is_active: z.boolean()
})

export type CreatePermissionSchema = z.output<typeof createPermissionSchema>

// Permission edit (PATCH /permissions/{id}): the name (resource:action) is fixed; display name,
// description (the update API allows 1000 characters), tags and the active switch are editable.
export const updatePermissionSchema = z.object({
  display_name: requiredText('Display name', 200),
  description: optionalText(1000),
  tags: tagList,
  is_active: z.boolean()
})

export type UpdatePermissionSchema = z.output<typeof updatePermissionSchema>
