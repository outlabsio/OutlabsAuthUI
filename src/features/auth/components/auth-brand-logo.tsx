import outlabsAuthLogoUrl from '@/assets/brand/outlabs-auth-logo.svg'
import { getRuntimeConfig } from '@/lib/runtime-config'
import { cn } from '@/lib/utils/cn'

type AuthBrandLogoProps = {
  className?: string
}

export function AuthBrandLogo({ className }: AuthBrandLogoProps) {
  const { authBrand } = getRuntimeConfig()

  return (
    <img
      src={outlabsAuthLogoUrl}
      alt={authBrand}
      className={cn(
        'mx-auto h-14 w-auto max-w-[260px] object-contain dark:invert',
        className
      )}
    />
  )
}
