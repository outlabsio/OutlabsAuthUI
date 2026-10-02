// The entity-type configuration (GET/PUT /config/entity-types) behind Settings.

export type EntityTypeGroups = {
  structural: string[]
  access_group: string[]
}

export type EntityTypeConfig = {
  allowed_root_types: EntityTypeGroups
  default_child_types: EntityTypeGroups
  updated_at?: string | null
}

// PUT /config/entity-types (superuser). Same shape minus the server-set updated_at. Each group
// is optional: a group left out keeps its stored value, a group sent is replaced whole.
export type EntityTypeConfigUpdate = {
  allowed_root_types?: EntityTypeGroups
  default_child_types?: EntityTypeGroups
}
