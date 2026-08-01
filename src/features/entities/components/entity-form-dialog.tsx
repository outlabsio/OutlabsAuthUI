import { useEffect, useEffectEvent, useMemo, useState } from 'react'

import { useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, type Resolver, useForm } from 'react-hook-form'
import { CalendarClock, Layers3 } from 'lucide-react'

import { AppCheckboxCards, AppRadioCards } from '@/components/app/app-choice-cards'
import { AppDateTimePicker } from '@/components/app/app-date-time-picker'
import { AppFormField } from '@/components/app/app-form-field'
import { AppTagsInput } from '@/components/app/app-tags-input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { getEntityTypeSuggestionsQueryOptions } from '@/features/entities/api/entities.query-options'
import { useCreateEntityMutation } from '@/features/entities/hooks/use-create-entity-mutation'
import { useUpdateEntityMutation } from '@/features/entities/hooks/use-update-entity-mutation'
import {
  createEntityFormSchema,
  type CreateEntityFormValues,
  updateEntityFormSchema,
  type UpdateEntityFormValues,
} from '@/features/entities/schemas/entity-form.schema'
import type { Entity } from '@/features/entities/types/entities.types'
import { formatEntityToken } from '@/features/entities/utils/entity-display'
import {
  entityClassCardOptions,
  entityClassCompactCardOptions,
} from '@/features/entities/utils/entity-class-card-options'
import { getEntityTypeConfigQueryOptions } from '@/features/settings/api/settings.query-options'
import { getApiErrorMessage } from '@/lib/api/errors'

type EntityFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  entity?: Entity | null
  parentEntity?: Entity | null
  scopeRootEntity?: Entity | null
  onSuccess?: (entity: Entity) => void
}

type EntityFormValues = CreateEntityFormValues & Partial<UpdateEntityFormValues>

const entityStatusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Archived', value: 'archived' },
] as const

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

function parseMaxMembers(value?: string) {
  if (!value || !value.trim()) {
    return null
  }

  return Number(value)
}

function uniqueEntityTypeValues(values: Array<string | null | undefined>) {
  const normalizedValues = new Map<string, string>()

  values.forEach((value) => {
    const trimmedValue = value?.trim()

    if (!trimmedValue) {
      return
    }

    const normalizedValue = trimmedValue.toLowerCase()

    if (!normalizedValues.has(normalizedValue)) {
      normalizedValues.set(normalizedValue, trimmedValue)
    }
  })

  return [...normalizedValues.values()]
}

function getCreateDefaults(parentEntity?: Entity | null): EntityFormValues {
  const defaultChildClass =
    parentEntity?.allowed_child_classes?.length === 1
      ? parentEntity.allowed_child_classes[0]
      : 'structural'
  const defaultChildType =
    parentEntity?.allowed_child_types?.length === 1
      ? parentEntity.allowed_child_types[0]
      : ''

  return {
    name: '',
    displayName: '',
    slug: '',
    description: '',
    entityClass: defaultChildClass,
    entityType: defaultChildType,
    status: 'active',
    validFrom: '',
    validUntil: '',
    allowedChildClasses: [],
    allowedChildTypes: [],
    maxMembers: '',
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
    allowedChildTypes: entity?.allowed_child_types ?? [],
    maxMembers: entity?.max_members != null ? String(entity.max_members) : '',
  }
}

