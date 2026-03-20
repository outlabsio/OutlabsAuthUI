export type DefaultChildTypes = {
  structural: string[]
  access_group: string[]
}

export type EntityTypeConfig = {
  allowed_root_types: string[]
  default_child_types: DefaultChildTypes
  updated_at?: string | null
}

export type UpdateEntityTypeConfigInput = {
  allowed_root_types?: string[]
  default_child_types?: DefaultChildTypes
}
