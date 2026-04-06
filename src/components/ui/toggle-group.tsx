import * as React from "react"
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group"
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils/cn"

const toggleGroupVariants = cva("inline-flex items-stretch", {
  variants: {
    variant: {
      default: "gap-1",
      outline:
        "overflow-hidden rounded-lg border border-input bg-background dark:bg-input/30 [&>[data-slot=toggle-group-item]+[data-slot=toggle-group-item]]:border-l [&>[data-slot=toggle-group-item]+[data-slot=toggle-group-item]]:border-border",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

const toggleGroupItemVariants = cva(
  "inline-flex min-w-0 items-center justify-center whitespace-nowrap text-sm font-medium transition-colors outline-none focus-visible:relative focus-visible:z-10 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "rounded-lg border border-transparent bg-transparent hover:bg-muted hover:text-foreground data-[pressed]:bg-muted data-[pressed]:text-foreground",
        outline:
          "border-0 bg-transparent hover:bg-muted/60 hover:text-foreground data-[pressed]:bg-muted data-[pressed]:text-foreground",
      },
      size: {
        default: "h-10 px-3",
        sm: "h-8 px-2.5 text-[0.8rem]",
        lg: "h-11 px-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ToggleGroupVariant = NonNullable<
  VariantProps<typeof toggleGroupItemVariants>["variant"]
>
type ToggleGroupSize = NonNullable<
  VariantProps<typeof toggleGroupItemVariants>["size"]
>

const ToggleGroupItemContext = React.createContext<{
  variant: ToggleGroupVariant
  size: ToggleGroupSize
}>({
  variant: "default",
  size: "default",
})

type ToggleGroupSingleProps<Value extends string> = Omit<
  ToggleGroupPrimitive.Props<Value>,
  "multiple" | "value" | "defaultValue" | "onValueChange"
> & {
  type?: "single"
  value?: Value
  defaultValue?: Value
  onValueChange?: (value: Value | "") => void
  variant?: ToggleGroupVariant
  size?: ToggleGroupSize
}

type ToggleGroupMultipleProps<Value extends string> = Omit<
  ToggleGroupPrimitive.Props<Value>,
  "multiple" | "value" | "defaultValue" | "onValueChange"
> & {
  type: "multiple"
  value?: readonly Value[]
  defaultValue?: readonly Value[]
  onValueChange?: (value: Value[]) => void
  variant?: ToggleGroupVariant
  size?: ToggleGroupSize
}

type ToggleGroupProps<Value extends string> =
  | ToggleGroupSingleProps<Value>
  | ToggleGroupMultipleProps<Value>

function ToggleGroup<Value extends string>(props: ToggleGroupProps<Value>) {
  const { className, variant = "default", size = "default" } = props

  if (props.type === "multiple") {
    const {
      type,
      value,
      defaultValue,
      onValueChange,
      ...groupProps
    } = props
    void type

    return (
      <ToggleGroupItemContext.Provider value={{ variant, size }}>
        <ToggleGroupPrimitive
          data-slot="toggle-group"
          multiple
          value={value}
          defaultValue={defaultValue}
          onValueChange={onValueChange}
          className={cn(toggleGroupVariants({ variant, className }))}
          {...groupProps}
        />
      </ToggleGroupItemContext.Provider>
    )
  }

  const {
    type,
    value,
    defaultValue,
    onValueChange,
    ...groupProps
  } = props
  void type

  return (
    <ToggleGroupItemContext.Provider value={{ variant, size }}>
      <ToggleGroupPrimitive
        data-slot="toggle-group"
        value={value ? [value] : []}
        defaultValue={defaultValue ? [defaultValue] : undefined}
        onValueChange={(nextValue) => {
          onValueChange?.(nextValue[0] ?? "")
        }}
        className={cn(toggleGroupVariants({ variant, className }))}
        {...groupProps}
      />
    </ToggleGroupItemContext.Provider>
  )
}

type ToggleGroupItemProps<Value extends string> = TogglePrimitive.Props<Value> &
  VariantProps<typeof toggleGroupItemVariants>

function ToggleGroupItem<Value extends string>({
  className,
  variant,
  size,
  ...props
}: ToggleGroupItemProps<Value>) {
  const group = React.useContext(ToggleGroupItemContext)

  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      className={cn(
        toggleGroupItemVariants({
          variant: variant ?? group.variant,
          size: size ?? group.size,
        }),
        className
      )}
      {...props}
    />
  )
}

export { ToggleGroup, ToggleGroupItem }
