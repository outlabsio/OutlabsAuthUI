import { useEffect, useMemo, useState } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { apiKeysKeys } from '@/features/api-keys/api/api-keys.keys'
import {
  createSystemIntegrationApiKey,
  updateSystemIntegrationApiKey,
} from '@/features/api-keys/api/integration-principals'
import { apiKeyRateLimitPerMinuteSchema } from '@/features/api-keys/schemas/api-key-form.schema'
import type {
  ApiKey,
  CreateApiKeyResponse,
  IntegrationPrincipal,
  IntegrationPrincipalScopeKind,
} from '@/features/api-keys/types/api-keys.types'
import { parseDelimitedValues } from '@/features/api-keys/utils/delimited-values'
import {
  DEFAULT_API_KEY_RATE_LIMIT_PER_MINUTE,
  getLimitedApiKeyRateLimitFallback,
  isUnlimitedApiKeyRateLimit,
} from '@/features/api-keys/utils/rate-limit'
import { RolePermissionsPicker } from '@/features/roles/components/role-permissions-picker'
import type { RolePermissionOption } from '@/features/roles/types/role-permission-option.types'
import { formatRoleToken } from '@/features/roles/utils/role-display'
import { getApiErrorMessage } from '@/lib/api/errors'
import { withMutationToast } from '@/lib/query/mutation-toast'

const systemIntegrationApiKeyFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(200),
  description: z.string().trim().max(1000),
  accessMode: z.enum(['full', 'restricted']),
  selectedScopes: z.array(z.string()),
  ipWhitelistText: z.string(),
  prefixType: z.string().trim().min(1, 'Prefix type is required.'),
  rateLimitPerMinute: apiKeyRateLimitPerMinuteSchema,
  expiresInDays: z.union([
    z.literal(''),
    z.coerce
      .number()
      .int('Enter a whole number of days.')
      .min(1, 'Expiration must be at least 1 day.')
      .max(3650, 'Expiration is too far in the future.'),
  ]),
  status: z.enum(['active', 'suspended']),
})

type SystemIntegrationApiKeyFormValues = z.infer<typeof systemIntegrationApiKeyFormSchema>
type SystemIntegrationApiKeyFormInput = z.input<typeof systemIntegrationApiKeyFormSchema>

type SystemIntegrationApiKeyFormDialogProps = {
  open: boolean
  mode: 'create' | 'edit'
  scopeKind: IntegrationPrincipalScopeKind
  entityId?: string
  entityLabel?: string | null
  principal: IntegrationPrincipal | null
  apiKey: ApiKey | null
  onOpenChange: (open: boolean) => void
  onCreated: (apiKey: CreateApiKeyResponse) => void
  onUpdated: (apiKey: ApiKey) => void
}

function buildPermissionOptions(permissionNames: string[]): RolePermissionOption[] {
  return permissionNames
    .map((permissionName) => {
      const resource = permissionName.split(':')[0] || 'general'

      return {
        name: permissionName,
        label: formatRoleToken(permissionName),
        resource,
        description: null,
      }
    })
    .sort((left, right) => left.label.localeCompare(right.label))
}

