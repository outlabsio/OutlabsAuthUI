import { useId } from 'react'

import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils/cn'

type AppChoiceCardOption<TValue extends string> = {
  value: TValue
  label: string
  description?: string
  disabled?: boolean
  icon?: LucideIcon
}

type AppRadioCardsProps<TValue extends string> = {
  value?: TValue
  onValueChange: (value: TValue) => void
  options: AppChoiceCardOption<TValue>[]
  disabled?: boolean
  className?: string
  orientation?: 'horizontal' | 'vertical'
  name?: string
  'aria-label'?: string
  appearance?: 'detail' | 'compact'
  grouping?: 'separate' | 'joined'
}

type AppCheckboxCardsProps<TValue extends string> = {
  values: TValue[]
  onValuesChange: (values: TValue[]) => void
  options: AppChoiceCardOption<TValue>[]
  disabled?: boolean
  className?: string
  orientation?: 'horizontal' | 'vertical'
  'aria-label'?: string
  appearance?: 'detail' | 'compact'
  grouping?: 'separate' | 'joined'
}

function getChoiceCardsClassName({
  grouping,
  orientation,
}: {
  grouping: 'separate' | 'joined'
  orientation: 'horizontal' | 'vertical'
}) {
  if (grouping === 'joined') {
    return cn(
      'isolate overflow-hidden border border-border/70 bg-background',
      orientation === 'horizontal'
        ? 'flex rounded-lg [&>*+*]:border-l [&>*+*]:border-border/70'
        : 'flex flex-col rounded-xl [&>*+*]:border-t [&>*+*]:border-border/70'
    )
  }

  return orientation === 'horizontal' ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-3'
}

function getChoiceCardClassName({
  appearance,
  checked,
  disabled,
  grouping,
  orientation,
}: {
  appearance: 'detail' | 'compact'
  checked: boolean
  disabled?: boolean
  grouping: 'separate' | 'joined'
  orientation: 'horizontal' | 'vertical'
}) {
  return cn(
    'text-foreground transition-colors',
    grouping === 'joined'
      ? checked
        ? 'bg-primary/10 text-primary'
        : !disabled && 'hover:bg-primary/10 hover:text-primary'
      : checked
        ? 'border-primary/30 bg-primary/10 text-primary'
        : !disabled &&
          'hover:border-primary/20 hover:bg-primary/5 hover:text-primary',
    disabled && 'cursor-not-allowed opacity-60',
    grouping === 'joined'
      ? cn(
          'border-0 bg-background',
          orientation === 'horizontal'
            ? 'min-w-0 flex-1'
            : 'w-full'
        )
      : 'border border-border/70 bg-background',
    appearance === 'detail'
      ? cn('min-h-20 px-4 py-3 text-left', grouping === 'separate' && 'rounded-xl')
      : cn(
          'h-12 items-center justify-center px-3 text-center',
          grouping === 'joined' ? '' : 'rounded-lg'
        )
  )
}

function ChoiceCardContent<TValue extends string>({
  appearance,
  checked,
  option,
}: {
  appearance: 'detail' | 'compact'
  checked: boolean
  option: AppChoiceCardOption<TValue>
}) {
  if (appearance === 'compact') {
    return (
      <span className="flex min-w-0 items-center justify-center gap-2 text-center">
        {option.icon ? (
          <option.icon
            className={cn(
              'size-4 shrink-0',
              checked ? 'text-current' : 'text-muted-foreground'
            )}
          />
        ) : null}
        <span className="text-sm font-medium leading-none">{option.label}</span>
      </span>
    )
  }

  return (
    <span className="flex min-w-0 flex-col gap-2">
      <span className="flex items-center gap-2">
        {option.icon ? (
          <option.icon
            className={cn(
              'size-4 shrink-0',
              checked ? 'text-current' : 'text-muted-foreground'
            )}
          />
        ) : null}
        <span className="text-base font-medium leading-none">{option.label}</span>
      </span>
      {option.description ? (
        <span
          className={cn(
            'text-sm leading-relaxed',
            checked ? 'text-primary/80' : 'text-muted-foreground'
          )}
        >
          {option.description}
        </span>
      ) : null}
    </span>
  )
}

export function AppRadioCards<TValue extends string>({
  'aria-label': ariaLabel,
  className,
  disabled = false,
  onValueChange,
  options,
  orientation = 'horizontal',
  value,
  appearance = 'detail',
  grouping = 'separate',
}: AppRadioCardsProps<TValue>) {
  const baseId = useId()

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        getChoiceCardsClassName({ grouping, orientation }),
        className
      )}
    >
      {options.map((option) => {
        const optionDisabled = disabled || option.disabled
        const isChecked = option.value === value

        return (
          <button
            key={option.value}
            id={`${baseId}-${option.value}`}
            type="button"
            role="radio"
            aria-checked={isChecked}
            aria-disabled={optionDisabled || undefined}
            disabled={optionDisabled}
            className={cn(
              'flex w-full shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              getChoiceCardClassName({
                appearance,
                checked: isChecked,
                disabled: optionDisabled,
                grouping,
                orientation,
              })
            )}
            onClick={() => {
              onValueChange(option.value)
            }}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
                return
              }

              event.preventDefault()

              const enabledOptions = options.filter(
                (candidate) => !(disabled || candidate.disabled)
              )

              if (enabledOptions.length === 0) {
                return
              }

              const currentEnabledIndex = enabledOptions.findIndex(
                (candidate) => candidate.value === option.value
              )

              if (currentEnabledIndex === -1) {
                return
              }

              let nextIndex = currentEnabledIndex

              if (event.key === 'Home') {
                nextIndex = 0
              } else if (event.key === 'End') {
                nextIndex = enabledOptions.length - 1
              } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                nextIndex = (currentEnabledIndex + 1) % enabledOptions.length
              } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                nextIndex =
                  (currentEnabledIndex - 1 + enabledOptions.length) % enabledOptions.length
              }

              const nextOption = enabledOptions[nextIndex]

              onValueChange(nextOption.value)
              document.getElementById(`${baseId}-${nextOption.value}`)?.focus()
            }}
          >
            <ChoiceCardContent
              appearance={appearance}
              checked={isChecked}
              option={option}
            />
          </button>
        )
      })}
    </div>
  )
}

export function AppCheckboxCards<TValue extends string>({
  'aria-label': ariaLabel,
  className,
  disabled = false,
  onValuesChange,
  options,
  orientation = 'horizontal',
  values,
  appearance = 'detail',
  grouping = 'separate',
}: AppCheckboxCardsProps<TValue>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        getChoiceCardsClassName({ grouping, orientation }),
        className
      )}
    >
      {options.map((option) => {
        const optionDisabled = disabled || option.disabled
        const isChecked = values.includes(option.value)

        return (
          <button
            key={option.value}
            type="button"
            role="checkbox"
            aria-checked={isChecked}
            aria-disabled={optionDisabled || undefined}
            disabled={optionDisabled}
            className={cn(
              'flex w-full shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              getChoiceCardClassName({
                appearance,
                checked: isChecked,
                disabled: optionDisabled,
                grouping,
                orientation,
              })
            )}
            onClick={() => {
              const nextValues = isChecked
                ? values.filter((value) => value !== option.value)
                : [...values, option.value]

              onValuesChange(nextValues)
            }}
          >
            <ChoiceCardContent
              appearance={appearance}
              checked={isChecked}
              option={option}
            />
          </button>
        )
      })}
    </div>
  )
}
