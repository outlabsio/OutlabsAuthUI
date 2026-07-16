import { useEffect, useMemo, useRef } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { Shield } from 'lucide-react'

import { AppFormField } from '@/components/app/app-form-field'
import { AppInfoPopover } from '@/components/app/app-info-popover'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { buildEntityOptions } from '@/features/entities/utils/build-entity-options'
import type { Entity } from '@/features/entities/types/entities.types'
import { useCreateUserMutation } from '@/features/users/hooks/use-create-user-mutation'
import {
  type CreateUserFormValues,
  createUserSchema,
} from '@/features/users/schemas/create-user.schema'
import type { User } from '@/features/users/types/users.types'
import { getApiErrorMessage } from '@/lib/api/errors'

type CreateUserDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  entities: Entity[]
  entityHierarchyEnabled: boolean
  canCreateSuperusers: boolean
  onCreated?: (user: User) => void
}

export function CreateUserDialog({
  open,
  onOpenChange,
  entities,
  entityHierarchyEnabled,
  canCreateSuperusers,
  onCreated,
}: CreateUserDialogProps) {
  const createUserMutation = useCreateUserMutation()
  const previousOpenRef = useRef(open)
  const form = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      password: '',
      confirmPassword: '',
      rootEntityId: '',
      isSuperuser: false,
    },
  })

  useEffect(() => {
    const wasOpen = previousOpenRef.current

    if (wasOpen && !open) {
      form.reset()
      createUserMutation.reset()
    }

    previousOpenRef.current = open
  }, [createUserMutation, form, open])

  const rootEntityId = form.watch('rootEntityId')
  const submitError = createUserMutation.error
    ? getApiErrorMessage(createUserMutation.error, 'Unable to create the user.')
    : null
  const rootEntityOptions = useMemo(
    () => buildEntityOptions(entities).filter((option) => option.isTopLevel),
    [entities]
  )
  const selectedRootEntity =
    rootEntityOptions.find((option) => option.id === rootEntityId) ?? null

  const emailField = form.register('email')
  const firstNameField = form.register('firstName')
  const lastNameField = form.register('lastName')
  const passwordField = form.register('password')
  const confirmPasswordField = form.register('confirmPassword')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Create user</DialogTitle>
            <AppInfoPopover label="Explain create user flow" title="Create user">
              Creates an active account with a password immediately. Prefer invite when
              the person should set their own password from email.
            </AppInfoPopover>
          </div>
        </DialogHeader>

        <form
          id="create-user-form"
          className="space-y-4"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              const user = await createUserMutation.mutateAsync({
                email: values.email,
                password: values.password,
                first_name: values.firstName?.trim() || undefined,
                last_name: values.lastName?.trim() || undefined,
                is_superuser:
                  canCreateSuperusers && values.isSuperuser ? true : undefined,
                root_entity_id:
                  entityHierarchyEnabled && values.rootEntityId
                    ? values.rootEntityId
                    : undefined,
              })
              onCreated?.(user)
              onOpenChange(false)
            } catch {
              return
            }
          })}
        >
          <AppFormField
            label="Email"
            htmlFor="create-user-email"
            errors={[form.formState.errors.email]}
          >
            <Input
              id="create-user-email"
              type="email"
              placeholder="person@example.com"
              autoComplete="off"
              aria-invalid={Boolean(form.formState.errors.email)}
              disabled={createUserMutation.isPending}
              {...emailField}
            />
          </AppFormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <AppFormField
              label="First name"
              htmlFor="create-user-first-name"
              errors={[form.formState.errors.firstName]}
            >
              <Input
                id="create-user-first-name"
                placeholder="First name"
                autoComplete="off"
                disabled={createUserMutation.isPending}
                {...firstNameField}
              />
            </AppFormField>
            <AppFormField
              label="Last name"
              htmlFor="create-user-last-name"
              errors={[form.formState.errors.lastName]}
            >
              <Input
                id="create-user-last-name"
                placeholder="Last name"
                autoComplete="off"
                disabled={createUserMutation.isPending}
                {...lastNameField}
              />
            </AppFormField>
          </div>

          <AppFormField
            label="Password"
            htmlFor="create-user-password"
            errors={[form.formState.errors.password]}
          >
            <Input
              id="create-user-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(form.formState.errors.password)}
              disabled={createUserMutation.isPending}
              {...passwordField}
            />
          </AppFormField>

          <AppFormField
            label="Confirm password"
            htmlFor="create-user-confirm-password"
            errors={[form.formState.errors.confirmPassword]}
          >
            <Input
              id="create-user-confirm-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(form.formState.errors.confirmPassword)}
              disabled={createUserMutation.isPending}
              {...confirmPasswordField}
            />
          </AppFormField>

          {canCreateSuperusers ? (
            <Controller
              name="isSuperuser"
              control={form.control}
              render={({ field }) => (
                <section className="rounded-md border bg-muted/30 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 gap-3">
                      <Shield className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="space-y-1">
                        <Label
                          id="create-user-superuser-label"
                          htmlFor="create-user-superuser"
                          className="font-medium"
                        >
                          Superuser access
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Platform-wide administrative access outside role scope.
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="create-user-superuser"
                      checked={Boolean(field.value)}
                      onCheckedChange={field.onChange}
                      disabled={createUserMutation.isPending}
                      aria-labelledby="create-user-superuser-label"
                      aria-label="Create as superuser"
                    />
                  </div>
                </section>
              )}
            />
          ) : null}

          {entityHierarchyEnabled ? (
            <Controller
              name="rootEntityId"
              control={form.control}
              render={({ field, fieldState }) => (
                <AppFormField
                  label="Root organization"
                  htmlFor="create-user-root-entity"
                  description="Optional. Assigns the account to a top-level organization, not a nested region or office."
                  errors={[fieldState.error]}
                >
                  <Combobox
                    items={rootEntityOptions}
                    itemToStringValue={(item) =>
                      item
                        ? `${item.title} ${item.entityTypeLabel} ${item.entityClassLabel}`
                        : ''
                    }
                    value={selectedRootEntity}
                    onValueChange={(value) => {
                      field.onChange(value?.id ?? '')
                    }}
                    disabled={createUserMutation.isPending}
                  >
                    <ComboboxInput
                      id="create-user-root-entity"
                      placeholder="Search root organizations"
                      className="w-full"
                      showClear
                    />
                    <ComboboxContent align="start">
                      <ComboboxEmpty>No root organizations found.</ComboboxEmpty>
                      <ComboboxList>
                        {(option) => (
                          <ComboboxItem
                            key={option.id}
                            value={option}
                            className="items-start py-2.5"
                          >
                            <div className="flex min-w-0 flex-col gap-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{option.title}</span>
                                <Badge variant="outline">{option.entityTypeLabel}</Badge>
                              </div>
                            </div>
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                </AppFormField>
              )}
            />
          ) : null}

          {submitError ? <FieldError>{submitError}</FieldError> : null}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createUserMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-user-form"
            disabled={createUserMutation.isPending}
          >
            {createUserMutation.isPending ? 'Creating...' : 'Create user'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
