import { useEffect, useEffectEvent } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, type Resolver, useForm } from 'react-hook-form'

import { AppCheckboxCards } from '@/components/app/app-choice-cards'
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
import { Textarea } from '@/components/ui/textarea'
import { useUpdateEntityMutation } from '@/features/entities/hooks/use-update-entity-mutation'
import {
  rootGovernanceFormSchema,
  type RootGovernanceFormValues,
} from '@/features/entities/schemas/root-governance-form.schema'
import type { Entity } from '@/features/entities/types/entities.types'
import { formatEntityToken } from '@/features/entities/utils/entity-display'
import { entityClassCompactCardOptions } from '@/features/entities/utils/entity-class-card-options'
import { getApiErrorMessage } from '@/lib/api/errors'

type EntityRootGovernanceDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  entity: Entity | null
  onSuccess?: (entity: Entity) => void
}

function parseMaxMembers(value?: string) {
  if (!value || !value.trim()) {
    return null
  }

  return Number(value)
}

function getDefaultValues(entity: Entity | null): RootGovernanceFormValues {
  return {
    allowedChildClasses: entity?.allowed_child_classes ?? [],
    allowedChildTypes: entity?.allowed_child_types ?? [],
    maxMembers: entity?.max_members != null ? String(entity.max_members) : '',
    childNamePattern: entity?.child_name_pattern ?? '',
    childDisplayNamePattern: entity?.child_display_name_pattern ?? '',
    childSlugPattern: entity?.child_slug_pattern ?? '',
    childNamingGuidance: entity?.child_naming_guidance ?? '',
  }
}

export function EntityRootGovernanceDialog({
  open,
  onOpenChange,
  entity,
  onSuccess,
}: EntityRootGovernanceDialogProps) {
  const updateEntityMutation = useUpdateEntityMutation()
  const resolver = zodResolver(rootGovernanceFormSchema) as Resolver<RootGovernanceFormValues>
  const form = useForm<RootGovernanceFormValues>({
    resolver,
    defaultValues: getDefaultValues(entity),
  })
  const resetDialogState = useEffectEvent(() => {
    form.reset(getDefaultValues(entity))
    updateEntityMutation.reset()
  })

  useEffect(() => {
    if (!open) {
      return
    }

    resetDialogState()
  }, [entity, open])

  if (!entity || entity.parent_entity_id != null) {
    return null
  }

  const submitErrorMessage = updateEntityMutation.error
    ? getApiErrorMessage(updateEntityMutation.error, 'Root governance could not be updated.')
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-hidden p-0 sm:max-w-3xl">
        <div className="flex max-h-[calc(100svh-2rem)] flex-col">
          <DialogHeader className="border-b px-6 py-5">
            <div className="space-y-3">
              <DialogTitle className="text-xl">
                Edit root governance for {entity.display_name}
              </DialogTitle>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{formatEntityToken(entity.entity_type)}</Badge>
                <Badge variant="outline">{formatEntityToken(entity.status)}</Badge>
                <Badge variant="outline">Root entity</Badge>
              </div>
            </div>
          </DialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={form.handleSubmit(async (values) => {
              try {
                const nextEntity = await updateEntityMutation.mutateAsync({
                  entityId: entity.id,
                  allowed_child_classes: values.allowedChildClasses,
                  allowed_child_types: values.allowedChildTypes,
                  max_members: parseMaxMembers(values.maxMembers),
                  child_name_pattern: values.childNamePattern?.trim() || null,
                  child_display_name_pattern:
                    values.childDisplayNamePattern?.trim() || null,
                  child_slug_pattern: values.childSlugPattern?.trim() || null,
                  child_naming_guidance: values.childNamingGuidance?.trim() || null,
                })

                onSuccess?.(nextEntity)
                onOpenChange(false)
              } catch {
                return
              }
            })}
          >
            <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
              <div className="space-y-6">
                <section className="rounded-xl border p-4">
                  <div className="space-y-1">
                    <div className="font-medium">Child entity constraints</div>
                    <p className="text-sm text-muted-foreground">
                      These rules shape which classes and entity types can be created anywhere
                      beneath this root.
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
                            disabled={updateEntityMutation.isPending}
                          />
                        )}
                      />
                    </div>

                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="root-governance-allowed-child-types">
                          Allowed child types
                        </Label>
                        <Controller
                          control={form.control}
                          name="allowedChildTypes"
                          render={({ field }) => (
                            <AppTagsInput
                              id="root-governance-allowed-child-types"
                              values={field.value ?? []}
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              disabled={updateEntityMutation.isPending}
                              showSuggestions={false}
                              invalid={Boolean(form.formState.errors.allowedChildTypes)}
                            />
                          )}
                        />
                        <p className="text-xs text-muted-foreground">
                          Add one type at a time. Commas and line breaks also work when pasting.
                          Leave empty to fall back to the platform child-type defaults.
                        </p>
                        <FieldError errors={[form.formState.errors.allowedChildTypes]} />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="root-governance-max-members">Default member cap</Label>
                        <Input
                          id="root-governance-max-members"
                          inputMode="numeric"
                          disabled={updateEntityMutation.isPending}
                          placeholder="Unlimited"
                          {...form.register('maxMembers')}
                        />
                        <FieldError errors={[form.formState.errors.maxMembers]} />
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border p-4">
                  <div className="space-y-1">
                    <div className="font-medium">Naming conventions</div>
                    <p className="text-sm text-muted-foreground">
                      Optional regex patterns for descendant naming. Leave a field blank to allow
                      any value for that part of the entity identity.
                    </p>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="root-governance-child-name-pattern">
                        System-name pattern
                      </Label>
                      <Input
                        id="root-governance-child-name-pattern"
                        disabled={updateEntityMutation.isPending}
                        placeholder="^(east|west)_[a-z0-9_]+$"
                        {...form.register('childNamePattern')}
                      />
                      <FieldError errors={[form.formState.errors.childNamePattern]} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="root-governance-child-display-name-pattern">
                        Display-name pattern
                      </Label>
                      <Input
                        id="root-governance-child-display-name-pattern"
                        disabled={updateEntityMutation.isPending}
                        placeholder="^(East|West) .+$"
                        {...form.register('childDisplayNamePattern')}
                      />
                      <FieldError errors={[form.formState.errors.childDisplayNamePattern]} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="root-governance-child-slug-pattern">Slug pattern</Label>
                      <Input
                        id="root-governance-child-slug-pattern"
                        disabled={updateEntityMutation.isPending}
                        placeholder="^(east|west)-[a-z0-9-]+$"
                        {...form.register('childSlugPattern')}
                      />
                      <FieldError errors={[form.formState.errors.childSlugPattern]} />
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="root-governance-child-naming-guidance">
                        Operator guidance
                      </Label>
                      <Textarea
                        id="root-governance-child-naming-guidance"
                        rows={3}
                        disabled={updateEntityMutation.isPending}
                        placeholder="Use East/West prefixes for branch naming."
                        {...form.register('childNamingGuidance')}
                      />
                      <FieldError errors={[form.formState.errors.childNamingGuidance]} />
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

            <DialogFooter className="mx-0 mb-0 mt-auto rounded-none border-t bg-background px-6 py-4 sm:items-center sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={updateEntityMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateEntityMutation.isPending}>
                {updateEntityMutation.isPending ? 'Saving…' : 'Save governance'}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
