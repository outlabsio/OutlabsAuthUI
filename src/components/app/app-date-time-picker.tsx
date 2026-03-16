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

  return (
    <div className={cn('grid gap-2', className)}>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              className="h-10 w-full justify-start text-left font-normal"
            />
          }
          disabled={disabled}
        >
          <CalendarIcon className="size-4 text-muted-foreground" />
          <span className={cn(!selectedDate && 'text-muted-foreground')}>
            {selectedDate ? format(selectedDate, 'PPP') : placeholder}
          </span>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto p-0"
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

      <div className="flex items-center gap-2">
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
          <SelectTrigger className="h-10 w-full" aria-label="Select time">
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

        {value ? (
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
        ) : null}
      </div>
    </div>
  )
}
