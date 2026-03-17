import { useEffect, useMemo, useState } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, type Resolver, useForm } from 'react-hook-form'
import { CalendarClock, Layers3 } from 'lucide-react'

import { AppDateTimePicker } from '@/components/app/app-date-time-picker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useCreateEntityMutation } from '@/features/entities/hooks/use-create-entity-mutation'
import { useUpdateEntityMutation } from '@/features/entities/hooks/use-update-entity-mutation'
import {
  createEntityFormSchema,
  type CreateEntityFormValues,
  updateEntityFormSchema,
  type UpdateEntityFormValues,
} from '@/features/entities/schemas/entity-form.schema'
import type { Entity, EntityClassValue } from '@/features/entities/types/entities.types'
import { formatEntityToken } from '@/features/entities/utils/entity-display'
import { getApiErrorMessage } from '@/lib/api/errors'

type EntityFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  entity?: Entity | null
  parentEntity?: Entity | null
  onSuccess?: (entity: Entity) => void
}

type EntityFormValues = CreateEntityFormValues & Partial<UpdateEntityFormValues>

const entityStatusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Archived', value: 'archived' },
] as const

const entityClassOptions = [
  { label: 'Structural', value: 'structural' },
  { label: 'Access group', value: 'access_group' },
] satisfies Array<{ label: string; value: EntityClassValue }>

function slugifyValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16)
}

function toIsoValue(value?: string) {
  return value ? new Date(value).toISOString() : null
}

