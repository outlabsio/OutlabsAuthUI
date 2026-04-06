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
import { apiKeysKeys } from '@/features/api-keys/api/api-keys.keys'
import {
  createIntegrationPrincipal,
  updateIntegrationPrincipal,
} from '@/features/api-keys/api/integration-principals'
import type {
  IntegrationPrincipal,
  IntegrationPrincipalScopeKind,
} from '@/features/api-keys/types/api-keys.types'
import { formatDelimitedValues, parseDelimitedValues } from '@/features/api-keys/utils/delimited-values'
import { getApiErrorMessage } from '@/lib/api/errors'
import { withMutationToast } from '@/lib/query/mutation-toast'

const integrationPrincipalFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(200),
  description: z.string().trim().max(1000),
  allowedScopesText: z.string().trim().min(1, 'Enter at least one allowed scope.'),
  status: z.enum(['active', 'inactive']),
  inheritFromTree: z.boolean(),
})

type IntegrationPrincipalFormValues = z.infer<typeof integrationPrincipalFormSchema>

type IntegrationPrincipalFormDialogProps = {
  open: boolean
  mode: 'create' | 'edit'
  scopeKind: IntegrationPrincipalScopeKind
  entityId?: string
  entityLabel?: string | null
  principal: IntegrationPrincipal | null
  onOpenChange: (open: boolean) => void
  onCreated: (principal: IntegrationPrincipal) => void
  onUpdated: (principal: IntegrationPrincipal) => void
}

export function IntegrationPrincipalFormDialog({
  open,
  mode,
  scopeKind,
  entityId,
  entityLabel,
  principal,
  onOpenChange,
  onCreated,
  onUpdated,
}: IntegrationPrincipalFormDialogProps) {
  const queryClient = useQueryClient()
  const form = useForm<IntegrationPrincipalFormValues>({
    resolver: zodResolver(integrationPrincipalFormSchema),
    defaultValues: {
      name: '',
      description: '',
      allowedScopesText: '',
      status: 'active',
      inheritFromTree: false,
    },
  })

  useEffect(() => {
    if (!open) {
      return
    }

    form.reset({
      name: principal?.name ?? '',
      description: principal?.description ?? '',
      allowedScopesText: formatDelimitedValues(principal?.allowed_scopes),
      status: principal?.status === 'inactive' ? 'inactive' : 'active',
      inheritFromTree: principal?.inherit_from_tree ?? false,
    })
  }, [form, open, principal])

  const mutation = useMutation({
    mutationKey: apiKeysKeys.all,
    mutationFn: async (values: IntegrationPrincipalFormValues) => {
      const allowedScopes = parseDelimitedValues(values.allowedScopesText)

      if (allowedScopes.length === 0) {
        form.setError('allowedScopesText', {
          message: 'Enter at least one allowed scope.',
        })
        throw new Error('allowed scopes required')
      }

      if (mode === 'create') {
        return createIntegrationPrincipal({
          scopeKind,
          entityId,
          name: values.name.trim(),
          description: values.description.trim() || null,
          allowed_scopes: allowedScopes,
          inherit_from_tree: scopeKind === 'entity' ? values.inheritFromTree : false,
        })
      }

      if (!principal) {
        throw new Error('integration principal missing')
      }

      return updateIntegrationPrincipal({
        scopeKind,
        entityId,
        principalId: principal.id,
        name: values.name.trim(),
        description: values.description.trim() || null,
        status: values.status,
        allowed_scopes: allowedScopes,
        inherit_from_tree: scopeKind === 'entity' ? values.inheritFromTree : false,
      })
    },
    meta: withMutationToast({
      error:
        mode === 'create'
          ? 'The integration principal could not be created.'
          : 'The integration principal could not be updated.',
      success:
        mode === 'create'
          ? 'Integration principal created.'
          : 'Integration principal updated.',
      skipErrorToast: true,
    }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysKeys.all,
      })

      if (mode === 'create') {
        onCreated(result)
      } else {
        onUpdated(result)
      }
    },
  })

  const submitError = mutation.error
    ? getApiErrorMessage(
        mutation.error,
        mode === 'create'
          ? 'The integration principal could not be created.'
          : 'The integration principal could not be updated.'
      )
    : null

  const isPending = mutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create integration principal' : 'Edit integration principal'}
          </DialogTitle>
          <DialogDescription>
            {scopeKind === 'entity'
              ? 'Define a durable non-human integration for the selected entity tree. Backend policy still validates grantability and system-key scope rules when you save.'
              : 'Define a platform-global integration principal. This surface is superuser-only and is intended for global external integrations rather than internal service tokens.'}
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
              Scope model
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {scopeKind === 'entity' ? 'Entity scoped' : 'Platform global'}
              </Badge>
              {scopeKind === 'entity' && entityLabel ? (
                <span className="text-sm text-muted-foreground">{entityLabel}</span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="integration-principal-name">Name</Label>
              <Input
                id="integration-principal-name"
                placeholder="Office sync worker"
                disabled={isPending}
                {...form.register('name')}
              />
              <FieldError errors={[form.formState.errors.name]} />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="integration-principal-description">Description</Label>
              <Textarea
                id="integration-principal-description"
                rows={3}
                placeholder="What this integration does and who operates it."
                disabled={isPending}
                {...form.register('description')}
              />
              <FieldError errors={[form.formState.errors.description]} />
            </div>

            {mode === 'edit' ? (
              <div className="space-y-2">
                <Label>Status</Label>
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
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[form.formState.errors.status]} />
              </div>
            ) : null}

            {scopeKind === 'entity' ? (
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
                      <span>Allow keys under this principal to inherit descendant entity access.</span>
                    </label>
                  )}
                />
                <FieldError errors={[form.formState.errors.inheritFromTree]} />
              </div>
            ) : null}

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="integration-principal-allowed-scopes">Allowed scopes</Label>
              <Textarea
                id="integration-principal-allowed-scopes"
                rows={5}
                placeholder="entity:read, membership:read"
                disabled={isPending}
                {...form.register('allowedScopesText')}
              />
              <div className="text-xs text-muted-foreground">
                Separate scopes with commas or new lines. The backend validates actor authority,
                system-key allowlists, and scope boundaries when you save.
              </div>
              <FieldError errors={[form.formState.errors.allowedScopesText]} />
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
            <Button type="submit" disabled={isPending || (scopeKind === 'entity' && !entityId)}>
              {isPending
                ? mode === 'create'
                  ? 'Creating...'
                  : 'Saving...'
                : mode === 'create'
                  ? 'Create integration'
                  : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
