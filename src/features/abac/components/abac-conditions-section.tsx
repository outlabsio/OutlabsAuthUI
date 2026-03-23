import { useEffect, useEffectEvent, useMemo, useState } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, type Resolver, useForm } from 'react-hook-form'
import { PencilLine, Plus, Trash2 } from 'lucide-react'

import { AppInfoPopover } from '@/components/app/app-info-popover'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  abacConditionGroupFormSchema,
  type AbacConditionGroupFormValues,
} from '@/features/abac/schemas/abac-condition-group-form.schema'
import {
  abacConditionFormSchema,
  type AbacConditionFormValues,
} from '@/features/abac/schemas/abac-condition-form.schema'
import type {
  AbacCondition,
  AbacConditionGroup,
  AbacConditionValueType,
} from '@/features/abac/types/abac.types'
import {
  abacConditionOperatorOptions,
  formatAbacConditionValue,
  getAbacConditionGroupLabel,
  parseAbacConditionValue,
} from '@/features/abac/utils/abac-display'
import { formatRoleToken } from '@/features/roles/utils/role-display'
import { getApiErrorMessage } from '@/lib/api/errors'

type AbacConditionGroupPayload = {
  operator: 'AND' | 'OR'
  description?: string
}

type AbacConditionPayload = {
  attribute: string
  operator: string
  value?: string | number | boolean | string[] | null
  value_type: AbacConditionValueType
  description?: string
  condition_group_id?: string | null
}

type DetailSectionProps = {
  title: string
  description?: string
  info?: {
    label: string
    title: string
    content: React.ReactNode
  }
  action?: React.ReactNode
  children: React.ReactNode
}

type AbacConditionsSectionProps = {
  subjectLabel: string
  subjectId: string
  subjectIsProtected?: boolean
  abacEnabled: boolean
  canManage: boolean
  conditionGroups: AbacConditionGroup[]
  conditions: AbacCondition[]
  conditionGroupsLoading: boolean
  conditionsLoading: boolean
  conditionGroupsErrorMessage?: string | null
  conditionsErrorMessage?: string | null
  onCreateConditionGroup: (
    payload: AbacConditionGroupPayload
  ) => Promise<unknown>
  onUpdateConditionGroup: (
    groupId: string,
    payload: AbacConditionGroupPayload
  ) => Promise<unknown>
  onDeleteConditionGroup: (groupId: string) => Promise<unknown>
  onCreateCondition: (payload: AbacConditionPayload) => Promise<unknown>
  onUpdateCondition: (
    conditionId: string,
    payload: AbacConditionPayload
  ) => Promise<unknown>
  onDeleteCondition: (conditionId: string) => Promise<unknown>
}

