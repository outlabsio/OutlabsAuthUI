import { useEffect, useMemo } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { AppFormField } from '@/components/app/app-form-field'
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  getGrantableScopesQueryOptions,
} from '@/features/api-keys/api/api-keys.query-options'
import { useCreateApiKeyMutation } from '@/features/api-keys/hooks/use-create-api-key-mutation'
import { useUpdateApiKeyMutation } from '@/features/api-keys/hooks/use-update-api-key-mutation'
import {
  apiKeyFormSchema,
  type ApiKeyFormValues,
} from '@/features/api-keys/schemas/api-key-form.schema'
import type {
  ApiKey,
  CreateApiKeyResponse,
} from '@/features/api-keys/types/api-keys.types'
import { formatDelimitedValues, parseDelimitedValues } from '@/features/api-keys/utils/delimited-values'
import {
  DEFAULT_API_KEY_RATE_LIMIT_PER_MINUTE,
  getLimitedApiKeyRateLimitFallback,
  isUnlimitedApiKeyRateLimit,
} from '@/features/api-keys/utils/rate-limit'
import type { EntityOption } from '@/features/entities/utils/build-entity-options'
import { getApiErrorMessage } from '@/lib/api/errors'

type ApiKeyFormDialogProps = {
  open: boolean
  mode: 'create' | 'edit'
  apiKey: ApiKey | null
  entityOptions: EntityOption[]
  entityHierarchyEnabled: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (apiKey: CreateApiKeyResponse) => void
  onUpdated: (apiKey: ApiKey) => void
}

function uniq(values: string[]) {
  return Array.from(new Set(values))
}

