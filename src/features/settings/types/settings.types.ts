export type DefaultChildTypes = {
  structural: string[]
  access_group: string[]
}

export type AllowedRootTypes = {
  structural: string[]
  access_group: string[]
}

export type EntityTypeConfig = {
  allowed_root_types: AllowedRootTypes
  default_child_types: DefaultChildTypes
  updated_at?: string | null
}

export type UpdateEntityTypeConfigInput = {
  allowed_root_types?: AllowedRootTypes
  default_child_types?: DefaultChildTypes
}