export function SystemIntegrationApiKeyFormDialog({
  open,
  mode,
  scopeKind,
  entityId,
  entityLabel,
  principal,
  apiKey,
  onOpenChange,
  onCreated,
  onUpdated,
}: SystemIntegrationApiKeyFormDialogProps) {
  const queryClient = useQueryClient()
  const [showSelectedOnly, setShowSelectedOnly] = useState(false)
  const [visiblePermissionCount, setVisiblePermissionCount] = useState(0)
  const principalAllowedScopes = useMemo(
    () => principal?.effective_allowed_scopes ?? principal?.allowed_scopes ?? [],
    [principal?.allowed_scopes, principal?.effective_allowed_scopes]
  )
  const permissionOptions = useMemo(
    () => buildPermissionOptions(principalAllowedScopes),
    [principalAllowedScopes]
  )
  const form = useForm<
    SystemIntegrationApiKeyFormInput,
    unknown,
    SystemIntegrationApiKeyFormValues
  >({
    resolver: zodResolver(systemIntegrationApiKeyFormSchema),
    defaultValues: {
      name: '',
      description: '',
      accessMode: 'full',
      selectedScopes: [],
      ipWhitelistText: '',
      prefixType: 'sk_live',
      rateLimitPerMinute: DEFAULT_API_KEY_RATE_LIMIT_PER_MINUTE,
      expiresInDays: '',
      status: 'active',
    },
  })

  useEffect(() => {
    if (!open) {
      return
    }

    form.reset({
      name: apiKey?.name ?? '',
      description: apiKey?.description ?? '',
      accessMode: apiKey && apiKey.scopes.length > 0 ? 'restricted' : 'full',
      selectedScopes: apiKey?.scopes ?? [],
      ipWhitelistText: (apiKey?.ip_whitelist ?? []).join('\n'),
      prefixType: 'sk_live',
      rateLimitPerMinute:
        apiKey?.rate_limit_per_minute ?? DEFAULT_API_KEY_RATE_LIMIT_PER_MINUTE,
      expiresInDays: '',
      status: apiKey?.status === 'suspended' ? 'suspended' : 'active',
    })
  }, [apiKey, form, open])

  const accessMode = useWatch({
    control: form.control,
    name: 'accessMode',
    defaultValue: 'full',
  })
  const selectedScopes = useWatch({
    control: form.control,
    name: 'selectedScopes',
    defaultValue: [],
  })
  const rateLimitPerMinute = useWatch({
    control: form.control,
    name: 'rateLimitPerMinute',
    defaultValue: DEFAULT_API_KEY_RATE_LIMIT_PER_MINUTE,
  })
  const rateLimitUnlimited = isUnlimitedApiKeyRateLimit(rateLimitPerMinute)

  const mutation = useMutation({
    mutationKey: apiKeysKeys.all,
    mutationFn: async (values: SystemIntegrationApiKeyFormValues) => {
      if (!principal) {
        throw new Error('integration principal missing')
      }

      const scopes = values.accessMode === 'full' ? [] : values.selectedScopes

      if (values.accessMode === 'restricted' && scopes.length === 0) {
        form.setError('selectedScopes', {
          message: 'Choose at least one permission or use full access.',
        })
        throw new Error('restricted scopes required')
      }

      const ipWhitelist = parseDelimitedValues(values.ipWhitelistText)

      if (mode === 'create') {
        return createSystemIntegrationApiKey({
          scopeKind,
          entityId,
          principalId: principal.id,
          name: values.name.trim(),
          description: values.description.trim() || null,
          scopes,
          prefix_type: values.prefixType.trim(),
          ip_whitelist: ipWhitelist.length > 0 ? ipWhitelist : undefined,
          rate_limit_per_minute: values.rateLimitPerMinute,
          expires_in_days:
            values.expiresInDays === '' ? undefined : Number(values.expiresInDays),
        })
      }

      if (!apiKey) {
        throw new Error('system integration key missing')
      }

      return updateSystemIntegrationApiKey({
        scopeKind,
        entityId,
        principalId: principal.id,
        keyId: apiKey.id,
        name: values.name.trim(),
        description: values.description.trim() || null,
        scopes,
        ip_whitelist: ipWhitelist,
        rate_limit_per_minute: values.rateLimitPerMinute,
        status: values.status,
      })
    },
    meta: withMutationToast({
      error:
        mode === 'create'
          ? 'The machine API key could not be created.'
          : 'The machine API key could not be updated.',
      success:
        mode === 'create'
          ? 'Machine API key created.'
          : 'Machine API key updated.',
      skipErrorToast: true,
    }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysKeys.all,
      })

      if (mode === 'create') {
        onCreated(result as CreateApiKeyResponse)
      } else {
        onUpdated(result as ApiKey)
      }
    },
  })

  const submitError = mutation.error
    ? getApiErrorMessage(
        mutation.error,
        mode === 'create'
          ? 'The machine API key could not be created.'
          : 'The machine API key could not be updated.'
      )
    : null

  const isPending = mutation.isPending
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setShowSelectedOnly(false)
    }

    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[calc(100svh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 px-4 py-4">
          <DialogTitle>
            {mode === 'create' ? 'Create machine API key' : 'Edit machine API key'}
          </DialogTitle>
          <DialogDescription>
            Create or update a service-account-owned key. Full access inherits every permission
            from the service account envelope; restricted access narrows the key to a subset.
          </DialogDescription>
        </DialogHeader>

        <form
          id="system-integration-api-key-form"
          className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              await mutation.mutateAsync(values)
            } catch {
              return
            }
          })}
        >
          <div className="rounded-2xl border bg-muted/20 px-4 py-3">
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Service-account envelope
            </div>
            <div className="mt-1 text-sm font-medium">
              {principal?.name ?? 'Select a service account first'}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="outline">
                {scopeKind === 'entity' ? 'Entity scoped' : 'Platform global'}
              </Badge>
              {scopeKind === 'entity' && entityLabel ? (
                <Badge variant="outline">{entityLabel}</Badge>
              ) : null}
              <Badge variant="outline">{principalAllowedScopes.length} permissions</Badge>
            </div>
            <div className="mt-3 flex max-h-28 flex-wrap gap-2 overflow-auto pr-1">
              {principalAllowedScopes.length > 0 ? (
                principalAllowedScopes.map((scope) => (
                  <Badge key={scope} variant="secondary">
                    {formatRoleToken(scope)}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">
                  This service account does not currently derive any permissions.
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="system-api-key-name">Name</Label>
              <Input
                id="system-api-key-name"
                placeholder="Scraping Worker Key"
                disabled={isPending}
                {...form.register('name')}
              />
              <FieldError errors={[form.formState.errors.name]} />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="system-api-key-description">Description</Label>
              <Textarea
                id="system-api-key-description"
                rows={3}
                placeholder="What this key is used for."
                disabled={isPending}
                {...form.register('description')}
              />
              <FieldError errors={[form.formState.errors.description]} />
            </div>

            <div className="space-y-3 sm:col-span-2">
              <div className="space-y-1">
                <Label>Access model</Label>
                <p className="text-xs text-muted-foreground">
                  Full access inherits every service-account permission. Restricted access narrows
                  the key to a chosen subset.
                </p>
              </div>
              <Controller
                control={form.control}
                name="accessMode"
                render={({ field }) => (
                  <RadioGroup
                    value={field.value}
                    onValueChange={(value) => field.onChange(value)}
                    className="grid gap-3 md:grid-cols-2"
                  >
                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-4">
                      <RadioGroupItem value="full" />
                      <div className="space-y-1">
                        <div className="font-medium">Full service-account access</div>
                        <p className="text-sm text-muted-foreground">
                          The key inherits all {principalAllowedScopes.length} permissions from the
                          selected service account.
                        </p>
                      </div>
                    </label>
                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-4">
                      <RadioGroupItem value="restricted" />
                      <div className="space-y-1">
                        <div className="font-medium">Restricted access</div>
                        <p className="text-sm text-muted-foreground">
                          Choose a smaller permission set for this specific key.
                        </p>
                      </div>
                    </label>
                  </RadioGroup>
                )}
              />
            </div>

            {accessMode === 'restricted' ? (
              <div className="space-y-3 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Label>Restricted permissions</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Filter and select the permissions this key should keep.
                    </p>
                  </div>
                  <Badge variant="outline">
                    {selectedScopes.length} selected · {visiblePermissionCount} visible
                  </Badge>
                </div>

                <RolePermissionsPicker
                  permissionOptions={permissionOptions}
                  selectedPermissionNames={selectedScopes}
                  showSelectedOnly={showSelectedOnly}
                  disabled={isPending || permissionOptions.length === 0}
                  onShowSelectedOnlyChange={setShowSelectedOnly}
                  onVisiblePermissionCountChange={setVisiblePermissionCount}
                  onChange={(permissionNames) =>
                    form.setValue('selectedScopes', permissionNames, {
                      shouldDirty: true,
                      shouldTouch: true,
                      shouldValidate: true,
                    })
                  }
                />
                <FieldError errors={[form.formState.errors.selectedScopes]} />
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="system-api-key-rate-limit">Rate limit per minute</Label>
                <label className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm font-medium">
                  <span className={rateLimitUnlimited ? 'text-foreground' : 'text-muted-foreground'}>
                    Unlimited
                  </span>
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
                </label>
              </div>
              <Input
                id="system-api-key-rate-limit"
                type="number"
                min={0}
                readOnly={rateLimitUnlimited}
                disabled={isPending}
                {...form.register('rateLimitPerMinute')}
              />
              <div className="text-xs text-muted-foreground">
                Use 0 or the Unlimited switch for trusted service keys that should not be throttled.
              </div>
              <FieldError errors={[form.formState.errors.rateLimitPerMinute]} />
            </div>

            {mode === 'create' ? (
              <div className="space-y-2">
                <Label htmlFor="system-api-key-expires-days">Expires in days</Label>
                <Input
                  id="system-api-key-expires-days"
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
              <Label htmlFor="system-api-key-prefix-type">Prefix type</Label>
              <Input
                id="system-api-key-prefix-type"
                disabled={isPending || mode === 'edit'}
                {...form.register('prefixType')}
              />
              <FieldError errors={[form.formState.errors.prefixType]} />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="system-api-key-ip-whitelist">IP whitelist</Label>
              <Textarea
                id="system-api-key-ip-whitelist"
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
          </div>

          {submitError ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {submitError}
            </div>
          ) : null}
        </form>

        <DialogFooter className="mx-0 mb-0 shrink-0 rounded-b-xl border-t bg-muted/50 px-4 py-3">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="system-integration-api-key-form"
            disabled={isPending || !principal || principalAllowedScopes.length === 0}
          >
            {isPending
              ? mode === 'create'
                ? 'Creating...'
                : 'Saving...'
              : mode === 'create'
                ? 'Create key'
                : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
