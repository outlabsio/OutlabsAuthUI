import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { QueryProvider } from '@/app/providers/query-provider'
import { RouterProvider } from '@/app/providers/router-provider'
import { ThemeProvider } from '@/app/providers/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { initializeRuntimeConfig } from '@/lib/runtime-config'
import '@/styles/app.css'

async function bootstrap() {
  await initializeRuntimeConfig()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ThemeProvider>
        <QueryProvider>
          <TooltipProvider>
            <RouterProvider />
            <Toaster />
          </TooltipProvider>
        </QueryProvider>
      </ThemeProvider>
    </StrictMode>
  )
}

void bootstrap()
