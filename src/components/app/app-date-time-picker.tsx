import { useEffect, useMemo, useState } from 'react'

import { format } from 'date-fns'
import { CalendarIcon, Clock3Icon, XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils/cn'

type AppDateTimePickerProps = {
  id?: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  layout?: 'stacked' | 'inline'
}

function toLocalDateTimeValue(date: Date) {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16)
}

function combineDateAndTime(date: Date, time: string) {
  const [hours = '09', minutes = '00'] = time.split(':')
  const nextDate = new Date(date)

  nextDate.setHours(Number(hours), Number(minutes), 0, 0)

  return toLocalDateTimeValue(nextDate)
}

const timeOptions = Array.from({ length: 96 }, (_, index) => {
  const hours = String(Math.floor(index / 4)).padStart(2, '0')
  const minutes = String((index % 4) * 15).padStart(2, '0')
  const value = `${hours}:${minutes}`

  return {
    value,
    label: format(new Date(2000, 0, 1, Number(hours), Number(minutes)), 'p'),
  }
})

export function AppDateTimePicker({
  id,
  value,
  onChange,
  disabled = false,
  placeholder = 'Pick a date',
  className,
  layout = 'stacked',
}: AppDateTimePickerProps) {
  const [draftTime, setDraftTime] = useState('09:00')
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    []
  )
  const selectedDate = value ? new Date(value) : undefined

  useEffect(() => {
    setDraftTime(value ? value.slice(11, 16) : '09:00')
  }, [value])

  const datePicker = (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            className="h-10 w-full min-w-0 justify-start overflow-hidden rounded-lg bg-background px-3 text-left font-normal"
          />
        }
        disabled={disabled}
      >
        <CalendarIcon className="size-4 text-muted-foreground" />
        <span className={cn('truncate', !selectedDate && 'text-muted-foreground')}>
          {selectedDate ? format(selectedDate, 'PPP') : placeholder}
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          'p-0 [&_[data-slot=calendar]]:w-full [&_.rdp-months]:w-full [&_.rdp-month]:w-full',
          layout === 'inline'
            ? 'w-fit max-w-[calc(100vw-2rem)]'
            : 'w-(--anchor-width) max-w-(--available-width) [&_[data-slot=calendar]]:w-full'
        )}
        sideOffset={8}
      >
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            if (!date) {
              onChange('')
              return
            }

            onChange(combineDateAndTime(date, draftTime))
          }}
          captionLayout="dropdown"
          timeZone={timeZone}
        />
      </PopoverContent>
    </Popover>
  )

  const timePicker = (
    <Select
      value={draftTime}
      onValueChange={(nextTime) => {
        if (!nextTime) {
          return
        }

        setDraftTime(nextTime)

        if (selectedDate) {
          onChange(combineDateAndTime(selectedDate, nextTime))
        }
      }}
      disabled={disabled || !selectedDate}
    >
      <SelectTrigger
        className="h-10 w-full min-w-0 rounded-lg bg-background px-3 py-0 text-left font-normal data-[size=default]:h-10 data-[size=default]:py-0"
        aria-label="Select time"
      >
        <Clock3Icon className="size-4 text-muted-foreground" />
        <SelectValue placeholder="Select a time" />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        <SelectGroup>
          {timeOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )

  const clearButton = value ? (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={() => {
        onChange('')
      }}
      disabled={disabled}
      aria-label="Clear date"
    >
      <XIcon className="size-4" />
    </Button>
  ) : (
    <span className="size-8" aria-hidden="true" />
  )

  if (layout === 'inline') {
    return (
      <div
        className={cn(
          'grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center',
          className
        )}
      >
        {datePicker}
        {timePicker}
        <div className="flex justify-end">
          {value ? clearButton : <span className="hidden size-8 sm:block" aria-hidden="true" />}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('grid gap-2', className)}>
      {datePicker}
      <div className="flex items-center gap-2">
        {timePicker}
        {value ? clearButton : null}
      </div>
    </div>
  )
}
