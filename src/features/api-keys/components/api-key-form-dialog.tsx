import { useEffect } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Controller, useForm } from 'react-hook-form'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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
import type { EntityOption } from '@/features/entities/utils/build-entity-options'
import { getApiErrorMessage } from '@/lib/api/errors'

type ApiKeyFormDialogProps = {
  open: boolean
  mode: 'create' | 'edit'
  apiKey: ApiKey | null
  availableScopes: string[]
  entityOptions: EntityOption[]
  onOpenChange: (open: boolean) => void
  onCreated: (apiKey: CreateApiKeyResponse) => void
  onUpdated: (apiKey: ApiKey) => void
}

const noEntityValue = '__none__'

function parseDelimitedValues(value: string) {
  return value
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatDelimitedValues(values?: string[] | null) {
  return (values ?? []).join(', ')
}

export function ApiKeyFormDialog({
  open,
  mode,
  apiKey,
  availableScopes,
  entityOptions,
  onOpenChange,
  onCreated,
  onUpdated,
}: ApiKeyFormDialogProps) {
  const createMutation = useCreateApiKeyMutation()
  const updateMutation = useUpdateApiKeyMutation()
  const isPending = createMutation.isPending || updateMutation.isPending
  const form = useForm<z.input<typeof apiKeyFormSchema>, unknown, ApiKeyFormValues>({
    resolver: zodResolver(apiKeyFormSchema),
    defaultValues: {
      name: '',
      description: '',
      scopesText: '',
      ipWhitelistText: '',
      prefixType: 'sk_live',
      rateLimitPerMinute: 60,
      expiresInDays: '',
      status: 'active',
      entityId: '',
    },
  })

  useEffect(() => {
    if (!open) {
      return
    }

    form.reset({
      name: apiKey?.name ?? '',
      description: apiKey?.description ?? '',
      scopesText: formatDelimitedValues(apiKey?.scopes),
      ipWhitelistText: formatDelimitedValues(apiKey?.ip_whitelist),
      prefixType: 'sk_live',
      rateLimitPerMinute: apiKey?.rate_limit_per_minute ?? 60,
      expiresInDays: '',
      status:
        apiKey?.status === 'suspended'
          ? 'suspended'
          : 'active',
      entityId: apiKey?.entity_ids?.[0] ?? '',
    })

    createMutation.reset()
    updateMutation.reset()
  }, [apiKey?.id, apiKey?.status, form, open])

  const submitError = createMutation.error ?? updateMutation.error
  const submitErrorMessage = submitError
    ? getApiErrorMessage(
        submitError,
        mode === 'create'
          ? 'The API key could not be created.'
          : 'The API key could not be updated.'
      )
    : null

  const hasEntityScopeOptions = entityOptions.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create API key' : 'Edit API key'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'The full secret is only returned once, immediately after creation.'
              : 'Update operational settings without exposing the stored secret again.'}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={form.handleSubmit(async (values) => {
            const scopes = parseDelimitedValues(values.scopesText)
            const ipWhitelist = parseDelimitedValues(values.ipWhitelistText)
            const entityIds = values.entityId ? [values.entityId] : []

            try {
              if (mode === 'create') {
                const createdKey = await createMutation.mutateAsync({
                  name: values.name.trim(),
                  description: values.description?.trim() || null,
                  scopes,
                  prefix_type: values.prefixType.trim(),
                  ip_whitelist: ipWhitelist.length > 0 ? ipWhitelist : undefined,
                  rate_limit_per_minute: values.rateLimitPerMinute,
                  expires_in_days:
                    values.expiresInDays === ''
                      ? undefined
                      : Number(values.expiresInDays),
                  entity_ids: entityIds.length > 0 ? entityIds : undefined,
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
                scopes,
                ip_whitelist: ipWhitelist,
                rate_limit_per_minute: values.rateLimitPerMinute,
                status: values.status,
                entity_ids: entityIds,
              })

              onUpdated(updatedKey)
            } catch {
              return
            }
          })}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="api-key-name">Name</Label>
              <Input
                id="api-key-name"
                placeholder="Operations integration"
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

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="api-key-scopes">Scopes</Label>
              <Textarea
                id="api-key-scopes"
                rows={4}
                placeholder="permission:read, permission:update"
                disabled={isPending}
                {...form.register('scopesText')}
              />
              <div className="text-xs text-muted-foreground">
                Separate values with commas or new lines.
                {availableScopes.length > 0
                  ? ` Available in this backend: ${availableScopes.slice(0, 8).join(', ')}${availableScopes.length > 8 ? '...' : ''}`
                  : ''}
              </div>
              <FieldError errors={[form.formState.errors.scopesText]} />
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
                      onValueChange={(nextValue) => {
                        form.setValue(
                          'status',
                          nextValue as ApiKeyFormValues['status'],
                          {
                            shouldDirty: true,
                            shouldValidate: true,
                          }
                        )
                      }}
                      disabled={isPending || apiKey?.status === 'revoked'}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose lifecycle" />
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

            {mode === 'create' ? (
              <div className="space-y-2">
                <Label htmlFor="api-key-prefix-type">Prefix type</Label>
                <Input
                  id="api-key-prefix-type"
                  placeholder="sk_live"
                  disabled={isPending}
                  {...form.register('prefixType')}
                />
                <FieldError errors={[form.formState.errors.prefixType]} />
              </div>
            ) : null}

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="api-key-ip-whitelist">IP whitelist</Label>
              <Textarea
                id="api-key-ip-whitelist"
                rows={3}
                placeholder="203.0.113.4, 198.51.100.8"
                disabled={isPending}
                {...form.register('ipWhitelistText')}
              />
              <div className="text-xs text-muted-foreground">
                Leave empty to allow any source IP.
              </div>
              <FieldError errors={[form.formState.errors.ipWhitelistText]} />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Entity restriction</Label>
              {hasEntityScopeOptions ? (
                <Controller
                  control={form.control}
                  name="entityId"
                  render={({ field }) => (
                    <Select
                      value={field.value || noEntityValue}
                      onValueChange={(nextValue) => {
                        form.setValue(
                          'entityId',
                          nextValue == null || nextValue === noEntityValue ? '' : nextValue,
                          {
                            shouldDirty: true,
                            shouldValidate: true,
                          }
                        )
                      }}
                      disabled={isPending}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="No entity restriction" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={noEntityValue}>
                          No entity restriction
                        </SelectItem>
                        {entityOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.pathLabel}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              ) : (
                <div className="rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground">
                  Entity names are unavailable to the current session, so this key cannot be
                  scoped to a specific entity from this form.
                </div>
              )}
            </div>
          </div>

          {submitErrorMessage ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-3 text-sm text-destructive">
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
            <Button type="submit" disabled={isPending}>
              {isPending
                ? mode === 'create'
                  ? 'Creating...'
                  : 'Saving...'
                : mode === 'create'
                  ? 'Create API key'
                  : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
