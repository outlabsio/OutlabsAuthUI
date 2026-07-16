import { AppSection } from '@/components/app/app-section'
import { AppStatusCallout } from '@/components/app/app-status-callout'
import { Badge } from '@/components/ui/badge'
import type { AuthConfig } from '@/features/auth/types/auth.types'
import {
  listEnabledAuthFeatures,
  listEnabledAuthMethods,
} from '@/features/auth/utils/auth-config-labels'

type RuntimeCapabilitiesPanelProps = {
  config: AuthConfig
}

export function RuntimeCapabilitiesPanel({ config }: RuntimeCapabilitiesPanelProps) {
  const enabledFeatures = listEnabledAuthFeatures(config.features)
  const enabledAuthMethods = listEnabledAuthMethods(config.auth_methods)

  return (
    <AppSection
      title="Runtime capabilities"
      description="Read-only snapshot of GET /auth/config for this mounted backend."
      contentClassName="space-y-5"
      action={
        <Badge variant="outline">{config.preset}</Badge>
      }
    >
      <AppStatusCallout color="neutral" appearance="soft" compact>
        Changed by host deploy / environment configuration, not this console. Provider
        credentials and transport secrets stay in the host — never edit them here.
      </AppStatusCallout>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Enabled features
          </div>
          <div className="flex flex-wrap gap-2">
            {enabledFeatures.length > 0 ? (
              enabledFeatures.map(([, label]) => (
                <Badge key={label} variant="secondary">
                  {label}
                </Badge>
              ))
            ) : (
              <Badge variant="outline">No optional features enabled</Badge>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Sign-in methods
          </div>
          <div className="flex flex-wrap gap-2">
            {enabledAuthMethods.length > 0 ? (
              enabledAuthMethods.map(([, label]) => (
                <Badge key={label} variant="secondary">
                  {label}
                </Badge>
              ))
            ) : (
              <Badge variant="outline">Not advertised by this backend</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Advertised permissions
        </div>
        <p className="text-sm text-muted-foreground">
          {config.available_permissions.length} permission definitions are currently
          advertised by the backend contract.
        </p>
      </div>
    </AppSection>
  )
}
