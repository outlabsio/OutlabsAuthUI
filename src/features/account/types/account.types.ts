export type UpdateCurrentUserInput = {
  email?: string
  first_name?: string
  last_name?: string
  phone?: string | null
}

export type ChangeCurrentUserPasswordInput = {
  current_password: string
  new_password: string
}
