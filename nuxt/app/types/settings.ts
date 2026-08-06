// Ported from the React settings feature (src/features/settings/types).

export type EntityTypeGroups = {
  structural: string[]
  access_group: string[]
}

export type EntityTypeConfig = {
  allowed_root_types: EntityTypeGroups
  default_child_types: EntityTypeGroups
  updated_at?: string | null
}
