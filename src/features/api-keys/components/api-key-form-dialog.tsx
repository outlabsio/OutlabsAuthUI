import { useEffect, useMemo } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Badge } from '@/components/ui/badge'
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
import { getApiErrorMessage } from '@/lib/api/errors'

export type ApiKeyOwnerOption = {
  id: string
  label: string
  subtitle: string
}

type ApiKeyFormDialogProps = {
  open: boolean
  mode: 'create' | 'edit'
  entityId: string
  entityLabel: string
  apiKey: ApiKey | null
  ownerOptions: ApiKeyOwnerOption[]
  defaultOwnerId?: string | null
  onOpenChange: (open: boolean) => void
  onCreated: (apiKey: CreateApiKeyResponse) => void
  onUpdated: (apiKey: ApiKey) => void
}

function parseDelimitedValues(value: string) {
  return value
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatDelimitedValues(values?: string[] | null) {
  return (values ?? []).join(', ')
}

function uniq(values: string[]) {
  return Array.from(new Set(values))
}

function getInitialOwnerId({
  apiKey,
  defaultOwnerId,
  ownerOptions,
}: {
  apiKey: ApiKey | null
  defaultOwnerId?: string | null
  ownerOptions: ApiKeyOwnerOption[]
}) {
  if (apiKey?.owner_id) {
    return apiKey.owner_id
  }

  if (defaultOwnerId && ownerOptions.some((option) => option.id === defaultOwnerId)) {
    return defaultOwnerId
  }

  return ownerOptions[0]?.id ?? ''
}

export function ApiKeyFormDialog({
  open,
  mode,
  entityId,
  entityLabel,
  apiKey,
  ownerOptions,
  defaultOwnerId,
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
      ownerId: '',
      name: '',
      description: '',
      scopes: [],
      ipWhitelistText: '',
      prefixType: 'sk_live',
      rateLimitPerMinute: 60,
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
      ownerId: getInitialOwnerId({
        apiKey,
        defaultOwnerId,
        ownerOptions,
      }),
      name: apiKey?.name ?? '',
      description: apiKey?.description ?? '',
      scopes: apiKey?.scopes ?? [],
      ipWhitelistText: formatDelimitedValues(apiKey?.ip_whitelist),
      prefixType: 'sk_live',
      rateLimitPerMinute: apiKey?.rate_limit_per_minute ?? 60,
      expiresInDays: '',
      status: apiKey?.status === 'suspended' ? 'suspended' : 'active',
      inheritFromTree: apiKey?.inherit_from_tree ?? false,
    })

    resetCreateMutation()
    resetUpdateMutation()
  }, [apiKey, defaultOwnerId, form, open, ownerOptions, resetCreateMutation, resetUpdateMutation])

  const ownerId = useWatch({
    control: form.control,
    name: 'ownerId',
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

  const grantableScopesQuery = useQuery({
    ...getGrantableScopesQueryOptions({
      entityId,
      ownerId,
      keyKind: 'personal',
      inherit_from_tree: inheritFromTree,
    }),
    enabled: open && Boolean(entityId) && Boolean(ownerId),
  })

  const selectedOwner =
    ownerOptions.find((option) => option.id === ownerId) ??
    ownerOptions.find((option) => option.id === apiKey?.owner_id) ??
    null

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
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create API key' : 'Edit API key'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Create an entity-anchored personal key. The full secret is only returned once, immediately after creation.'
              : 'Update the selected key without exposing the stored secret again.'}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={form.handleSubmit(async (values) => {
            const ipWhitelist = parseDelimitedValues(values.ipWhitelistText)

            try {
              if (mode === 'create') {
                const createdKey = await createMutation.mutateAsync({
                  entityId,
                  owner_id: values.ownerId,
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
                  inherit_from_tree: values.inheritFromTree,
                })

                onCreated(createdKey)
                return
              }

              if (!apiKey) {
                return
              }

              const updatedKey = await updateMutation.mutateAsync({
                entityId,
                keyId: apiKey.id,
                name: values.name.trim(),
                description: values.description?.trim() || null,
                scopes: values.scopes,
                ip_whitelist: ipWhitelist,
                rate_limit_per_minute: values.rateLimitPerMinute,
                status: values.status,
                inherit_from_tree: values.inheritFromTree,
              })

              onUpdated(updatedKey)
            } catch {
              return
            }
          })}
        >
          <div className="rounded-2xl border bg-muted/20 px-4 py-3">
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Anchor entity
            </div>
            <div className="mt-1 text-sm font-medium">{entityLabel}</div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="api-key-owner">Owner</Label>
              {mode === 'create' ? (
                <Controller
                  control={form.control}
                  name="ownerId"
                  render={({ field }) => (
                    <Combobox
                      items={ownerOptions}
                      itemToStringValue={(item) =>
                        item ? `${item.label} ${item.subtitle}` : ''
                      }
                      value={ownerOptions.find((option) => option.id === field.value) ?? null}
                      onValueChange={(value) => {
                        field.onChange(value?.id ?? '')
                      }}
                      disabled={isPending || ownerOptions.length === 0}
                    >
                      <ComboboxInput
                        id="api-key-owner"
                        placeholder="Search entity members"
                        className="w-full"
                        showClear
                      />
                      <ComboboxContent align="start">
                        <ComboboxEmpty>No matching members found.</ComboboxEmpty>
                        <ComboboxList>
                          {(option) => (
                            <ComboboxItem
                              key={option.id}
                              value={option}
                              className="items-start py-2.5"
                            >
                              <div className="flex min-w-0 flex-col gap-1">
                                <span className="font-medium">{option.label}</span>
                                <span className="truncate text-xs text-muted-foreground">
                                  {option.subtitle}
                                </span>
                              </div>
                            </ComboboxItem>
                          )}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                  )}
                />
              ) : (
                <div className="rounded-xl border px-3 py-2 text-sm">
                  <div className="font-medium">
                    {selectedOwner?.label ?? apiKey?.owner_id ?? 'Unknown owner'}
                  </div>
                  <div className="text-muted-foreground">
                    {selectedOwner?.subtitle ?? 'Owner is fixed after creation.'}
                  </div>
                </div>
              )}
              <FieldError errors={[form.formState.errors.ownerId]} />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="api-key-name">Name</Label>
              <Input
                id="api-key-name"
                placeholder="Support automation key"
                disabled={isPending}
                {...form.register('name')}
              />
              <FieldError errors={[form.formState.errors.name]} />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="api-key-description">Description</Label>
              <Textarea
                id="api-key-description"
                rows={3}
                placeholder="Who owns this key and what it is allowed to do."
                disabled={isPending}
                {...form.register('description')}
              />
              <FieldError errors={[form.formState.errors.description]} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="api-key-rate-limit">Rate limit per minute</Label>
              <Input
                id="api-key-rate-limit"
                type="number"
                min={1}
                disabled={isPending}
                {...form.register('rateLimitPerMinute')}
              />
              <FieldError errors={[form.formState.errors.rateLimitPerMinute]} />
            </div>

            {mode === 'create' ? (
              <div className="space-y-2">
                <Label htmlFor="api-key-expires-days">Expires in days</Label>
                <Input
                  id="api-key-expires-days"
                  type="number"
                  min={1}
                  placeholder="Optional"
                  disabled={isPending}
                  {...form.register('expiresInDays')}
                />
                <FieldError errors={[form.formState.errors.expiresInDays]} />
              </div>
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
                <FieldError errors={[form.formState.errors.status]} />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="api-key-prefix-type">Prefix type</Label>
              <Input
                id="api-key-prefix-type"
                disabled={isPending || mode === 'edit'}
                {...form.register('prefixType')}
              />
              <div className="text-xs text-muted-foreground">
                Keep the production prefix unless you have a test-environment reason to change it.
              </div>
              <FieldError errors={[form.formState.errors.prefixType]} />
            </div>

            <div className="space-y-2">
              <Label className="block">Hierarchy</Label>
              <Controller
                control={form.control}
                name="inheritFromTree"
                render={({ field }) => (
                  <label className="flex min-h-10 items-start gap-3 rounded-xl border px-3 py-2 text-sm">
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                      disabled={isPending}
                    />
                    <span>
                      Allow descendant access from this entity anchor.
                    </span>
                  </label>
                )}
              />
              <FieldError errors={[form.formState.errors.inheritFromTree]} />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="api-key-ip-whitelist">IP whitelist</Label>
              <Textarea
                id="api-key-ip-whitelist"
                rows={3}
                placeholder="203.0.113.10, 198.51.100.0/24"
                disabled={isPending}
                {...form.register('ipWhitelistText')}
              />
              <div className="text-xs text-muted-foreground">
                Separate addresses or CIDR blocks with commas or new lines.
              </div>
              <FieldError errors={[form.formState.errors.ipWhitelistText]} />
            </div>

            <div className="space-y-3 sm:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <Label>Grantable scopes</Label>
                  <div className="text-xs text-muted-foreground">
                    The backend calculates these from actor authority, owner permissions, key kind,
                    and entity anchor.
                  </div>
                </div>
                <Badge variant="outline">Personal key</Badge>
              </div>

              <div className="rounded-2xl border px-4 py-4">
                {grantableScopesQuery.isPending ? (
                  <div className="text-sm text-muted-foreground">
                    Loading grantable scopes for the selected owner…
                  </div>
                ) : grantableScopesQuery.isError ? (
                  <div className="space-y-2 text-sm">
                    <div className="font-medium text-destructive">
                      Grantable scopes could not be loaded.
                    </div>
                    <div className="text-muted-foreground">
                      {getApiErrorMessage(
                        grantableScopesQuery.error,
                        'The backend did not return scope guidance for this owner and entity.'
                      )}
                    </div>
                  </div>
                ) : scopeOptions.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No grantable scopes are available for this owner in the selected entity.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {grantableScopesQuery.data?.personal_allowed_action_prefixes?.length ? (
                      <div className="text-xs text-muted-foreground">
                        Allowed action prefixes:{' '}
                        {grantableScopesQuery.data.personal_allowed_action_prefixes.join(', ')}
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
                                  This scope is already stored on the key but is not currently
                                  grantable for the selected owner configuration.
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
                  Some selected scopes are no longer grantable under the current owner or
                  hierarchy settings: {selectedButNotGrantable.join(', ')}.
                </div>
              ) : null}

              <FieldError errors={[form.formState.errors.scopes]} />
            </div>
          </div>

          {submitErrorMessage ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {submitErrorMessage}
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
            <Button type="submit" disabled={isPending || !entityId}>
              {mode === 'create'
                ? (isPending ? 'Creating...' : 'Create API key')
                : (isPending ? 'Saving...' : 'Save changes')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
