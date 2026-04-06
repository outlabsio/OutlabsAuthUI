export function parseDelimitedValues(value: string) {
  return value
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function formatDelimitedValues(values?: string[] | null) {
  return (values ?? []).join(', ')
}