function DetailSection({
  title,
  description,
  info,
  action,
  children,
}: DetailSectionProps) {
  return (
    <Card className="border border-border/70 bg-card/90 ring-0">
      <CardHeader className="border-b border-border/60">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{title}</CardTitle>
              {info ? (
                <AppInfoPopover label={info.label} title={info.title}>
                  {info.content}
                </AppInfoPopover>
              ) : null}
            </div>
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function ConditionGroupDialog({
  open,
  group,
  subjectLabel,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  group?: AbacConditionGroup | null
  subjectLabel: string
  onOpenChange: (open: boolean) => void
  onSubmit: (payload: AbacConditionGroupPayload, groupId?: string) => Promise<unknown>
}) {
  const resolver = zodResolver(
    abacConditionGroupFormSchema
  ) as Resolver<AbacConditionGroupFormValues>
  const form = useForm<AbacConditionGroupFormValues>({
    resolver,
    defaultValues: {
      operator: group?.operator ?? 'AND',
      description: group?.description ?? '',
    },
  })
  const [submitError, setSubmitError] = useState<unknown>(null)
  const [isPending, setIsPending] = useState(false)
  const resetDialogState = useEffectEvent(() => {
    form.reset({
      operator: group?.operator ?? 'AND',
      description: group?.description ?? '',
    })
    setSubmitError(null)
    setIsPending(false)
  })

  useEffect(() => {
    if (!open) {
      return
    }

    resetDialogState()
  }, [group, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {group ? 'Edit condition group' : 'Add condition group'}
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={form.handleSubmit(async (values) => {
            setSubmitError(null)
            setIsPending(true)

            try {
              await onSubmit(
                {
                  operator: values.operator,
                  description: values.description || undefined,
                },
                group?.id
              )
              onOpenChange(false)
            } catch (error) {
              setSubmitError(error)
            } finally {
              setIsPending(false)
            }
          })}
        >
          <div className="space-y-2">
            <Label>Operator</Label>
            <Controller
              control={form.control}
              name="operator"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(value) =>
                    form.setValue(
                      'operator',
                      value as AbacConditionGroupFormValues['operator'],
                      {
                        shouldDirty: true,
                        shouldValidate: true,
                      }
                    )
                  }
                  disabled={isPending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AND">AND</SelectItem>
                    <SelectItem value="OR">OR</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-xs text-muted-foreground">
              Controls how grouped {subjectLabel} conditions combine.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="abac-group-description">Description</Label>
            <Controller
              control={form.control}
              name="description"
              render={({ field }) => (
                <Textarea
                  {...field}
                  id="abac-group-description"
                  rows={3}
                  disabled={isPending}
                  placeholder={`Describe when these ${subjectLabel} conditions should be evaluated together.`}
                />
              )}
            />
            <FieldError errors={[form.formState.errors.description]} />
          </div>

          {submitError ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {getApiErrorMessage(
                submitError,
                `The ${subjectLabel} condition group could not be saved.`
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : group ? 'Save changes' : 'Create group'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ConditionDialog({
  open,
  groups,
  condition,
  subjectLabel,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  groups: AbacConditionGroup[]
  condition?: AbacCondition | null
  subjectLabel: string
  onOpenChange: (open: boolean) => void
  onSubmit: (payload: AbacConditionPayload, conditionId?: string) => Promise<unknown>
}) {
  const resolver = zodResolver(
    abacConditionFormSchema
  ) as Resolver<AbacConditionFormValues>
  const form = useForm<AbacConditionFormValues>({
    resolver,
    defaultValues: {
      attribute: condition?.attribute ?? '',
      operator: condition?.operator ?? 'equals',
      valueType: condition?.value_type ?? 'string',
      value: condition?.value ?? '',
      description: condition?.description ?? '',
      conditionGroupId: condition?.condition_group_id ?? '',
    },
  })
  const [submitError, setSubmitError] = useState<unknown>(null)
  const [isPending, setIsPending] = useState(false)
  const resetDialogState = useEffectEvent(() => {
    form.reset({
      attribute: condition?.attribute ?? '',
      operator: condition?.operator ?? 'equals',
      valueType: condition?.value_type ?? 'string',
      value: condition?.value ?? '',
      description: condition?.description ?? '',
      conditionGroupId: condition?.condition_group_id ?? '',
    })
    setSubmitError(null)
    setIsPending(false)
  })

  useEffect(() => {
    if (!open) {
      return
    }

    resetDialogState()
  }, [condition, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{condition ? 'Edit condition' : 'Add condition'}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={form.handleSubmit(async (values) => {
            setSubmitError(null)
            setIsPending(true)

            try {
              await onSubmit(
                {
                  attribute: values.attribute,
                  operator: values.operator,
                  value: parseAbacConditionValue(values),
                  value_type: values.valueType,
                  description: values.description || undefined,
                  condition_group_id: values.conditionGroupId || null,
                },
                condition?.id
              )
              onOpenChange(false)
            } catch (error) {
              setSubmitError(error)
            } finally {
              setIsPending(false)
            }
          })}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="abac-attribute">Attribute path</Label>
              <Controller
                control={form.control}
                name="attribute"
                render={({ field }) => (
                  <Input
                    {...field}
                    id="abac-attribute"
                    disabled={isPending}
                    placeholder="resource.department"
                  />
                )}
              />
              <FieldError errors={[form.formState.errors.attribute]} />
            </div>
            <div className="space-y-2">
              <Label>Operator</Label>
              <Controller
                control={form.control}
                name="operator"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) =>
                      form.setValue('operator', value ?? 'equals', {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    disabled={isPending}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {abacConditionOperatorOptions.map((operator) => (
                        <SelectItem key={operator} value={operator}>
                          {formatRoleToken(operator)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[form.formState.errors.operator]} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Value type</Label>
              <Controller
                control={form.control}
                name="valueType"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) =>
                      form.setValue(
                        'valueType',
                        value as AbacConditionFormValues['valueType'],
                        {
                          shouldDirty: true,
                          shouldValidate: true,
                        }
                      )
                    }
                    disabled={isPending}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="string">String</SelectItem>
                      <SelectItem value="integer">Integer</SelectItem>
                      <SelectItem value="float">Float</SelectItem>
                      <SelectItem value="boolean">Boolean</SelectItem>
                      <SelectItem value="list">List</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>Condition group</Label>
              <Controller
                control={form.control}
                name="conditionGroupId"
                render={({ field }) => (
                  <Select
                    value={field.value || 'none'}
                    onValueChange={(value) =>
                      form.setValue(
                        'conditionGroupId',
                        !value || value === 'none' ? '' : value,
                        {
                          shouldDirty: true,
                          shouldValidate: true,
                        }
                      )
                    }
                    disabled={isPending}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Ungrouped" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Ungrouped</SelectItem>
                      {groups.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          {getAbacConditionGroupLabel(group)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="abac-value">Value</Label>
            <Controller
              control={form.control}
              name="value"
              render={({ field }) => (
                <Textarea
                  {...field}
                  id="abac-value"
                  rows={3}
                  disabled={isPending}
                  placeholder="Enter a value. Lists can use commas or new lines."
                />
              )}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank for operators that do not require a value.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="abac-condition-description">Description</Label>
            <Controller
              control={form.control}
              name="description"
              render={({ field }) => (
                <Textarea
                  {...field}
                  id="abac-condition-description"
                  rows={3}
                  disabled={isPending}
                  placeholder={`Explain how this ${subjectLabel} condition narrows access.`}
                />
              )}
            />
            <FieldError errors={[form.formState.errors.description]} />
          </div>

          {submitError ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {getApiErrorMessage(
                submitError,
                `The ${subjectLabel} condition could not be saved.`
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : condition ? 'Save changes' : 'Create condition'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function AbacConditionsSection({
  subjectLabel,
  subjectIsProtected = false,
  abacEnabled,
  canManage,
  conditionGroups,
  conditions,
  conditionGroupsLoading,
  conditionsLoading,
  conditionGroupsErrorMessage,
  conditionsErrorMessage,
  onCreateConditionGroup,
  onUpdateConditionGroup,
  onDeleteConditionGroup,
  onCreateCondition,
  onUpdateCondition,
  onDeleteCondition,
}: AbacConditionsSectionProps) {
  const groupsById = useMemo(
    () => new Map(conditionGroups.map((group) => [group.id, group])),
    [conditionGroups]
  )
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<AbacConditionGroup | null>(null)
  const [conditionDialogOpen, setConditionDialogOpen] = useState(false)
  const [editingCondition, setEditingCondition] = useState<AbacCondition | null>(null)
  const [groupDeleteError, setGroupDeleteError] = useState<unknown>(null)
  const [conditionDeleteError, setConditionDeleteError] = useState<unknown>(null)
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null)
  const [deletingConditionId, setDeletingConditionId] = useState<string | null>(null)

  return (
    <>
      <DetailSection
        title="ABAC conditions"
        info={{
          label: `Explain ${subjectLabel} ABAC`,
          title: 'ABAC conditions',
          content: `Optional attribute-based rules can narrow when this ${subjectLabel} is effective.`,
        }}
        action={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingGroup(null)
                  setGroupDialogOpen(true)
                }}
              >
                <Plus className="size-4" />
                Add group
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setEditingCondition(null)
                  setConditionDialogOpen(true)
                }}
              >
                <Plus className="size-4" />
                Add condition
              </Button>
            </div>
          ) : null
        }
      >
        {!abacEnabled ? (
          <div className="rounded-2xl border border-dashed px-4 py-4 text-sm text-muted-foreground">
            ABAC is disabled on this backend.
          </div>
        ) : (
          <div className="space-y-4">
            {subjectIsProtected ? (
              <div className="rounded-2xl border border-border/80 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                System {subjectLabel}s are read-only here.
              </div>
            ) : null}

            {conditionGroupsErrorMessage ? (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {conditionGroupsErrorMessage}
              </div>
            ) : null}
            {conditionsErrorMessage ? (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {conditionsErrorMessage}
              </div>
            ) : null}
            {groupDeleteError ? (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {getApiErrorMessage(
                  groupDeleteError,
                  `The ${subjectLabel} condition group could not be deleted.`
                )}
              </div>
            ) : null}
            {conditionDeleteError ? (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {getApiErrorMessage(
                  conditionDeleteError,
                  `The ${subjectLabel} condition could not be deleted.`
                )}
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">Condition groups</div>
                {conditionGroupsLoading ? <Badge variant="outline">Loading</Badge> : null}
              </div>
              {conditionGroups.length > 0 ? (
                <div className="space-y-3">
                  {conditionGroups.map((group) => (
                    <div key={group.id} className="rounded-2xl border bg-background/80 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{getAbacConditionGroupLabel(group)}</div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {group.description || 'No description'}
                          </div>
                        </div>
                        {canManage ? (
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label={`Edit ${getAbacConditionGroupLabel(group)}`}
                              onClick={() => {
                                setEditingGroup(group)
                                setGroupDialogOpen(true)
                              }}
                            >
                              <PencilLine className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label={`Delete ${getAbacConditionGroupLabel(group)}`}
                              disabled={deletingGroupId === group.id}
                              onClick={async () => {
                                setGroupDeleteError(null)
                                setDeletingGroupId(group.id)

                                try {
                                  await onDeleteConditionGroup(group.id)
                                } catch (error) {
                                  setGroupDeleteError(error)
                                } finally {
                                  setDeletingGroupId(null)
                                }
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed px-4 py-4 text-sm text-muted-foreground">
                  No condition groups configured.
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">Conditions</div>
                {conditionsLoading ? <Badge variant="outline">Loading</Badge> : null}
              </div>
              {conditions.length > 0 ? (
                <div className="space-y-3">
                  {conditions.map((condition) => {
                    const conditionGroup = condition.condition_group_id
                      ? groupsById.get(condition.condition_group_id) ?? null
                      : null

                    return (
                      <div key={condition.id} className="rounded-2xl border bg-background/80 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline">{condition.attribute}</Badge>
                              <Badge variant="outline">
                                {formatRoleToken(condition.operator)}
                              </Badge>
                              <Badge variant="outline">
                                {formatRoleToken(condition.value_type)}
                              </Badge>
                              <Badge variant="outline">
                                {conditionGroup
                                  ? getAbacConditionGroupLabel(conditionGroup)
                                  : 'Ungrouped'}
                              </Badge>
                            </div>
                            <div className="space-y-1">
                              <div className="text-sm font-medium">Value</div>
                              <div className="text-sm text-muted-foreground">
                                {formatAbacConditionValue(condition)}
                              </div>
                            </div>
                            {condition.description ? (
                              <p className="text-sm text-muted-foreground">
                                {condition.description}
                              </p>
                            ) : null}
                          </div>
                          {canManage ? (
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                aria-label={`Edit condition ${condition.attribute}`}
                                onClick={() => {
                                  setEditingCondition(condition)
                                  setConditionDialogOpen(true)
                                }}
                              >
                                <PencilLine className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                aria-label={`Delete condition ${condition.attribute}`}
                                disabled={deletingConditionId === condition.id}
                                onClick={async () => {
                                  setConditionDeleteError(null)
                                  setDeletingConditionId(condition.id)

                                  try {
                                    await onDeleteCondition(condition.id)
                                  } catch (error) {
                                    setConditionDeleteError(error)
                                  } finally {
                                    setDeletingConditionId(null)
                                  }
                                }}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed px-4 py-4 text-sm text-muted-foreground">
                  No conditions configured.
                </div>
              )}
            </div>
          </div>
        )}
      </DetailSection>

      <ConditionGroupDialog
        open={groupDialogOpen}
        group={editingGroup}
        subjectLabel={subjectLabel}
        onOpenChange={setGroupDialogOpen}
        onSubmit={async (payload, groupId) => {
          if (groupId) {
            await onUpdateConditionGroup(groupId, payload)
            return
          }

          await onCreateConditionGroup(payload)
        }}
      />

      <ConditionDialog
        open={conditionDialogOpen}
        groups={conditionGroups}
        condition={editingCondition}
        subjectLabel={subjectLabel}
        onOpenChange={setConditionDialogOpen}
        onSubmit={async (payload, conditionId) => {
          if (conditionId) {
            await onUpdateCondition(conditionId, payload)
            return
          }

          await onCreateCondition(payload)
        }}
      />
    </>
  )
}
