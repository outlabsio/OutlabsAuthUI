import * as React from 'react'

const mobileBreakpoint = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mediaQueryList = window.matchMedia(
      `(max-width: ${mobileBreakpoint - 1}px)`
    )

    const handleChange = () => {
      setIsMobile(window.innerWidth < mobileBreakpoint)
    }

    mediaQueryList.addEventListener('change', handleChange)
    setIsMobile(window.innerWidth < mobileBreakpoint)

    return () => mediaQueryList.removeEventListener('change', handleChange)
  }, [])

  return Boolean(isMobile)
}
