// Pure diffing behind useDirtyPatch: compare request bodies field by field so an edit sends only
// what the admin changed (PATCH semantics). Values are compared structurally (JSON-like data:
// primitives, arrays in order, plain objects); `undefined` means "not part of the body".

export type WireBody = Record<string, unknown>

/** Structural equality for JSON-like values. Arrays compare in order; sort sets in the caller. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, index) => sameValue(item, b[index]))
  }
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) {
    if (!sameValue(left[key], right[key])) return false
  }
  return true
}

/** The body keys whose values differ between `before` and `after` (in `after`'s key order). */
export function changedKeys<W extends WireBody>(before: W, after: W): Array<keyof W & string> {
  const keys = [...new Set([...Object.keys(after), ...Object.keys(before)])]
  return keys.filter(key => !sameValue(before[key], after[key])) as Array<keyof W & string>
}

/**
 * The PATCH body: the changed keys of `after`, plus the `always` keys (an audit note, say) when
 * anything changed. Keys whose value is `undefined` are left out. Empty when nothing changed.
 */
export function diffPatch<W extends WireBody>(before: W, after: W, always: ReadonlyArray<keyof W> = []): Partial<W> {
  const changed = changedKeys(before, after).filter(key => !always.includes(key))
  if (!changed.length) return {}
  const patch: Partial<W> = {}
  for (const key of [...changed, ...always]) {
    if (after[key] !== undefined) patch[key] = after[key]
  }
  return patch
}

/**
 * Fields both sides changed differently since `base`: `mine` is what this dialog would send,
 * `theirs` is the record as the server has it now. A field only one side changed is not a
 * conflict — a diff-only PATCH leaves the other side's change alone.
 */
export function conflictingKeys<W extends WireBody>(base: W, mine: W, theirs: W): Array<keyof W & string> {
  return changedKeys(base, mine).filter(key => !sameValue(base[key], theirs[key]) && !sameValue(mine[key], theirs[key]))
}

/** A deep copy of a JSON-like body (functions and `undefined` values are dropped). */
export function cloneBody<W extends WireBody>(body: W): W {
  return JSON.parse(JSON.stringify(body)) as W
}
