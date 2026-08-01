export type AppStatusColor = "neutral" | "info" | "success" | "warning" | "error"
export type AppStatusTone = AppStatusColor

export type AppStatusAppearance = "soft" | "solid" | "outline"

const appStatusClasses: Record<
  AppStatusColor,
  Record<AppStatusAppearance, string>
> = {
  neutral: {
    soft: "border-border bg-muted/40 text-foreground",
    solid: "border-secondary bg-secondary text-secondary-foreground",
    outline: "border-border bg-background text-foreground",
  },
  info: {
    soft: "border-info-border bg-info-soft text-info-soft-foreground",
    solid: "border-info bg-info text-info-foreground",
    outline: "border-info-border bg-background text-info-soft-foreground",
  },
  success: {
    soft: "border-success-border bg-success-soft text-success-soft-foreground",
    solid: "border-success bg-success text-success-foreground",
    outline:
      "border-success-border bg-background text-success-soft-foreground",
  },
  warning: {
    soft: "border-warning-border bg-warning-soft text-warning-soft-foreground",
    solid: "border-warning bg-warning text-warning-foreground",
    outline:
      "border-warning-border bg-background text-warning-soft-foreground",
  },
  error: {
    soft: "border-error-border bg-error-soft text-error-soft-foreground",
    solid: "border-error bg-error text-error-foreground",
    outline: "border-error-border bg-background text-error-soft-foreground",
  },
}

export function getAppStatusClasses(
  color: AppStatusColor,
  appearance: AppStatusAppearance
) {
  return appStatusClasses[color][appearance]
}

export const getAppStatusCalloutClasses = getAppStatusClasses
