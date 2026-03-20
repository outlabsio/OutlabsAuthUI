import { CalendarClock } from 'lucide-react'

import { AppDateTimePicker } from '@/components/app/app-date-time-picker'
import { AppInfoPopover } from '@/components/app/app-info-popover'
import { FieldError } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils/cn'

type MembershipLifecycleStatus = 'active' | 'suspended'

type MembershipLifecyclePanelProps = {
  status: MembershipLifecycleStatus
  validFrom: string
  validUntil: string
  reason: string
  helperMessage?: string | null
  disabled?: boolean
  validUntilError?: string | null
  className?: string
  statusLabel?: string
  reasonLabel?: string
  reasonPlaceholder?: string
  onStatusChange: (status: MembershipLifecycleStatus) => void
  onValidFromChange: (value: string) => void
  onValidUntilChange: (value: string) => void
  onReasonChange: (value: string) => void
}

const membershipStatusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
] as const

export function MembershipLifecyclePanel({
  status,
  validFrom,
  validUntil,
  reason,
  helperMessage,
  disabled = false,
  validUntilError,
  className,
  statusLabel = 'Status',
  reasonLabel = 'Reason',
  reasonPlaceholder = 'Optional context for this lifecycle change',
  onStatusChange,
  onValidFromChange,
  onValidUntilChange,
  onReasonChange,
}: MembershipLifecyclePanelProps) {
  return (
    <section className={cn('rounded-xl border p-4', className)}>
      <div className="flex items-start gap-3">
        <CalendarClock className="mt-0.5 size-4 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex items-center gap-2">
            <div className="font-medium">Membership lifecycle</div>
            <AppInfoPopover
              label="Explain membership lifecycle"
              title="Membership lifecycle"
            >
              Use lifecycle settings to suspend access, schedule it, or let it remain active
              immediately inside this entity.
            </AppInfoPopover>
          </div>

          {helperMessage ? (
            <p className="text-sm text-muted-foreground">{helperMessage}</p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{statusLabel}</Label>
              <Select
                value={status}
                onValueChange={(nextValue) => {
                  onStatusChange(nextValue as MembershipLifecycleStatus)
                }}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a status" />
                </SelectTrigger>
                <SelectContent>
                  {membershipStatusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="membership-lifecycle-reason">{reasonLabel}</Label>
              <Textarea
                id="membership-lifecycle-reason"
                rows={2}
                disabled={disabled}
                placeholder={reasonPlaceholder}
                value={reason}
                onChange={(event) => {
                  onReasonChange(event.target.value)
                }}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="membership-lifecycle-valid-from">Valid from</Label>
              <AppDateTimePicker
                id="membership-lifecycle-valid-from"
                value={validFrom}
                onChange={onValidFromChange}
                disabled={disabled}
                placeholder="Pick a start date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="membership-lifecycle-valid-until">Valid until</Label>
              <AppDateTimePicker
                id="membership-lifecycle-valid-until"
                value={validUntil}
                onChange={onValidUntilChange}
                disabled={disabled}
                placeholder="Pick an end date"
              />
            </div>
          </div>

          {validUntilError ? <FieldError>{validUntilError}</FieldError> : null}
        </div>
      </div>
    </section>
  )
}
