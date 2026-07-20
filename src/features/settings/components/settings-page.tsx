import { useEffect } from 'react'

import { useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, type Resolver, useForm, useWatch } from 'react-hook-form'

import { AppEmptyState } from '@/components/app/app-empty-state'
import { AppErrorState } from '@/components/app/app-error-state'
import { AppFormField } from '@/components/app/app-form-field'
import { AppLoadingState } from '@/components/app/app-loading-state'
import { AppPage } from '@/components/app/app-page'
import { AppSection } from '@/components/app/app-section'
import { AppStatusCallout } from '@/components/app/app-status-callout'
import { AppTagsInput } from '@/components/app/app-tags-input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getAuthConfigQueryOptions } from '@/features/auth/api/auth.query-options'
import { useSessionQuery } from '@/features/auth/hooks/use-session-query'
import { getEntityTypeConfigQueryOptions } from '@/features/settings/api/settings.query-options'
import { RuntimeCapabilitiesPanel } from '@/features/settings/components/runtime-capabilities-panel'
import { useUpdateEntityTypeConfigMutation } from '@/features/settings/hooks/use-update-entity-type-config-mutation'
import {
  entityTypeConfigFormSchema,
  type EntityTypeConfigFormValues,
} from '@/features/settings/schemas/entity-type-config-form.schema'
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

  // Dirty-edit protection: this config is a singleton with no record id to key
  // on, so a background refetch (e.g. after another tab saves) must not wipe an
  // operator's in-progress edit. keepDirtyValues merges fresh values into
  // untouched fields while leaving any dirty field exactly as the operator left
  // it; nothing here gates the submit button on isDirty, so the form staying
  // dirty after a successful save has no user-visible downside.
  useEffect(() => {
    if (!entityTypeConfigQuery.data) {
      return
    }

    form.reset(
      {
        structuralRootTypes: entityTypeConfigQuery.data.allowed_root_types.structural,
        accessGroupRootTypes: entityTypeConfigQuery.data.allowed_root_types.access_group,
        structuralChildTypes: entityTypeConfigQuery.data.default_child_types.structural,
        accessGroupChildTypes: entityTypeConfigQuery.data.default_child_types.access_group,
      },
      { keepDirtyValues: true, keepErrors: true }
    )
  }, [entityTypeConfigQuery.data, form])

  const pageError =
    sessionQuery.error ??
    authConfigQuery.error ??
    (entityHierarchyEnabled ? entityTypeConfigQuery.error : null)
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
  const isPagePending =
    sessionQuery.isPending ||
    authConfigQuery.isPending ||
    (entityHierarchyEnabled && entityTypeConfigQuery.isPending)

  if (isPagePending) {
    return <AppLoadingState title="Loading settings workspace" />
  }

  if (pageError || !authConfigQuery.data) {
    return (
      <AppPage title="Settings" hideTitle padded>
        <AppErrorState>
          {getApiErrorMessage(
            pageError,
            'The settings workspace could not load data from the auth API.'
          )}
        </AppErrorState>
      </AppPage>
    )
  }

  return (
    <AppPage
      title="Settings"
      hideTitle
      padded
      shellMeta={
        <Badge variant={canUpdateConfig ? 'outline' : 'secondary'}>
          {canUpdateConfig ? 'Superuser write access' : 'Read-only'}
        </Badge>
      }
    >
      <div className="space-y-4">
        <RuntimeCapabilitiesPanel config={authConfigQuery.data} />

        {entityHierarchyEnabled ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <AppSection
              title="Entity type configuration"
              description="Mutable day-2 vocabulary stored via /config/entity-types."
              contentClassName="space-y-5"
            >
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
                <AppFormField
                  label="Allowed structural root types"
                  htmlFor="settings-structural-root-types"
                  description="Add one type at a time. Commas and line breaks also work when pasting. Leave the access-group list empty if you want to disable access-group roots entirely."
                  errors={[form.formState.errors.structuralRootTypes]}
                >
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
                </AppFormField>

                <AppFormField
                  label="Allowed access-group root types"
                  htmlFor="settings-access-group-root-types"
                  errors={[form.formState.errors.accessGroupRootTypes]}
                >
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
                          entityTypeConfigQuery.data?.allowed_root_types.access_group ??
                          []
                        }
                        invalid={Boolean(form.formState.errors.accessGroupRootTypes)}
                      />
                    )}
                  />
                </AppFormField>

                <AppFormField
                  label="Default structural child types"
                  htmlFor="settings-structural-child-types"
                  errors={[form.formState.errors.structuralChildTypes]}
                >
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
                          entityTypeConfigQuery.data?.default_child_types.structural ??
                          []
                        }
                        invalid={Boolean(form.formState.errors.structuralChildTypes)}
                      />
                    )}
                  />
                </AppFormField>

                <AppFormField
                  label="Default access-group child types"
                  htmlFor="settings-access-group-child-types"
                  errors={[form.formState.errors.accessGroupChildTypes]}
                >
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
                          entityTypeConfigQuery.data?.default_child_types.access_group ??
                          []
                        }
                        invalid={Boolean(form.formState.errors.accessGroupChildTypes)}
                      />
                    )}
                  />
                </AppFormField>

                {!canUpdateConfig ? (
                  <AppStatusCallout color="neutral" appearance="soft" compact>
                    The backend exposes this configuration to everyone for reads, but only
                    superusers can persist changes.
                  </AppStatusCallout>
                ) : null}

                {submitErrorMessage ? (
                  <AppErrorState compact>{submitErrorMessage}</AppErrorState>
                ) : null}

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={!canUpdateConfig || updateMutation.isPending}
                  >
                    {updateMutation.isPending ? 'Saving...' : 'Save configuration'}
                  </Button>
                </div>
              </form>
            </AppSection>

            <AppSection
              title="Effective preview"
              description="Preview the normalized values that will be sent to the backend."
              contentClassName="space-y-4"
            >
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
            </AppSection>
          </div>
        ) : (
          <AppEmptyState
            title="Entity type configuration unavailable"
            description="This backend does not advertise entity hierarchy support, so /config/entity-types is not available. Runtime capabilities above still reflect GET /auth/config."
            compact
          />
        )}
      </div>
    </AppPage>
  )
}
