import { useEffect, useMemo } from 'react'

import { useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'

import { AppLoadingState } from '@/components/app/app-loading-state'
import { AppPage } from '@/components/app/app-page'
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
import { Textarea } from '@/components/ui/textarea'
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

function parseDelimitedValues(value: string) {
  return value
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatDelimitedValues(values: string[]) {
  return values.join(', ')
}

export function SettingsPage() {
  const sessionQuery = useSessionQuery()
  const entityTypeConfigQuery = useQuery(getEntityTypeConfigQueryOptions())
  const updateMutation = useUpdateEntityTypeConfigMutation()
  const sessionUser = sessionQuery.data ?? null
  const canUpdateConfig = Boolean(sessionUser?.is_superuser)
  const form = useForm<EntityTypeConfigFormValues>({
    resolver: zodResolver(entityTypeConfigFormSchema),
    defaultValues: {
      allowedRootTypesText: '',
      structuralChildTypesText: '',
      accessGroupChildTypesText: '',
    },
  })

  useEffect(() => {
    if (!entityTypeConfigQuery.data) {
      return
    }

    form.reset({
      allowedRootTypesText: formatDelimitedValues(
        entityTypeConfigQuery.data.allowed_root_types
      ),
      structuralChildTypesText: formatDelimitedValues(
        entityTypeConfigQuery.data.default_child_types.structural
      ),
      accessGroupChildTypesText: formatDelimitedValues(
        entityTypeConfigQuery.data.default_child_types.access_group
      ),
    })
  }, [entityTypeConfigQuery.data, form])

  const pageError = sessionQuery.error ?? entityTypeConfigQuery.error
  const [
    allowedRootTypesText = '',
    structuralChildTypesText = '',
    accessGroupChildTypesText = '',
  ] = useWatch({
    control: form.control,
    name: [
      'allowedRootTypesText',
      'structuralChildTypesText',
      'accessGroupChildTypesText',
    ],
  })
  const previewValues = useMemo(
    () => ({
      allowedRootTypes: parseDelimitedValues(allowedRootTypesText),
      structuralChildTypes: parseDelimitedValues(structuralChildTypesText),
      accessGroupChildTypes: parseDelimitedValues(accessGroupChildTypesText),
    }),
    [
      accessGroupChildTypesText,
      allowedRootTypesText,
      structuralChildTypesText,
    ]
  )
  const submitErrorMessage = updateMutation.error
    ? getApiErrorMessage(
        updateMutation.error,
        'Entity type configuration could not be updated.'
      )
    : null

  if (sessionQuery.isPending || entityTypeConfigQuery.isPending) {
    return <AppLoadingState title="Loading settings workspace" />
  }

  if (pageError) {
    return (
      <AppPage title="Settings">
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-4 text-sm text-destructive">
          {getApiErrorMessage(
            pageError,
            'The settings workspace could not load data from the auth API.'
          )}
        </div>
      </AppPage>
    )
  }

  return (
    <AppPage
      title="Settings"
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
                    allowed_root_types: parseDelimitedValues(values.allowedRootTypesText),
                    default_child_types: {
                      structural: parseDelimitedValues(values.structuralChildTypesText),
                      access_group: parseDelimitedValues(values.accessGroupChildTypesText),
                    },
                  })
                } catch {
                  return
                }
              })}
            >
              <div className="space-y-2">
                <Label htmlFor="settings-allowed-root-types">Allowed root entity types</Label>
                <Textarea
                  id="settings-allowed-root-types"
                  rows={4}
                  placeholder="organization, workspace"
                  disabled={!canUpdateConfig || updateMutation.isPending}
                  {...form.register('allowedRootTypesText')}
                />
                <div className="text-xs text-muted-foreground">
                  Separate values with commas or new lines.
                </div>
                <FieldError errors={[form.formState.errors.allowedRootTypesText]} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="settings-structural-child-types">
                  Default structural child types
                </Label>
                <Textarea
                  id="settings-structural-child-types"
                  rows={4}
                  placeholder="department, team, branch"
                  disabled={!canUpdateConfig || updateMutation.isPending}
                  {...form.register('structuralChildTypesText')}
                />
                <FieldError errors={[form.formState.errors.structuralChildTypesText]} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="settings-access-group-child-types">
                  Default access-group child types
                </Label>
                <Textarea
                  id="settings-access-group-child-types"
                  rows={4}
                  placeholder="permission_group, admin_group"
                  disabled={!canUpdateConfig || updateMutation.isPending}
                  {...form.register('accessGroupChildTypesText')}
                />
                <FieldError errors={[form.formState.errors.accessGroupChildTypesText]} />
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
                Allowed root types
              </div>
              <div className="flex flex-wrap gap-2">
                {previewValues.allowedRootTypes.map((value) => (
                  <Badge key={value} variant="secondary">
                    {value}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Structural defaults
              </div>
              <div className="flex flex-wrap gap-2">
                {previewValues.structuralChildTypes.map((value) => (
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
                {previewValues.accessGroupChildTypes.map((value) => (
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
