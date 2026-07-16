import type { ReactNode } from 'react'

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'
import { cn } from '@/lib/utils/cn'

type AppFormFieldProps = {
  label?: ReactNode
  htmlFor?: string
  description?: ReactNode
  /** RHF field errors or any `{ message }` list accepted by `FieldError`. */
  errors?: Array<{ message?: string } | undefined>
  /** Form/submit-level message when not attached to a schema field. */
  errorMessage?: ReactNode
  invalid?: boolean
  orientation?: 'vertical' | 'horizontal' | 'responsive'
  className?: string
  children: ReactNode
}

/**
 * App-level field shell over shadcn `Field` composition.
 * Prefer this (or raw `Field`/`FieldLabel`/`FieldError`) over `Label` + `space-y-2`.
 */
export function AppFormField({
  label,
  htmlFor,
  description,
  errors,
  errorMessage,
  invalid,
  orientation = 'vertical',
  className,
  children,
}: AppFormFieldProps) {
  const hasError =
    Boolean(errorMessage) ||
    Boolean(errors?.some((error) => Boolean(error?.message)))

  return (
    <Field
      orientation={orientation}
      data-invalid={invalid || hasError ? true : undefined}
      className={cn(className)}
    >
      {label ? <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel> : null}
      {children}
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
      {!errorMessage ? <FieldError errors={errors} /> : null}
    </Field>
  )
}
