export function normalizeTagValue(value?: string | null) {
  return (value ?? '').trim().replace(/\s+/g, ' ')
}

export function normalizeTagValues(values: Iterable<string | null | undefined>) {
  const normalizedValues = new Map<string, string>()

  for (const value of values) {
    const normalizedValue = normalizeTagValue(value)

    if (!normalizedValue) {
      continue
    }

    const normalizedKey = normalizedValue.toLowerCase()

    if (!normalizedValues.has(normalizedKey)) {
      normalizedValues.set(normalizedKey, normalizedValue)
    }
  }

  return [...normalizedValues.values()]
}

export function splitTagValues(value: string) {
  return normalizeTagValues(value.split(/[\n,]/g))
}

export function splitBufferedTagValues(value: string) {
  const hasTrailingDelimiter = /[,\n]\s*$/.test(value)
  const segments = value.split(/[\n,]/g)
  const draftValue = hasTrailingDelimiter
    ? ''
    : normalizeTagValue(segments.pop())

  return {
    committedValues: normalizeTagValues(segments),
    draftValue,
  }
}

export function areTagValuesEqual(
  leftValues: Iterable<string | null | undefined>,
  rightValues: Iterable<string | null | undefined>
) {
  const normalizedLeftValues = normalizeTagValues(leftValues)
  const normalizedRightValues = normalizeTagValues(rightValues)

  if (normalizedLeftValues.length !== normalizedRightValues.length) {
    return false
  }

  return normalizedLeftValues.every(
    (value, index) => value === normalizedRightValues[index]
  )
}
