import type { ReactNode } from 'react';

import { AppInfoPopover } from '@/components/app/app-info-popover';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';

type DetailSectionProps = {
  title: string;
  description?: string;
  info?: {
    label: string;
    title: string;
    content: ReactNode;
  };
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

type SectionPaginationActionProps = {
  itemLabel: string;
  total: number;
  page: number;
  pages: number;
  isPending: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

export function DetailSection({
  title,
  description,
  info,
  action,
  children,
  className,
}: DetailSectionProps) {
  return (
    <Card className={cn('gap-0 overflow-hidden border py-0 ring-0', className)}>
      <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {info ? (
              <AppInfoPopover label={info.label} title={info.title}>
                {info.content}
              </AppInfoPopover>
            ) : null}
          </div>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </Card>
  );
}

export function SectionPaginationAction({
  itemLabel,
  total,
  page,
  pages,
  isPending,
  onPrevious,
  onNext,
}: SectionPaginationActionProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-xs text-muted-foreground">
        {total} {itemLabel}
        {pages > 0 ? ` | Page ${page} of ${pages}` : ''}
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onPrevious}
        disabled={isPending || page <= 1}
      >
        Previous
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onNext}
        disabled={isPending || page >= pages}
      >
        Next
      </Button>
    </div>
  );
}
