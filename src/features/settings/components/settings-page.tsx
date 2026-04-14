import { useEffect } from 'react'

import { useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, type Resolver, useForm, useWatch } from 'react-hook-form'

import { AppEmptyState } from '@/components/app/app-empty-state'
import { AppLoadingState } from '@/components/app/app-loading-state'
import { AppPage } from '@/components/app/app-page'
import { AppTagsInput } from '@/components/app/app-tags-input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { FieldError } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { getAuthConfigQueryOptions } from '@/features/auth/api/auth.query-options'
import { getEntityTypeConfigQueryOptions } from '@/features/settings/api/settings.query-options'
import { useUpdateEntityTypeConfigMutation } from '@/features/settings/hooks/use-update-entity-type-config-mutation'
import {
  entityTypeConfigFormSchema,
  type EntityTypeConfigFormValues,
} from '@/features/settings/schemas/entity-type-config-form.schema'
import { useSessionQuery } from '@/features/auth/hooks/use-session-query'
import { getApiErrorMessage } from '@/lib/api/errors'

function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Not yet updated'
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return 'Unknown'
  }
}

export function SettingsPage() {
  const sessionQuery = useSessionQuery()
  const authConfigQuery = useQuery(getAuthConfigQueryOptions())
  const entityHierarchyEnabled =
    authConfigQuery.data?.features.entity_hierarchy ?? false
  const entityTypeConfigQuery = useQuery({
    ...getEntityTypeConfigQueryOptions(),
    enabled: entityHierarchyEnabled,
  })
  const updateMutation = useUpdateEntityTypeConfigMutation()
  const sessionUser = sessionQuery.data ?? null
  const canUpdateConfig = Boolean(sessionUser?.is_superuser)
  const resolver =
    zodResolver(entityTypeConfigFormSchema) as Resolver<EntityTypeConfigFormValues>
  const form = useForm<EntityTypeConfigFormValues>({
    resolver,
    defaultValues: {
      structuralRootTypes: [],
      accessGroupRootTypes: [],
      structuralChildTypes: [],
      accessGroupChildTypes: [],
    },
  })

  useEffect(() => {
    if (!entityTypeConfigQuery.data) {
      return
    }

    form.reset({
      structuralRootTypes: entityTypeConfigQuery.data.allowed_root_types.structural,
      accessGroupRootTypes: entityTypeConfigQuery.data.allowed_root_types.access_group,
      structuralChildTypes: entityTypeConfigQuery.data.default_child_types.structural,
      accessGroupChildTypes: entityTypeConfigQuery.data.default_child_types.access_group,
    })
  }, [entityTypeConfigQuery.data, form])

  const pageError =
    sessionQuery.error ?? authConfigQuery.error ?? entityTypeConfigQuery.error
  const [
    structuralRootTypes = [],
    accessGroupRootTypes = [],
    structuralChildTypes = [],
    accessGroupChildTypes = [],
  ] = useWatch({
    control: form.control,
    name: [
      'structuralRootTypes',
      'accessGroupRootTypes',
      'structuralChildTypes',
      'accessGroupChildTypes',
    ],
  })
  const submitErrorMessage = updateMutation.error
    ? getApiErrorMessage(
        updateMutation.error,
        'Entity type configuration could not be updated.'
      )
    : null

  if (sessionQuery.isPending || authConfigQuery.isPending || entityTypeConfigQuery.isPending) {
    return <AppLoadingState title="Loading settings workspace" />
  }

  if (pageError) {
    return (
      <AppPage title="Settings" padded>
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-4 text-sm text-destructive">
          {getApiErrorMessage(
            pageError,
            'The settings workspace could not load data from the auth API.'
          )}
        </div>
      </AppPage>
    )
  }

  if (!entityHierarchyEnabled) {
    return (
      <AppPage title="Settings" padded>
        <AppEmptyState
          title="Settings workspace unavailable"
          description="This backend does not advertise entity hierarchy support, so /config/entity-types is not available."
          compact
        />
      </AppPage>
    )
  }

  return (
    <AppPage
      title="Settings"
      padded
      description="Review and update backend-managed entity type defaults without falling back to the old in-repo admin assumptions."
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <Card className="border border-border/70">
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <CardTitle className="text-xl">Entity type configuration</CardTitle>
                <div className="text-sm text-muted-foreground">
                  This screen maps directly to <code>/config/entity-types</code>.
                </div>
              </div>
              <Badge variant={canUpdateConfig ? 'outline' : 'secondary'}>
                {canUpdateConfig ? 'Superuser write access' : 'Read-only'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-2xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              Last updated: {formatDateTime(entityTypeConfigQuery.data?.updated_at)}
            </div>

            <form
              className="space-y-4"
              onSubmit={form.handleSubmit(async (values) => {
                try {
                  await updateMutation.mutateAsync({
                    allowed_root_types: {
                      structural: values.structuralRootTypes,
                      access_group: values.accessGroupRootTypes,
                    },
                    default_child_types: {
                      structural: values.structuralChildTypes,
                      access_group: values.accessGroupChildTypes,
                    },
                  })
                } catch {
                  return
                }
              })}
            >
              <div className="space-y-2">
                <Label htmlFor="settings-structural-root-types">
                  Allowed structural root types
                </Label>
                <Controller
                  control={form.control}
                  name="structuralRootTypes"
                  render={({ field }) => (
                    <AppTagsInput
                      id="settings-structural-root-types"
                      values={field.value ?? []}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      disabled={!canUpdateConfig || updateMutation.isPending}
                      suggestions={
                        entityTypeConfigQuery.data?.allowed_root_types.structural ?? []
                      }
                      invalid={Boolean(form.formState.errors.structuralRootTypes)}
                    />
                  )}
                />
                <div className="text-xs text-muted-foreground">
                  Add one type at a time. Commas and line breaks also work when pasting. Leave the
                  access-group list empty if you want to disable access-group roots entirely.
                </div>
                <FieldError errors={[form.formState.errors.structuralRootTypes]} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="settings-access-group-root-types">
                  Allowed access-group root types
                </Label>
                <Controller
                  control={form.control}
                  name="accessGroupRootTypes"
                  render={({ field }) => (
                    <AppTagsInput
                      id="settings-access-group-root-types"
                      values={field.value ?? []}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      disabled={!canUpdateConfig || updateMutation.isPending}
                      suggestions={
                        entityTypeConfigQuery.data?.allowed_root_types.access_group ?? []
                      }
                      invalid={Boolean(form.formState.errors.accessGroupRootTypes)}
                    />
                  )}
                />
                <FieldError errors={[form.formState.errors.accessGroupRootTypes]} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="settings-structural-child-types">
                  Default structural child types
                </Label>
                <Controller
                  control={form.control}
                  name="structuralChildTypes"
                  render={({ field }) => (
                    <AppTagsInput
                      id="settings-structural-child-types"
                      values={field.value ?? []}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      disabled={!canUpdateConfig || updateMutation.isPending}
                      suggestions={
                        entityTypeConfigQuery.data?.default_child_types.structural ?? []
                      }
                      invalid={Boolean(form.formState.errors.structuralChildTypes)}
                    />
                  )}
                />
                <FieldError errors={[form.formState.errors.structuralChildTypes]} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="settings-access-group-child-types">
                  Default access-group child types
                </Label>
                <Controller
                  control={form.control}
                  name="accessGroupChildTypes"
                  render={({ field }) => (
                    <AppTagsInput
                      id="settings-access-group-child-types"
                      values={field.value ?? []}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      disabled={!canUpdateConfig || updateMutation.isPending}
                      suggestions={
                        entityTypeConfigQuery.data?.default_child_types.access_group ?? []
                      }
                      invalid={Boolean(form.formState.errors.accessGroupChildTypes)}
                    />
                  )}
                />
                <FieldError errors={[form.formState.errors.accessGroupChildTypes]} />
              </div>

              {!canUpdateConfig ? (
                <div className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
                  The backend exposes this configuration to everyone for reads, but only superusers
                  can persist changes.
                </div>
              ) : null}

              {submitErrorMessage ? (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {submitErrorMessage}
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button type="submit" disabled={!canUpdateConfig || updateMutation.isPending}>
                  {updateMutation.isPending ? 'Saving...' : 'Save configuration'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border border-border/70">
          <CardHeader className="gap-3">
            <CardTitle className="text-xl">Effective preview</CardTitle>
            <div className="text-sm text-muted-foreground">
              Preview the normalized values that will be sent to the backend.
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Structural root types
              </div>
              <div className="flex flex-wrap gap-2">
                {structuralRootTypes.map((value) => (
                  <Badge key={value} variant="secondary">
                    {value}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Access-group root types
              </div>
              <div className="flex flex-wrap gap-2">
                {accessGroupRootTypes.length > 0 ? (
                  accessGroupRootTypes.map((value) => (
                    <Badge key={value} variant="secondary">
                      {value}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="outline">No access-group roots allowed</Badge>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Structural defaults
              </div>
              <div className="flex flex-wrap gap-2">
                {structuralChildTypes.map((value) => (
                  <Badge key={value} variant="outline">
                    {value}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Access-group defaults
              </div>
              <div className="flex flex-wrap gap-2">
                {accessGroupChildTypes.map((value) => (
                  <Badge key={value} variant="outline">
                    {value}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppPage>
  )
}
