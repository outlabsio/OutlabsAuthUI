import { useEffect } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { apiKeysKeys } from '@/features/api-keys/api/api-keys.keys'
import {
  createSystemIntegrationApiKey,
  updateSystemIntegrationApiKey,
} from '@/features/api-keys/api/integration-principals'
import type {
  ApiKey,
  CreateApiKeyResponse,
  IntegrationPrincipal,
  IntegrationPrincipalScopeKind,
} from '@/features/api-keys/types/api-keys.types'
import { formatDelimitedValues, parseDelimitedValues } from '@/features/api-keys/utils/delimited-values'
import { getApiErrorMessage } from '@/lib/api/errors'
import { withMutationToast } from '@/lib/query/mutation-toast'

const systemIntegrationApiKeyFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(200),
  description: z.string().trim().max(1000),
  scopesText: z.string().trim().min(1, 'Enter at least one scope.'),
  ipWhitelistText: z.string(),
  prefixType: z.string().trim().min(1, 'Prefix type is required.'),
  rateLimitPerMinute: z.coerce
    .number()
    .int('Enter a whole number.')
    .min(1, 'Rate limit must be at least 1.')
    .max(100000, 'Rate limit is too high.'),
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
  const form = useForm<
    SystemIntegrationApiKeyFormInput,
    unknown,
    SystemIntegrationApiKeyFormValues
  >({
    resolver: zodResolver(systemIntegrationApiKeyFormSchema),
    defaultValues: {
      name: '',
      description: '',
      scopesText: '',
      ipWhitelistText: '',
      prefixType: 'sk_live',
      rateLimitPerMinute: 60,
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
      scopesText: formatDelimitedValues(apiKey?.scopes),
      ipWhitelistText: formatDelimitedValues(apiKey?.ip_whitelist),
      prefixType: 'sk_live',
      rateLimitPerMinute: apiKey?.rate_limit_per_minute ?? 60,
      expiresInDays: '',
      status: apiKey?.status === 'suspended' ? 'suspended' : 'active',
    })
  }, [apiKey, form, open])

  const mutation = useMutation({
    mutationKey: apiKeysKeys.all,
    mutationFn: async (values: SystemIntegrationApiKeyFormValues) => {
      if (!principal) {
        throw new Error('integration principal missing')
      }

      const scopes = parseDelimitedValues(values.scopesText)

      if (scopes.length === 0) {
        form.setError('scopesText', {
          message: 'Enter at least one scope.',
        })
        throw new Error('scopes required')
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
          ? 'The system integration key could not be created.'
          : 'The system integration key could not be updated.',
      success:
        mode === 'create'
          ? 'System integration key created.'
          : 'System integration key updated.',
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
          ? 'The system integration key could not be created.'
          : 'The system integration key could not be updated.'
      )
    : null

  const isPending = mutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create system integration key' : 'Edit system integration key'}
          </DialogTitle>
          <DialogDescription>
            Create or update a principal-owned system key. Backend policy validates the selected
            scopes against the principal envelope, system-key allowlist, and actor authority.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
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
              Principal envelope
            </div>
            <div className="mt-1 text-sm font-medium">
              {principal?.name ?? 'Select an integration principal first'}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="outline">
                {scopeKind === 'entity' ? 'Entity scoped' : 'Platform global'}
              </Badge>
              {scopeKind === 'entity' && entityLabel ? (
                <Badge variant="outline">{entityLabel}</Badge>
              ) : null}
            </div>
            {principal?.allowed_scopes?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {principal.allowed_scopes.map((scope) => (
                  <Badge key={scope} variant="secondary">
                    {scope}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="system-api-key-name">Name</Label>
              <Input
                id="system-api-key-name"
                placeholder="Office sync key"
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

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="system-api-key-scopes">Scopes</Label>
              <Textarea
                id="system-api-key-scopes"
                rows={5}
                placeholder="entity:read, membership:read"
                disabled={isPending}
                {...form.register('scopesText')}
              />
              <div className="text-xs text-muted-foreground">
                Separate scopes with commas or new lines. Scopes must fit the integration
                principal envelope shown above.
              </div>
              <FieldError errors={[form.formState.errors.scopesText]} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="system-api-key-rate-limit">Rate limit per minute</Label>
              <Input
                id="system-api-key-rate-limit"
                type="number"
                min={1}
                disabled={isPending}
                {...form.register('rateLimitPerMinute')}
              />
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !principal}>
              {isPending
                ? mode === 'create'
                  ? 'Creating...'
                  : 'Saving...'
                : mode === 'create'
                  ? 'Create key'
                  : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
