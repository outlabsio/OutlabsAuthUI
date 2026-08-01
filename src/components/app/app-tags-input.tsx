import type { ComponentProps, FocusEventHandler } from 'react'
import { useMemo, useState } from 'react'

import { XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from '@/components/ui/combobox'
import { cn } from '@/lib/utils/cn'
import {
  areTagValuesEqual,
  normalizeTagValue,
  normalizeTagValues,
  splitBufferedTagValues,
} from '@/lib/utils/tag-values'

type AppTagsInputProps = Pick<
  ComponentProps<'input'>,
  | 'aria-describedby'
  | 'aria-label'
  | 'autoFocus'
  | 'disabled'
  | 'id'
  | 'placeholder'
  | 'required'
> & {
  values: string[]
  onChange: (values: string[]) => void
  onBlur?: FocusEventHandler<HTMLInputElement>
  suggestions?: string[]
  showSuggestions?: boolean
  invalid?: boolean
  className?: string
}

function getCreateItemLabel(value: string) {
  return `Add "${value}"`
}

export function AppTagsInput({
  'aria-describedby': ariaDescribedBy,
  'aria-label': ariaLabel,
  autoFocus = false,
  className,
  disabled = false,
  id,
  invalid = false,
  onBlur,
  onChange,
  placeholder = '',
  required = false,
  suggestions = [],
  showSuggestions = true,
  values,
}: AppTagsInputProps) {
  const anchorRef = useComboboxAnchor()
  const [inputValue, setInputValue] = useState('')
  const selectedValues = useMemo(() => normalizeTagValues(values), [values])
  const normalizedSuggestions = useMemo(
    () => normalizeTagValues(suggestions),
    [suggestions]
  )
  const availableItems = useMemo(
    () => normalizeTagValues([...selectedValues, ...normalizedSuggestions]),
    [normalizedSuggestions, selectedValues]
  )
  const draftValue = normalizeTagValue(inputValue)
  const visibleSuggestions = useMemo(
    () =>
      normalizedSuggestions.filter((suggestion) => {
        const alreadySelected = selectedValues.some(
          (value) => value.toLowerCase() === suggestion.toLowerCase()
        )

        if (alreadySelected) {
          return false
        }

        if (!draftValue) {
          return true
        }

        return suggestion.toLowerCase().includes(draftValue.toLowerCase())
      }),
    [draftValue, normalizedSuggestions, selectedValues]
  )
  const canCreateDraftValue =
    Boolean(draftValue) &&
    !selectedValues.some((value) => value.toLowerCase() === draftValue.toLowerCase())
  const hasPopupOptions =
    canCreateDraftValue || visibleSuggestions.length > 0
  const shouldUseSuggestions =
    showSuggestions && normalizedSuggestions.length > 0

  function commitValues(nextValues: string[]) {
    const normalizedNextValues = normalizeTagValues(nextValues)

    if (areTagValuesEqual(selectedValues, normalizedNextValues)) {
      return
    }

    onChange(normalizedNextValues)
  }

  function handleInputValueChange(nextValue: string) {
    const { committedValues, draftValue: nextDraftValue } =
      splitBufferedTagValues(nextValue)

    if (committedValues.length > 0) {
      commitValues([...selectedValues, ...committedValues])
    }

    setInputValue(nextDraftValue)
  }

  if (!shouldUseSuggestions) {
    return (
      <div
        className={cn(
          'flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-background px-2.5 py-1 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-[input[aria-invalid=true]]:border-destructive has-[input[aria-invalid=true]]:ring-3 has-[input[aria-invalid=true]]:ring-destructive/20',
          className
        )}
      >
        {selectedValues.map((value) => (
          <div
            key={value}
            className="flex h-[calc(--spacing(5.25))] w-fit items-center justify-center gap-1 rounded-sm bg-muted px-1.5 text-xs font-medium whitespace-nowrap text-foreground"
          >
            {value}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="-ml-1 opacity-50 hover:opacity-100"
              onClick={() => {
                commitValues(selectedValues.filter((item) => item !== value))
              }}
              disabled={disabled}
              aria-label={`Remove ${value}`}
            >
              <XIcon className="pointer-events-none" />
            </Button>
          </div>
        ))}
        <input
          id={id}
          aria-describedby={ariaDescribedBy}
          aria-invalid={invalid || undefined}
          aria-label={ariaLabel}
          autoFocus={autoFocus}
          className="min-w-16 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          onBlur={onBlur}
          onChange={(event) => {
            handleInputValueChange(event.target.value)
          }}
          onKeyDown={(event) => {
            if ((event.key === 'Enter' || event.key === ',') && draftValue) {
              event.preventDefault()
              commitValues([...selectedValues, draftValue])
              setInputValue('')
              return
            }

            if (event.key === 'Backspace' && !draftValue && selectedValues.length > 0) {
              commitValues(selectedValues.slice(0, -1))
            }
          }}
          placeholder={placeholder}
          required={required}
          value={inputValue}
        />
      </div>
    )
  }

  return (
    <Combobox
      multiple
      items={availableItems}
      value={selectedValues}
      onValueChange={(nextValue, eventDetails) => {
        commitValues(nextValue)

        if (eventDetails.reason === 'item-press') {
          setInputValue('')
        }
      }}
      inputValue={inputValue}
      onInputValueChange={handleInputValueChange}
      autoHighlight
      disabled={disabled}
      filter={null}
    >
      <ComboboxChips
        ref={anchorRef}
        className={cn('w-full bg-background', className)}
      >
        {selectedValues.map((value) => (
          <ComboboxChip key={value}>
            {value}
          </ComboboxChip>
        ))}
        <ComboboxChipsInput
          id={id}
          aria-describedby={ariaDescribedBy}
          aria-invalid={invalid || undefined}
          aria-label={ariaLabel}
          autoFocus={autoFocus}
          disabled={disabled}
          onBlur={onBlur}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || !draftValue || hasPopupOptions) {
              return
            }

            event.preventDefault()
            commitValues([...selectedValues, draftValue])
            setInputValue('')
          }}
          placeholder={placeholder}
          required={required}
        />
      </ComboboxChips>

      {hasPopupOptions ? (
        <ComboboxContent anchor={anchorRef} align="start">
          <ComboboxList>
            {canCreateDraftValue ? (
              <ComboboxItem value={draftValue}>
                {getCreateItemLabel(draftValue)}
              </ComboboxItem>
            ) : null}
            {visibleSuggestions.map((suggestion) => (
              <ComboboxItem key={suggestion} value={suggestion}>
                {suggestion}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      ) : null}
    </Combobox>
  )
}
