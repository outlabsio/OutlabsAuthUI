// Memory probe for one-time secrets (F-183). Pass to page.evaluate:
//   expect(await page.evaluate(piniaPathsTo, secret)).toEqual([])
//
// Runs in the page: every path from the app's Pinia instance (its stores, including the Colada
// query and mutation caches) to a string containing `needle`. Breadth-first over own
// properties, Maps and Sets; DOM nodes and functions are skipped.
export function piniaPathsTo(needle: string): string[] {
  const root = document.querySelector('#__nuxt') as (Element & { __vue_app__?: { config: { globalProperties: Record<string, unknown> } } }) | null
  const pinia = root?.__vue_app__?.config.globalProperties.$pinia
  if (!pinia) return ['<no pinia instance found>']
  const seen = new WeakSet<object>()
  const found: string[] = []
  const queue: Array<[unknown, string]> = [[pinia, 'pinia']]
  for (let i = 0; i < queue.length && i < 500_000; i++) {
    const [value, path] = queue[i]!
    if (typeof value === 'string') {
      if (value.includes(needle)) found.push(path)
      continue
    }
    if (!value || typeof value !== 'object' || seen.has(value) || value instanceof Node || value === window) continue
    seen.add(value)
    if (value instanceof Map) {
      for (const [k, v] of value) queue.push([v, `${path}[${String(k)}]`])
      continue
    }
    if (value instanceof Set) {
      for (const v of value) queue.push([v, `${path}{}`])
      continue
    }
    for (const k of Object.keys(value)) {
      try {
        queue.push([(value as Record<string, unknown>)[k], `${path}.${k}`])
      } catch {
        // A getter that throws holds nothing we can reach.
      }
    }
  }
  return found
}
