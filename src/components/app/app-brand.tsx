import outlabsAuthIconUrl from '@/assets/brand/outlabs-auth-icon.webp'
import outlabsAuthLogoUrl from '@/assets/brand/outlabs-auth-logo.svg'
import { getRuntimeConfig } from '@/lib/runtime-config'
import { cn } from '@/lib/utils/cn'

type AppBrandProps = {
  className?: string
}

/** Full wordmark for expanded chrome; square mark when the sidebar collapses to icons. */
export function AppBrand({ className }: AppBrandProps) {
  const { authBrand } = getRuntimeConfig()

  return (
    <div
      className={cn(
        'flex h-12 w-full items-center overflow-hidden px-2 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0',
        className
      )}
      aria-label={authBrand}
    >
      <img
        src={outlabsAuthLogoUrl}
        alt=""
        className="h-7 w-auto max-w-full object-contain object-left dark:invert group-data-[collapsible=icon]:hidden"
      />
      <img
        src={outlabsAuthIconUrl}
        alt=""
        className="hidden size-7 object-contain group-data-[collapsible=icon]:block"
      />
    </div>
  )
}