export function ApiKeyFormDialog({
  open,
  mode,
  apiKey,
  entityOptions,
  entityHierarchyEnabled,
  onOpenChange,
  onCreated,
  onUpdated,
}: ApiKeyFormDialogProps) {
  const createMutation = useCreateApiKeyMutation()
  const updateMutation = useUpdateApiKeyMutation()
  const resetCreateMutation = createMutation.reset
  const resetUpdateMutation = updateMutation.reset
  const isPending = createMutation.isPending || updateMutation.isPending
  const form = useForm<z.input<typeof apiKeyFormSchema>, unknown, ApiKeyFormValues>({
    resolver: zodResolver(apiKeyFormSchema),
    defaultValues: {
      entityId: '',
      name: '',
      description: '',
      scopes: [],
      ipWhitelistText: '',
      prefixType: 'sk_live',
      rateLimitPerMinute: DEFAULT_API_KEY_RATE_LIMIT_PER_MINUTE,
      expiresInDays: '',
      status: 'active',
      inheritFromTree: false,
    },
  })

  useEffect(() => {
    if (!open) {
      return
    }

    form.reset({
      entityId: apiKey?.entity_ids?.[0] ?? '',
      name: apiKey?.name ?? '',
      description: apiKey?.description ?? '',
      scopes: apiKey?.scopes ?? [],
      ipWhitelistText: formatDelimitedValues(apiKey?.ip_whitelist),
      prefixType: 'sk_live',
      rateLimitPerMinute:
        apiKey?.rate_limit_per_minute ?? DEFAULT_API_KEY_RATE_LIMIT_PER_MINUTE,
      expiresInDays: '',
      status: apiKey?.status === 'suspended' ? 'suspended' : 'active',
      inheritFromTree: apiKey?.inherit_from_tree ?? false,
    })

    resetCreateMutation()
    resetUpdateMutation()
  }, [apiKey, form, open, resetCreateMutation, resetUpdateMutation])

  const entityId = useWatch({
    control: form.control,
    name: 'entityId',
  })
  const selectedScopes = useWatch({
    control: form.control,
    name: 'scopes',
    defaultValue: [],
  })
  const inheritFromTree = useWatch({
    control: form.control,
    name: 'inheritFromTree',
    defaultValue: false,
  })
  const rateLimitPerMinute = useWatch({
    control: form.control,
    name: 'rateLimitPerMinute',
    defaultValue: DEFAULT_API_KEY_RATE_LIMIT_PER_MINUTE,
  })
  const rateLimitUnlimited = isUnlimitedApiKeyRateLimit(rateLimitPerMinute)

  const grantableScopesQuery = useQuery({
    ...getGrantableScopesQueryOptions({
      entityId: entityId || undefined,
      inherit_from_tree: entityId ? inheritFromTree : false,
    }),
    enabled: open,
  })

  const selectedEntity =
    entityOptions.find((option) => option.id === entityId) ?? null
  const selectedEntityLabel = selectedEntity?.pathLabel ?? 'No entity anchor'

  const grantableScopes = useMemo(
    () => grantableScopesQuery.data?.grantable_scopes ?? [],
    [grantableScopesQuery.data?.grantable_scopes]
  )
  const scopeOptions = useMemo(
    () => uniq([...grantableScopes, ...(apiKey?.scopes ?? [])]).sort((left, right) => left.localeCompare(right)),
    [apiKey?.scopes, grantableScopes]
  )
  const selectedButNotGrantable = selectedScopes.filter(
    (scope) => !grantableScopes.includes(scope)
  )

  const submitError = createMutation.error ?? updateMutation.error
  const submitErrorMessage = submitError
    ? getApiErrorMessage(
        submitError,
        mode === 'create'
          ? 'The API key could not be created.'
          : 'The API key could not be updated.'
      )
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100svh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 px-4 py-4">
          <DialogTitle>
            {mode === 'create' ? 'Create personal API key' : 'Edit API key'}
          </DialogTitle>
        </DialogHeader>

        <form
          id="api-key-form"
          className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4"
          onSubmit={form.handleSubmit(async (values) => {
            const ipWhitelist = parseDelimitedValues(values.ipWhitelistText)
            const entityIds = values.entityId ? [values.entityId] : undefined

            try {
              if (mode === 'create') {
                const createdKey = await createMutation.mutateAsync({
                  name: values.name.trim(),
                  description: values.description?.trim() || null,
                  scopes: values.scopes,
                  prefix_type: values.prefixType.trim(),
                  ip_whitelist: ipWhitelist.length > 0 ? ipWhitelist : undefined,
                  rate_limit_per_minute: values.rateLimitPerMinute,
                  expires_in_days:
                    values.expiresInDays === ''
                      ? undefined
                      : Number(values.expiresInDays),
                  key_kind: 'personal',
                  entity_ids: entityIds,
                  inherit_from_tree: values.entityId ? values.inheritFromTree : false,
                })

                onCreated(createdKey)
                return
              }

              if (!apiKey) {
                return
              }

              const updatedKey = await updateMutation.mutateAsync({
                keyId: apiKey.id,
                name: values.name.trim(),
                description: values.description?.trim() || null,
                scopes: values.scopes,
                ip_whitelist: ipWhitelist,
                rate_limit_per_minute: values.rateLimitPerMinute,
                status: values.status,
                entity_ids: values.entityId ? [values.entityId] : [],
                inherit_from_tree: values.entityId ? values.inheritFromTree : false,
              })

              onUpdated(updatedKey)
            } catch {
              return
            }
          })}
        >
          <div className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
              <div className="space-y-4">
                <AppFormField
                  label="Name"
                  htmlFor="api-key-name"
                  errors={[form.formState.errors.name]}
                >
                  <Input
                    id="api-key-name"
                    placeholder="Reporting automation key"
                    disabled={isPending}
                    {...form.register('name')}
                  />
                </AppFormField>

                <AppFormField
                  label="Description"
                  htmlFor="api-key-description"
                  errors={[form.formState.errors.description]}
                >
                  <Textarea
                    id="api-key-description"
                    rows={3}
                    placeholder="What this key is used for and where it runs."
                    disabled={isPending}
                    {...form.register('description')}
                  />
                </AppFormField>
              </div>

              <div className="space-y-4">
                {entityHierarchyEnabled ? (
                  <div className="space-y-4">
                    <AppFormField
                      label="Anchor entity"
                      htmlFor="api-key-entity"
                      description="Leave unset for an unanchored personal key."
                      errors={[form.formState.errors.entityId]}
                    >
                      <Controller
                        control={form.control}
                        name="entityId"
                        render={({ field }) => (
                          <Select
                            value={field.value || '__none__'}
                            onValueChange={(value) => {
                              field.onChange(value === '__none__' ? '' : value)
                            }}
                            disabled={isPending}
                          >
                            <SelectTrigger id="api-key-entity" className="w-full">
                              <SelectValue>{selectedEntityLabel}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">No entity anchor</SelectItem>
                              {entityOptions.map((option) => (
                                <SelectItem key={option.id} value={option.id}>
                                  {option.pathLabel}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </AppFormField>

                    <Controller
                      control={form.control}
                      name="inheritFromTree"
                      render={({ field }) => (
                        <label className="flex w-full items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-sm">
                          <span className="space-y-0.5">
                            <span className="block font-medium">
                              Include descendant entities
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              Let this key inherit access below the selected anchor.
                            </span>
                          </span>
                          <Switch
                            checked={field.value}
                            onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                            disabled={isPending || !entityId}
                            aria-label="Include descendant entities"
                          />
                        </label>
                      )}
                    />
                    <FieldError errors={[form.formState.errors.inheritFromTree]} />
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <div className="grid max-w-4xl gap-3 sm:grid-cols-[minmax(16rem,1fr)_9rem_14rem]">
                <div className="space-y-2">
                  <Label htmlFor="api-key-rate-limit">Rate limit</Label>
                  <div className="flex items-center gap-2">
                    <InputGroup data-disabled={isPending || rateLimitUnlimited}>
                      <InputGroupInput
                        id="api-key-rate-limit"
                        type="number"
                        min={0}
                        disabled={isPending || rateLimitUnlimited}
                        {...form.register('rateLimitPerMinute')}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>req/min</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>

                    <label className="flex h-8 shrink-0 items-center gap-2 rounded-lg border bg-background px-2.5 text-sm font-medium">
                      <Switch
                        checked={rateLimitUnlimited}
                        disabled={isPending}
                        aria-label="Use unlimited rate limit"
                        onCheckedChange={(checked) => {
                          form.setValue(
                            'rateLimitPerMinute',
                            checked ? 0 : getLimitedApiKeyRateLimitFallback(rateLimitPerMinute),
                            {
                              shouldDirty: true,
                              shouldTouch: true,
                              shouldValidate: true,
                            }
                          )
                        }}
                      />
                      Unlimited
                    </label>
                  </div>
                </div>

                {mode === 'create' ? (
                  <AppFormField
                    label="Expires in days"
                    htmlFor="api-key-expires-days"
                    errors={[form.formState.errors.expiresInDays]}
                  >
                    <Input
                      id="api-key-expires-days"
                      type="number"
                      min={1}
                      placeholder="Optional"
                      disabled={isPending}
                      {...form.register('expiresInDays')}
                    />
                  </AppFormField>
                ) : (
                  <div className="space-y-2">
                    <Label>Lifecycle</Label>
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
                            <SelectValue placeholder="Select lifecycle state" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="suspended">Suspended</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                )}

                <AppFormField
                  label="Prefix type"
                  htmlFor="api-key-prefix-type"
                  errors={[form.formState.errors.prefixType]}
                >
                  <Input
                    id="api-key-prefix-type"
                    disabled={isPending || mode === 'edit'}
                    {...form.register('prefixType')}
                  />
                </AppFormField>
              </div>
              <div className="text-xs text-muted-foreground">
                Keep compact numeric settings left-aligned. Use 0 or Unlimited for trusted keys.
              </div>
              <FieldError errors={[form.formState.errors.rateLimitPerMinute]} />
              <FieldError errors={[form.formState.errors.status]} />
            </div>

            <AppFormField
              label="IP whitelist"
              htmlFor="api-key-ip-whitelist"
              description="Separate addresses or CIDR blocks with commas or new lines."
              errors={[form.formState.errors.ipWhitelistText]}
            >
              <Textarea
                id="api-key-ip-whitelist"
                rows={3}
                placeholder="203.0.113.10, 198.51.100.0/24"
                disabled={isPending}
                {...form.register('ipWhitelistText')}
              />
            </AppFormField>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <Label>Grantable permissions</Label>
                  <div className="text-xs text-muted-foreground">
                    The backend calculates this permission set from your current access and the
                    optional entity anchor.
                  </div>
                </div>
                <Badge variant="outline">Personal key</Badge>
              </div>

              <div className="rounded-2xl border px-4 py-4">
                {grantableScopesQuery.isPending ? (
                  <div className="text-sm text-muted-foreground">
                    Loading grantable permissions for this personal key…
                  </div>
                ) : grantableScopesQuery.isError ? (
                  <div className="space-y-2 text-sm">
                    <div className="font-medium text-destructive">
                      Grantable permissions could not be loaded.
                    </div>
                    <div className="text-muted-foreground">
                      {getApiErrorMessage(
                        grantableScopesQuery.error,
                        'The backend did not return permission guidance for this personal key.'
                      )}
                    </div>
                  </div>
                ) : scopeOptions.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No grantable permissions are available for the current personal-key
                    configuration.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {grantableScopesQuery.data?.personal_allowed_action_prefixes?.length ? (
                      <div className="text-xs text-muted-foreground">
                        Allowed action prefixes:{' '}
                        {grantableScopesQuery.data.personal_allowed_action_prefixes.join(', ')}
                      </div>
                    ) : null}
                    {selectedEntity ? (
                      <div className="text-xs text-muted-foreground">
                        Entity anchor: {selectedEntity.pathLabel}
                      </div>
                    ) : null}
                    <div className="grid gap-2 sm:grid-cols-2">
                      {scopeOptions.map((scope) => {
                        const isSelected = selectedScopes.includes(scope)
                        const isGrantable = grantableScopes.includes(scope)

                        return (
                          <label
                            key={scope}
                            className="flex items-start gap-3 rounded-xl border px-3 py-2 text-sm"
                          >
                            <Checkbox
                              checked={isSelected}
                              disabled={isPending}
                              onCheckedChange={(checked) => {
                                const nextScopes = checked
                                  ? uniq([...selectedScopes, scope])
                                  : selectedScopes.filter((item) => item !== scope)
                                form.setValue('scopes', nextScopes, {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                })
                              }}
                            />
                            <div className="space-y-1">
                              <div className="font-medium">{scope}</div>
                              {!isGrantable ? (
                                <div className="text-xs text-amber-700 dark:text-amber-300">
                                  This permission is already stored on the key but is not currently
                                  grantable for the selected configuration.
                                </div>
                              ) : null}
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {selectedButNotGrantable.length > 0 ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                  Some selected permissions are no longer grantable under the current
                  configuration:{' '}
                  {selectedButNotGrantable.join(', ')}.
                </div>
              ) : null}

              <FieldError errors={[form.formState.errors.scopes]} />
            </div>
          </div>

          {submitErrorMessage ? <FieldError>{submitErrorMessage}</FieldError> : null}
        </form>

        <DialogFooter className="mx-0 mb-0 shrink-0 rounded-b-xl border-t bg-muted/50 px-4 py-3">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" form="api-key-form" disabled={isPending}>
            {mode === 'create'
              ? (isPending ? 'Creating...' : 'Create API key')
              : (isPending ? 'Saving...' : 'Save changes')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