export function EntityFormDialog({
  open,
  onOpenChange,
  mode,
  entity,
  parentEntity,
  scopeRootEntity,
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
  const entityClassValue = form.watch('entityClass')
  const entityTypeConfigQuery = useQuery({
    ...getEntityTypeConfigQueryOptions(),
    enabled: mode === 'create' && open,
  })
  const entityTypeSuggestionsQuery = useQuery({
    ...getEntityTypeSuggestionsQueryOptions({
      parentId: parentEntity?.id,
      entityClass: entityClassValue,
    }),
    enabled: mode === 'create' && open,
  })
  const parentAllowedChildTypeOptions = useMemo(
    () =>
      mode === 'create'
        ? uniqueEntityTypeValues(parentEntity?.allowed_child_types ?? [])
        : [],
    [mode, parentEntity?.allowed_child_types]
  )
  const rootAllowedChildTypeOptions = useMemo(() => {
    if (
      mode !== 'create' ||
      !parentEntity ||
      parentAllowedChildTypeOptions.length > 0
    ) {
      return []
    }

    return uniqueEntityTypeValues(scopeRootEntity?.allowed_child_types ?? [])
  }, [
    mode,
    parentAllowedChildTypeOptions.length,
    parentEntity,
    scopeRootEntity?.allowed_child_types,
  ])
  const parentAllowedChildClassOptions = useMemo(() => {
    if (mode !== 'create' || !parentEntity?.allowed_child_classes?.length) {
      return entityClassCardOptions
    }

    return entityClassCardOptions.filter((option) =>
      parentEntity.allowed_child_classes?.includes(option.value)
    )
  }, [mode, parentEntity?.allowed_child_classes])
  const effectiveAllowedChildTypeOptions = useMemo(
    () =>
      parentAllowedChildTypeOptions.length > 0
        ? parentAllowedChildTypeOptions
        : rootAllowedChildTypeOptions,
    [parentAllowedChildTypeOptions, rootAllowedChildTypeOptions]
  )
  const rootAllowedTypeOptions = useMemo(() => {
    if (mode !== 'create' || parentEntity) {
      return []
    }

    return uniqueEntityTypeValues(
      entityTypeConfigQuery.data?.allowed_root_types?.[entityClassValue] ?? []
    )
  }, [
    entityClassValue,
    entityTypeConfigQuery.data?.allowed_root_types,
    mode,
    parentEntity,
  ])
  const defaultChildTypeOptions = useMemo(() => {
    if (
      mode !== 'create' ||
      !parentEntity ||
      effectiveAllowedChildTypeOptions.length > 0
    ) {
      return []
    }

    return uniqueEntityTypeValues(
      entityTypeConfigQuery.data?.default_child_types?.[entityClassValue] ?? []
    )
  }, [
    effectiveAllowedChildTypeOptions.length,
    entityClassValue,
    entityTypeConfigQuery.data?.default_child_types,
    mode,
    parentEntity,
  ])
  const siblingTypeSuggestions = useMemo(
    () =>
      entityTypeSuggestionsQuery.data?.suggestions?.filter(Boolean).map((item) => item) ?? [],
    [entityTypeSuggestionsQuery.data?.suggestions]
  )
  const siblingSuggestionMap = useMemo(
    () =>
      new Map(
        siblingTypeSuggestions.map((item) => [item.entity_type.toLowerCase(), item])
      ),
    [siblingTypeSuggestions]
  )
  const siblingSuggestedTypeOptions = useMemo(
    () =>
      uniqueEntityTypeValues(
        siblingTypeSuggestions.map((item) => item.entity_type)
      ),
    [siblingTypeSuggestions]
  )
  const isPlatformConstrainedRootType = mode === 'create' && !parentEntity
  const hasConstrainedChildTypeOptions =
    effectiveAllowedChildTypeOptions.length > 0 || isPlatformConstrainedRootType
  const constrainedEntityTypeOptions = useMemo(
    () =>
      effectiveAllowedChildTypeOptions.length > 0
        ? effectiveAllowedChildTypeOptions
        : rootAllowedTypeOptions,
    [effectiveAllowedChildTypeOptions, rootAllowedTypeOptions]
  )
  const entityTypeGuidance = useMemo(() => {
    if (mode !== 'create') {
      return null
    }

    if (parentAllowedChildTypeOptions.length > 0) {
      return `This parent scope only allows ${parentAllowedChildTypeOptions
        .map((value) => formatEntityToken(value))
        .join(', ')}.`
    }

    if (rootAllowedChildTypeOptions.length > 0) {
      return `This hierarchy is configured for ${rootAllowedChildTypeOptions
        .map((value) => formatEntityToken(value))
        .join(', ')} at this branch.`
    }

    if (isPlatformConstrainedRootType) {
      if (entityTypeConfigQuery.isPending) {
        return 'Loading platform root entity types.'
      }

      if (rootAllowedTypeOptions.length > 0) {
        return `Platform settings allow ${rootAllowedTypeOptions
          .map((value) => formatEntityToken(value))
          .join(', ')} at the root for ${formatEntityToken(entityClassValue)} entities.`
      }

      return `Platform settings currently do not allow ${formatEntityToken(entityClassValue)} roots.`
    }

    return null
  }, [
    entityClassValue,
    entityTypeConfigQuery.isPending,
    isPlatformConstrainedRootType,
    mode,
    parentAllowedChildTypeOptions,
    rootAllowedChildTypeOptions,
    rootAllowedTypeOptions,
  ])
  const rootNamingGuidance = useMemo(
    () => ({
      systemName: scopeRootEntity?.child_name_pattern?.trim() ?? '',
      displayName: scopeRootEntity?.child_display_name_pattern?.trim() ?? '',
      slug: scopeRootEntity?.child_slug_pattern?.trim() ?? '',
      operatorNote: scopeRootEntity?.child_naming_guidance?.trim() ?? '',
    }),
    [
      scopeRootEntity?.child_display_name_pattern,
      scopeRootEntity?.child_name_pattern,
      scopeRootEntity?.child_naming_guidance,
      scopeRootEntity?.child_slug_pattern,
    ]
  )
  const hasRootNamingGuidance =
    mode === 'create' &&
    Boolean(parentEntity) &&
    Boolean(
      rootNamingGuidance.systemName ||
        rootNamingGuidance.displayName ||
        rootNamingGuidance.slug ||
        rootNamingGuidance.operatorNote
    )
  const showGovernanceControls =
    mode === 'create' || entity?.parent_entity_id != null
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
  const resetDialogState = useEffectEvent(() => {
    form.reset(
      mode === 'create' ? getCreateDefaults(parentEntity) : getUpdateDefaults(entity)
    )
    setSlugTouched(false)
    createEntityMutation.reset()
    updateEntityMutation.reset()
  })

  useEffect(() => {
    if (!open) {
      return
    }

    resetDialogState()
  }, [
    entity,
    mode,
    open,
    parentEntity,
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

  useEffect(() => {
    if (mode !== 'create' || !open) {
      return
    }

    if (parentAllowedChildClassOptions.length > 0) {
      const currentClass = form.getValues('entityClass')
      const currentClassAllowed = parentAllowedChildClassOptions.some(
        (option) => option.value === currentClass
      )

      if (!currentClassAllowed) {
        form.setValue('entityClass', parentAllowedChildClassOptions[0].value, {
          shouldDirty: false,
          shouldValidate: true,
        })
      }
    }

    if (hasConstrainedChildTypeOptions) {
      const currentEntityType = form.getValues('entityType').trim()
      const currentTypeAllowed = constrainedEntityTypeOptions.some(
        (option) => option.toLowerCase() === currentEntityType.toLowerCase()
      )

      if (!currentTypeAllowed) {
        const nextEntityType =
          constrainedEntityTypeOptions.length === 1 || isPlatformConstrainedRootType
            ? constrainedEntityTypeOptions[0] ?? ''
            : ''

        form.setValue('entityType', nextEntityType, {
          shouldDirty: false,
          shouldValidate: true,
        })
      }

      return
    }

    const currentEntityType = form.getValues('entityType').trim()

    if (currentEntityType) {
      return
    }

    const defaultEntityType = parentEntity
      ? defaultChildTypeOptions[0] ?? siblingSuggestedTypeOptions[0] ?? ''
      : siblingSuggestedTypeOptions[0] ?? ''

    if (defaultEntityType) {
      form.setValue('entityType', defaultEntityType, {
        shouldDirty: false,
        shouldValidate: true,
      })
    }
  }, [
    constrainedEntityTypeOptions,
    defaultChildTypeOptions,
    form,
    hasConstrainedChildTypeOptions,
    isPlatformConstrainedRootType,
    mode,
    open,
    parentAllowedChildClassOptions,
    parentEntity,
    siblingSuggestedTypeOptions,
  ])

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
  const canShowEntityTypeSuggestions =
    mode === 'create' && !hasConstrainedChildTypeOptions
  const governanceChildTypeSuggestions = useMemo(
    () =>
      uniqueEntityTypeValues([
        ...(entity?.allowed_child_types ?? []),
        ...(parentEntity?.allowed_child_types ?? []),
        ...(scopeRootEntity?.allowed_child_types ?? []),
        ...(entityTypeConfigQuery.data?.default_child_types.structural ?? []),
        ...(entityTypeConfigQuery.data?.default_child_types.access_group ?? []),
      ]),
    [
      entity?.allowed_child_types,
      entityTypeConfigQuery.data?.default_child_types,
      parentEntity?.allowed_child_types,
      scopeRootEntity?.allowed_child_types,
    ]
  )
  const applySuggestedEntityType = (value: string) => {
    form.setValue('entityType', value, {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  async function handleSubmit(values: EntityFormValues) {
    try {
      const description = values.description?.trim() || undefined
      const allowedChildTypes = values.allowedChildTypes
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
            <DialogTitle className="text-xl">{dialogTitle}</DialogTitle>
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
                        {parentEntity.allowed_child_classes?.length ||
                        parentEntity.allowed_child_types?.length ? (
                          <div className="flex flex-wrap gap-2 pt-2">
                            {parentEntity.allowed_child_classes?.length ? (
                              <Badge variant="outline">
                                Classes:{' '}
                                {parentEntity.allowed_child_classes
                                  .map((value) => formatEntityToken(value))
                                  .join(', ')}
                              </Badge>
                            ) : null}
                            {parentEntity.allowed_child_types?.length ? (
                              <Badge variant="outline">
                                Types:{' '}
                                {parentEntity.allowed_child_types
                                  .map((value) => formatEntityToken(value))
                                  .join(', ')}
                              </Badge>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </section>
                ) : null}

                {hasRootNamingGuidance ? (
                  <section className="rounded-xl border bg-muted/10 p-4">
                    <div className="space-y-1">
                      <div className="font-medium">Root naming guidance</div>
                      <p className="text-sm text-muted-foreground">
                        New descendants under {scopeRootEntity?.display_name ?? 'this root'} should
                        follow the configured branch naming rules.
                      </p>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {rootNamingGuidance.systemName ? (
                        <div className="space-y-1">
                          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            System name
                          </div>
                          <code className="block rounded-md border bg-background px-3 py-2 text-xs">
                            {rootNamingGuidance.systemName}
                          </code>
                        </div>
                      ) : null}

                      {rootNamingGuidance.displayName ? (
                        <div className="space-y-1">
                          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            Display name
                          </div>
                          <code className="block rounded-md border bg-background px-3 py-2 text-xs">
                            {rootNamingGuidance.displayName}
                          </code>
                        </div>
                      ) : null}

                      {rootNamingGuidance.slug ? (
                        <div className="space-y-1">
                          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            Slug
                          </div>
                          <code className="block rounded-md border bg-background px-3 py-2 text-xs">
                            {rootNamingGuidance.slug}
                          </code>
                        </div>
                      ) : null}

                      {rootNamingGuidance.operatorNote ? (
                        <div className="space-y-1 sm:col-span-2">
                          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            Operator note
                          </div>
                          <div className="rounded-md border bg-background px-3 py-2 text-sm text-foreground">
                            {rootNamingGuidance.operatorNote}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {mode === 'create' ? (
                  <div className="grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <Label>Entity class</Label>
                        <Controller
                          control={form.control}
                          name="entityClass"
                          render={({ field }) => (
                            <AppRadioCards
                              aria-label="Entity class"
                              value={field.value}
                              onValueChange={(nextValue) => {
                                form.setValue('entityClass', nextValue, {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                })
                              }}
                              options={parentAllowedChildClassOptions}
                              disabled={
                                isPending || parentAllowedChildClassOptions.length === 1
                              }
                            />
                          )}
                        />
                        {parentEntity?.allowed_child_classes?.length ? (
                          <p className="text-xs text-muted-foreground">
                            This parent scope allows {parentAllowedChildClassOptions
                              .map((option) => option.label.toLowerCase())
                              .join(', ')}
                            .
                          </p>
                        ) : null}
                        <FieldError errors={[form.formState.errors.entityClass]} />
                      </div>

                      <AppFormField
                        label="Entity type"
                        htmlFor={hasConstrainedChildTypeOptions ? undefined : 'entity-type'}
                        description={entityTypeGuidance ?? undefined}
                        errors={[form.formState.errors.entityType]}
                      >
                        {hasConstrainedChildTypeOptions ? (
                          <Controller
                            control={form.control}
                            name="entityType"
                            render={({ field }) => (
                              <Select
                                value={field.value}
                                onValueChange={(nextValue) => {
                                  if (!nextValue) {
                                    return
                                  }

                                  form.setValue('entityType', nextValue, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                  })
                                }}
                                disabled={
                                  isPending ||
                                  (isPlatformConstrainedRootType &&
                                    entityTypeConfigQuery.isPending) ||
                                  constrainedEntityTypeOptions.length <= 1
                                }
                              >
                                <SelectTrigger className="w-full" aria-label="Entity type">
                                  <SelectValue
                                    placeholder={
                                      entityTypeConfigQuery.isPending &&
                                      isPlatformConstrainedRootType
                                        ? 'Loading root entity types'
                                        : constrainedEntityTypeOptions.length === 0
                                          ? 'No root entity types available'
                                          : 'Choose an entity type'
                                    }
                                  />
                                </SelectTrigger>
                                <SelectContent align="start" alignItemWithTrigger={false}>
                                  {constrainedEntityTypeOptions.map((option) => (
                                    <SelectItem key={option} value={option}>
                                      {formatEntityToken(option)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                        ) : (
                          <Input
                            id="entity-type"
                            disabled={isPending}
                            placeholder="department"
                            {...form.register('entityType')}
                          />
                        )}
                      </AppFormField>
                      {canShowEntityTypeSuggestions &&
                      (defaultChildTypeOptions.length > 0 ||
                        siblingSuggestedTypeOptions.length > 0) ? (
                        <div className="space-y-3 rounded-xl border bg-muted/10 p-3">
                            {defaultChildTypeOptions.length > 0 ? (
                              <div className="space-y-2">
                                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                  Platform defaults
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {defaultChildTypeOptions.map((option) => (
                                    <Button
                                      key={option}
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-7"
                                      onClick={() => applySuggestedEntityType(option)}
                                      disabled={isPending}
                                    >
                                      {formatEntityToken(option)}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            {siblingSuggestedTypeOptions.length > 0 ? (
                              <div className="space-y-2">
                                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                  Seen in this branch
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {siblingSuggestedTypeOptions.map((option) => {
                                    const suggestion =
                                      siblingSuggestionMap.get(option.toLowerCase())

                                    return (
                                      <Button
                                        key={option}
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7"
                                        onClick={() => applySuggestedEntityType(option)}
                                        disabled={isPending}
                                      >
                                        {formatEntityToken(option)}
                                        {suggestion ? ` · ${suggestion.count}` : ''}
                                      </Button>
                                    )
                                  })}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                    </div>

                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <AppFormField
                          label="System name"
                          htmlFor="entity-name"
                          errors={[form.formState.errors.name]}
                        >
                          <Input
                            id="entity-name"
                            disabled={isPending}
                            placeholder="acme-west"
                            {...form.register('name')}
                          />
                        </AppFormField>

                        <AppFormField
                          label="Slug"
                          htmlFor="entity-slug"
                          errors={[form.formState.errors.slug]}
                        >
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
                        </AppFormField>
                      </div>

                      <AppFormField
                        label="Display name"
                        htmlFor="entity-display-name"
                        errors={[form.formState.errors.displayName]}
                      >
                        <Input
                          id="entity-display-name"
                          disabled={isPending}
                          placeholder="Acme West"
                          {...form.register('displayName')}
                        />
                      </AppFormField>

                      <AppFormField label="Status" errors={[form.formState.errors.status]}>
                        <Controller
                          control={form.control}
                          name="status"
                          render={({ field }) => (
                            <ToggleGroup
                              aria-label="Status"
                              className="w-full"
                              disabled={isPending}
                              value={field.value ? [field.value] : []}
                              onValueChange={(nextValue) => {
                                const [selectedStatus] = nextValue

                                if (!selectedStatus) {
                                  return
                                }

                                field.onChange(selectedStatus as EntityFormValues['status'])
                              }}
                              variant="outline"
                            >
                              {entityStatusOptions.map((option) => (
                                <ToggleGroupItem
                                  key={option.value}
                                  className="flex-1"
                                  value={option.value}
                                >
                                  {option.label}
                                </ToggleGroupItem>
                              ))}
                            </ToggleGroup>
                          )}
                        />
                      </AppFormField>

                      <AppFormField
                        label="Description"
                        htmlFor="entity-description"
                        errors={[form.formState.errors.description]}
                      >
                        <Textarea
                          id="entity-description"
                          rows={4}
                          disabled={isPending}
                          placeholder="What this entity governs, owns, or represents."
                          {...form.register('description')}
                        />
                      </AppFormField>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <AppFormField
                      label="Display name"
                      htmlFor="entity-display-name"
                      errors={[form.formState.errors.displayName]}
                    >
                      <Input
                        id="entity-display-name"
                        disabled={isPending}
                        placeholder="Acme West"
                        {...form.register('displayName')}
                      />
                    </AppFormField>

                    <AppFormField label="Status" errors={[form.formState.errors.status]}>
                      <Controller
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                          <ToggleGroup
                            aria-label="Status"
                            className="w-full"
                            disabled={isPending}
                            value={field.value ? [field.value] : []}
                            onValueChange={(nextValue) => {
                              const [selectedStatus] = nextValue

                              if (!selectedStatus) {
                                return
                              }

                              field.onChange(selectedStatus as EntityFormValues['status'])
                            }}
                            variant="outline"
                          >
                            {entityStatusOptions.map((option) => (
                              <ToggleGroupItem
                                key={option.value}
                                className="flex-1"
                                value={option.value}
                              >
                                {option.label}
                              </ToggleGroupItem>
                            ))}
                          </ToggleGroup>
                        )}
                      />
                    </AppFormField>

                    <AppFormField
                      label="Description"
                      htmlFor="entity-description"
                      errors={[form.formState.errors.description]}
                    >
                      <Textarea
                        id="entity-description"
                        rows={4}
                        disabled={isPending}
                        placeholder="What this entity governs, owns, or represents."
                        {...form.register('description')}
                      />
                    </AppFormField>
                  </div>
                )}

                <section className="rounded-xl border p-4">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-medium">
                        <CalendarClock className="size-4 text-muted-foreground" />
                        <span>Lifecycle window</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Optional validity dates for activating or sunsetting this entity.
                      </p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <AppFormField
                        label="Valid from"
                        htmlFor="entity-valid-from"
                        errors={[form.formState.errors.validFrom]}
                      >
                        <Controller
                          control={form.control}
                          name="validFrom"
                          render={({ field }) => (
                            <AppDateTimePicker
                              id="entity-valid-from"
                              value={field.value ?? ''}
                              onChange={field.onChange}
                              disabled={isPending}
                              placeholder="Choose"
                              layout="inline"
                            />
                          )}
                        />
                      </AppFormField>
                      <AppFormField
                        label="Valid until"
                        htmlFor="entity-valid-until"
                        errors={[form.formState.errors.validUntil]}
                      >
                        <Controller
                          control={form.control}
                          name="validUntil"
                          render={({ field }) => (
                            <AppDateTimePicker
                              id="entity-valid-until"
                              value={field.value ?? ''}
                              onChange={field.onChange}
                              disabled={isPending}
                              placeholder="Choose"
                              layout="inline"
                            />
                          )}
                        />
                      </AppFormField>
                    </div>
                  </div>
                </section>

                {showGovernanceControls ? (
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
                            <AppCheckboxCards
                              aria-label="Allowed child classes"
                              appearance="compact"
                              values={field.value ?? []}
                              onValuesChange={field.onChange}
                              options={entityClassCompactCardOptions}
                              disabled={isPending}
                            />
                          )}
                        />
                      </div>

                      <div className="grid gap-4">
                        <AppFormField
                          label="Allowed child types"
                          htmlFor="entity-allowed-child-types"
                          description="Add one type at a time. Commas and line breaks also work when pasting."
                          errors={[form.formState.errors.allowedChildTypes]}
                        >
                          <Controller
                            control={form.control}
                            name="allowedChildTypes"
                            render={({ field }) => (
                              <AppTagsInput
                                id="entity-allowed-child-types"
                                values={field.value ?? []}
                                onChange={field.onChange}
                                onBlur={field.onBlur}
                                disabled={isPending}
                                suggestions={governanceChildTypeSuggestions}
                                invalid={Boolean(form.formState.errors.allowedChildTypes)}
                              />
                            )}
                          />
                        </AppFormField>

                        <AppFormField
                          label="Max members"
                          htmlFor="entity-max-members"
                          errors={[form.formState.errors.maxMembers]}
                        >
                          <Input
                            id="entity-max-members"
                            inputMode="numeric"
                            disabled={isPending}
                            placeholder="Unlimited"
                            {...form.register('maxMembers')}
                          />
                        </AppFormField>
                      </div>
                    </div>
                  </section>
                ) : null}

                {submitErrorMessage ? (
                  <FieldError>{submitErrorMessage}</FieldError>
                ) : null}
              </div>
            </div>

            <DialogFooter className="mx-0 mb-0 mt-auto rounded-none border-t bg-background px-6 py-4 sm:items-center sm:justify-end">
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
