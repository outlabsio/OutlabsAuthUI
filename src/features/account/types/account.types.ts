export type UpdateCurrentUserInput = {
  email?: string
  first_name?: string
  last_name?: string
}

export type ChangeCurrentUserPasswordInput = {
  current_password: string
  new_password: string
}