function parseAllowedChildTypes(value?: string) {
  return (value ?? '')
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseMaxMembers(value?: string) {
  if (!value || !value.trim()) {
    return null
  }

  return Number(value)
}

function getCreateDefaults(parentEntity?: Entity | null): EntityFormValues {
  return {
    name: '',
    displayName: '',
    slug: '',
    description: '',
    entityClass: parentEntity?.entity_class ?? 'structural',
    entityType: '',
    status: 'active',
    validFrom: '',
    validUntil: '',
    allowedChildClasses: parentEntity?.allowed_child_classes ?? [],
    allowedChildTypes: parentEntity?.allowed_child_types?.join(', ') ?? '',
    maxMembers:
      parentEntity?.max_members != null ? String(parentEntity.max_members) : '',
  }
}

function getUpdateDefaults(entity?: Entity | null): EntityFormValues {
  return {
    name: entity?.name ?? '',
    displayName: entity?.display_name ?? '',
    slug: entity?.slug ?? '',
    entityClass: entity?.entity_class ?? 'structural',
    entityType: entity?.entity_type ?? '',
    description: entity?.description ?? '',
    status: entity?.status ?? 'active',
    validFrom: toDateTimeLocalValue(entity?.valid_from),
    validUntil: toDateTimeLocalValue(entity?.valid_until),
    allowedChildClasses: entity?.allowed_child_classes ?? [],
    allowedChildTypes: entity?.allowed_child_types?.join(', ') ?? '',
    maxMembers: entity?.max_members != null ? String(entity.max_members) : '',
  }
}

export function EntityFormDialog({
  open,
  onOpenChange,
  mode,
  entity,
  parentEntity,
  onSuccess,
}: EntityFormDialogProps) {
  const createEntityMutation = useCreateEntityMutation()
  const updateEntityMutation = useUpdateEntityMutation()
  const [slugTouched, setSlugTouched] = useState(false)
  const resolver = (
    mode === 'create'
      ? zodResolver(createEntityFormSchema)
      : zodResolver(updateEntityFormSchema)
  ) as Resolver<EntityFormValues>

  const form = useForm<EntityFormValues>({
    resolver,
    defaultValues:
      mode === 'create' ? getCreateDefaults(parentEntity) : getUpdateDefaults(entity),
  })

  const nameValue = form.watch('name')
  const displayNameValue = form.watch('displayName')
  const isPending =
    createEntityMutation.isPending || updateEntityMutation.isPending
  const submitError =
    createEntityMutation.error ?? updateEntityMutation.error
  const submitErrorMessage = submitError
    ? getApiErrorMessage(
        submitError,
        mode === 'create'
          ? 'The entity could not be created.'
          : 'The entity could not be updated.'
      )
    : null

  useEffect(() => {
    if (!open) {
      return
    }

    form.reset(
      mode === 'create' ? getCreateDefaults(parentEntity) : getUpdateDefaults(entity)
    )
    setSlugTouched(false)
    createEntityMutation.reset()
    updateEntityMutation.reset()
  }, [
    createEntityMutation,
    entity,
    form,
    mode,
    open,
    parentEntity,
    updateEntityMutation,
  ])

  useEffect(() => {
    if (mode !== 'create' || slugTouched) {
      return
    }

    const source = nameValue || displayNameValue
    const nextSlug = slugifyValue(source ?? '')

    form.setValue('slug', nextSlug, {
      shouldDirty: Boolean(nextSlug),
      shouldValidate: false,
    })
  }, [displayNameValue, form, mode, nameValue, slugTouched])

  const dialogTitle =
    mode === 'create'
      ? parentEntity
        ? `Create child entity under ${parentEntity.display_name}`
        : 'Create root entity'
      : `Edit ${entity?.display_name ?? 'entity'}`

  const identityBadges = useMemo(() => {
    if (mode !== 'edit' || !entity) {
      return []
    }

    return [
      formatEntityToken(entity.entity_class),
      formatEntityToken(entity.entity_type),
      formatEntityToken(entity.status),
    ]
  }, [entity, mode])

  async function handleSubmit(values: EntityFormValues) {
    try {
      const description = values.description?.trim() || undefined
      const allowedChildTypes = parseAllowedChildTypes(values.allowedChildTypes)
      const maxMembers = parseMaxMembers(values.maxMembers)

      const nextEntity =
        mode === 'create'
          ? await createEntityMutation.mutateAsync({
              name: values.name.trim(),
              display_name: values.displayName.trim(),
              slug: values.slug.trim(),
              description,
              entity_class: values.entityClass,
              entity_type: values.entityType.trim(),
              parent_entity_id: parentEntity?.id,
              status: values.status,
              valid_from: toIsoValue(values.validFrom),
              valid_until: toIsoValue(values.validUntil),
              allowed_child_classes: values.allowedChildClasses,
              allowed_child_types: allowedChildTypes,
              max_members: maxMembers,
            })
          : await updateEntityMutation.mutateAsync({
              entityId: entity!.id,
              display_name: values.displayName.trim(),
              description,
              status: values.status,
              valid_from: toIsoValue(values.validFrom),
              valid_until: toIsoValue(values.validUntil),
              allowed_child_classes: values.allowedChildClasses,
              allowed_child_types: allowedChildTypes,
              max_members: maxMembers,
            })

      onSuccess?.(nextEntity)
      onOpenChange(false)
    } catch {
      return
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-hidden p-0 sm:max-w-3xl">
        <div className="flex max-h-[calc(100svh-2rem)] flex-col">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle className="text-2xl">{dialogTitle}</DialogTitle>
          </DialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={form.handleSubmit(handleSubmit)}
          >
            <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
              <div className="space-y-6">
                {mode === 'edit' && entity ? (
                  <section className="rounded-xl border bg-muted/20 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{entity.name}</Badge>
                      <Badge variant="outline">{entity.slug}</Badge>
                      {identityBadges.map((badge) => (
                        <Badge key={badge} variant="outline">
                          {badge}
                        </Badge>
                      ))}
                    </div>
                    {parentEntity ? (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Parent entity: {parentEntity.display_name}
                      </p>
                    ) : null}
                  </section>
                ) : null}

                {parentEntity ? (
                  <section className="rounded-xl border bg-muted/20 p-4">
                    <div className="flex items-start gap-3">
                      <Layers3 className="mt-0.5 size-4 text-muted-foreground" />
                      <div className="space-y-1">
                        <div className="font-medium">Parent scope</div>
                        <p className="text-sm text-muted-foreground">
                          This entity will be created under {parentEntity.display_name}.
                        </p>
                      </div>
                    </div>
                  </section>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  {mode === 'create' ? (
                    <div className="space-y-2">
                      <Label htmlFor="entity-name">System name</Label>
                      <Input
                        id="entity-name"
                        disabled={isPending}
                        placeholder="acme-west"
                        {...form.register('name')}
                      />
                      <FieldError errors={[form.formState.errors.name]} />
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <Label htmlFor="entity-display-name">Display name</Label>
                    <Input
                      id="entity-display-name"
                      disabled={isPending}
                      placeholder="Acme West"
                      {...form.register('displayName')}
                    />
                    <FieldError errors={[form.formState.errors.displayName]} />
                  </div>

                  {mode === 'create' ? (
                    <div className="space-y-2">
                      <Label htmlFor="entity-slug">Slug</Label>
                      <Input
                        id="entity-slug"
                        disabled={isPending}
                        placeholder="acme-west"
                        {...form.register('slug', {
                          onChange: () => {
                            setSlugTouched(true)
                          },
                        })}
                      />
                      <FieldError errors={[form.formState.errors.slug]} />
                    </div>
                  ) : null}

                  {mode === 'create' ? (
                    <div className="space-y-2">
                      <Label htmlFor="entity-type">Entity type</Label>
                      <Input
                        id="entity-type"
                        disabled={isPending}
                        placeholder="department"
                        {...form.register('entityType')}
                      />
                      <FieldError errors={[form.formState.errors.entityType]} />
                    </div>
                  ) : null}

                  {mode === 'create' ? (
                    <div className="space-y-2">
                      <Label>Entity class</Label>
                      <Controller
                        control={form.control}
                        name="entityClass"
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                            disabled={isPending}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Choose a class" />
                            </SelectTrigger>
                            <SelectContent>
                              {entityClassOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      <FieldError errors={[form.formState.errors.entityClass]} />
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Controller
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={isPending}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a status" />
                          </SelectTrigger>
                          <SelectContent>
                            {entityStatusOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <FieldError errors={[form.formState.errors.status]} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="entity-description">Description</Label>
                  <Textarea
                    id="entity-description"
                    rows={4}
                    disabled={isPending}
                    placeholder="What this entity governs, owns, or represents."
                    {...form.register('description')}
                  />
                  <FieldError errors={[form.formState.errors.description]} />
                </div>

                <section className="rounded-xl border p-4">
                  <div className="flex items-start gap-3">
                    <CalendarClock className="mt-0.5 size-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1 space-y-4">
                      <div className="space-y-1">
                        <div className="font-medium">Lifecycle window</div>
                        <p className="text-sm text-muted-foreground">
                          Optional validity dates for activating or sunsetting this entity.
                        </p>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="entity-valid-from">Valid from</Label>
                          <Controller
                            control={form.control}
                            name="validFrom"
                            render={({ field }) => (
                              <AppDateTimePicker
                                id="entity-valid-from"
                                value={field.value ?? ''}
                                onChange={field.onChange}
                                disabled={isPending}
                                placeholder="Pick a start date"
                              />
                            )}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="entity-valid-until">Valid until</Label>
                          <Controller
                            control={form.control}
                            name="validUntil"
                            render={({ field }) => (
                              <AppDateTimePicker
                                id="entity-valid-until"
                                value={field.value ?? ''}
                                onChange={field.onChange}
                                disabled={isPending}
                                placeholder="Pick an end date"
                              />
                            )}
                          />
                          <FieldError errors={[form.formState.errors.validUntil]} />
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border p-4">
                  <div className="space-y-1">
                    <div className="font-medium">Governance controls</div>
                    <p className="text-sm text-muted-foreground">
                      Set optional child restrictions and member limits for this entity.
                    </p>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <div className="space-y-3">
                      <Label>Allowed child classes</Label>
                      <Controller
                        control={form.control}
                        name="allowedChildClasses"
                        render={({ field }) => (
                          <div className="grid gap-3 rounded-xl border bg-muted/20 p-4">
                            {entityClassOptions.map((option) => {
                              const isChecked = field.value?.includes(option.value) ?? false

                              return (
                                <label
                                  key={option.value}
                                  className="flex items-start gap-3 text-sm"
                                >
                                  <Checkbox
                                    checked={isChecked}
                                    disabled={isPending}
                                    onCheckedChange={(checked) => {
                                      const nextValue = checked
                                        ? [...(field.value ?? []), option.value]
                                        : (field.value ?? []).filter(
                                            (value) => value !== option.value
                                          )

                                      field.onChange(nextValue)
                                    }}
                                    className="mt-0.5"
                                  />
                                  <span>{option.label}</span>
                                </label>
                              )
                            })}
                          </div>
                        )}
                      />
                    </div>

                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="entity-allowed-child-types">
                          Allowed child types
                        </Label>
                        <Textarea
                          id="entity-allowed-child-types"
                          rows={4}
                          disabled={isPending}
                          placeholder="department, team, territory"
                          {...form.register('allowedChildTypes')}
                        />
                        <p className="text-xs text-muted-foreground">
                          Separate values with commas or line breaks.
                        </p>
                        <FieldError errors={[form.formState.errors.allowedChildTypes]} />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="entity-max-members">Max members</Label>
                        <Input
                          id="entity-max-members"
                          inputMode="numeric"
                          disabled={isPending}
                          placeholder="Unlimited"
                          {...form.register('maxMembers')}
                        />
                        <FieldError errors={[form.formState.errors.maxMembers]} />
                      </div>
                    </div>
                  </div>
                </section>

                {submitErrorMessage ? (
                  <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                    {submitErrorMessage}
                  </div>
                ) : null}
              </div>
            </div>

            <DialogFooter className="border-t px-6 py-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? mode === 'create'
                    ? 'Creating…'
                    : 'Saving…'
                  : mode === 'create'
                    ? 'Create entity'
                    : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
