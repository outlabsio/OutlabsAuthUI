import { useMemo, useState } from 'react'

import { BookOpenText, CircleHelp, Sparkles } from 'lucide-react'

import { getAppPageGuide } from '@/app/internal-docs/page-guides'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

type AppPageGuideDrawerProps = {
  pathname: string
}

export function AppPageGuideDrawer({ pathname }: AppPageGuideDrawerProps) {
  const [open, setOpen] = useState(false)
  const guide = useMemo(() => getAppPageGuide(pathname), [pathname])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label={`Open ${guide.label} guide`}
        onClick={() => setOpen(true)}
      >
        <CircleHelp className="size-4" />
      </Button>

      <SheetContent
        side="right"
        className="w-full gap-0 p-0 sm:max-w-2xl"
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <SheetHeader className="border-b px-6 py-5 pr-14">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1.5">
                  <BookOpenText className="size-3.5" />
                  Internal guide
                </Badge>
                <Badge variant="secondary" className="gap-1.5">
                  <Sparkles className="size-3.5" />
                  {guide.label}
                </Badge>
              </div>
              <div className="space-y-2">
                <SheetTitle className="text-2xl font-semibold tracking-tight">
                  {guide.title}
                </SheetTitle>
                <SheetDescription className="max-w-2xl leading-6">
                  {guide.description}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-6 overflow-auto px-6 py-6">
            {guide.quickFacts?.length ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {guide.quickFacts.map((fact) => (
                  <div
                    key={fact.label}
                    className="rounded-2xl border bg-muted/20 px-4 py-3"
                  >
                    <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {fact.label}
                    </div>
                    <div className="mt-1 text-sm font-medium text-foreground">
                      {fact.value}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {guide.sections.map((section) => (
              <section
                key={section.title}
                className="rounded-3xl border bg-card/90 px-5 py-5"
              >
                <div className="space-y-3">
                  <div>
                    <h3 className="text-base font-semibold">{section.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {section.description}
                    </p>
                  </div>
                  {section.bullets?.length ? (
                    <ul className="space-y-2 text-sm leading-6 text-foreground">
                      {section.bullets.map((bullet) => (
                        <li key={bullet} className="flex items-start gap-2">
                          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/70" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </section>
            ))}

            {guide.footerNote ? (
              <div className="rounded-2xl border bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
                {guide.footerNote}
              </div>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
