import { z } from 'zod'
import { checkValidityWindow, optionalText, reasonText, requiredText, tagList, validityWindowShape } from '~/schemas/common'
import { editMembershipSchema, membershipStatusField } from '~/schemas/membership'

// Entity dialogs (create, edit, governance, move, add member, edit member access). Limits mirror
// the API's request models (schemas/entity.py, schemas/membership.py) so the client says what the
// server would.
//
// Naming patterns are Python regular expressions: the server compiles them with `re.compile` and
// matches names with `re.fullmatch`, and it is the authority on both. JavaScript's RegExp agrees
// only on the common syntax, so the console checks a pattern only where it can do so faithfully
// and leaves the rest to the server (its 400 lands on the field):
// - Python-only syntax (\A, \Z, (?P<…>), (?P=…), inline flags such as (?i) or (?i:…), comments,
//   atomic groups, conditionals, possessive quantifiers, a leading ] in a class) is never
//   reported as invalid; the field says the server checks it.
// - A name is checked against a pattern before submit only when the pattern is portable: free of
//   that syntax and of the Unicode-sensitive classes \w \b \d (Python's match accented letters
//   and non-ASCII digits, JavaScript's do not), and compilable in JavaScript's strict (u) mode,
//   which rejects the escapes and quantifiers the two engines read differently.

export const entityClassField = z.enum(['structural', 'access_group'])
export const editableEntityStatusField = z.enum(['active', 'inactive'])

type PatternScan = { pythonOnly: boolean, unicodeClasses: boolean }

// Inline flags: (?i) (?ims) (?i-s:…) (?-i:…).
const INLINE_FLAGS = /^(?:[aiLmsux]+(?:-[imsx]*)?|-[imsx]+)[:)]/

// One pass over the pattern, outside escapes, aware of character classes.
function scanPattern(pattern: string): PatternScan {
  const found: PatternScan = { pythonOnly: false, unicodeClasses: false }
  let inClass = false
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!
    const next = pattern[i + 1] ?? ''
    if (ch === '\\') {
      if (next === 'A' || next === 'Z' || next === 'N') found.pythonOnly = true
      if ('wWbBdD'.includes(next) && next) found.unicodeClasses = true
      i++
      continue
    }
    if (inClass) {
      if (ch === ']') inClass = false
      continue
    }
    if (ch === '[') {
      inClass = true
      // Python reads a ] right after [ or [^ as a literal; JavaScript reads [] as an empty class.
      let first = i + 1
      if (pattern[first] === '^') first++
      if (pattern[first] === ']') {
        found.pythonOnly = true
        i = first
      }
      continue
    }
    if (ch === '(' && next === '?') {
      const rest = pattern.slice(i + 2)
      if (/^(?:P[<=>]|[#>(])/.test(rest) || INLINE_FLAGS.test(rest)) found.pythonOnly = true
      continue
    }
    // Possessive quantifiers (a*+, a++, a?+, a{2}+).
    if ('*+?}'.includes(ch) && next === '+') found.pythonOnly = true
  }
  return found
}

// Whether the pattern uses syntax only Python's re module reads (the server checks it).
export function hasPythonOnlySyntax(pattern: string | null | undefined): boolean {
  return Boolean(pattern) && scanPattern(pattern!).pythonOnly
}

// Whether the console can match names against `pattern` exactly as the server does.
export function isPortablePattern(pattern: string): boolean {
  const scan = scanPattern(pattern)
  if (scan.pythonOnly || scan.unicodeClasses) return false
  try {
    new RegExp(pattern, 'u')
    return true
  } catch {
    return false
  }
}

// Whether a pattern is acceptable on the client: empty, Python-only (the server's re.compile
// decides), or a valid JavaScript regular expression. Only a pattern both engines reject fails.
export function isValidPattern(value: string | null | undefined): boolean {
  if (!value || !value.trim() || hasPythonOnlySyntax(value)) return true
  try {
    new RegExp(value)
    return true
  } catch {
    return false
  }
}

// Whether `value` certainly breaks `pattern` (Python re.fullmatch fails). False whenever the
// console cannot tell (a non-portable pattern): the server checks it on submit.
export function breaksPattern(value: string, pattern: string): boolean {
  if (!isPortablePattern(pattern)) return false
  return !new RegExp(`^(?:${pattern})$`, 'u').test(value)
}

// The help under a pattern field: Python-only syntax is accepted here and checked by the server.
export function patternFieldHelp(value: string | null | undefined): string | undefined {
  return hasPythonOnlySyntax(value) ? 'Python-only syntax: the server checks it when you save.' : undefined
}

export const PATTERN_FIELDS = ['childNamePattern', 'childDisplayNamePattern', 'childSlugPattern'] as const
export type PatternField = (typeof PATTERN_FIELDS)[number]

const patternField = z
  .string()
  .trim()
  .max(255, 'Use at most 255 characters.')

// The pattern fields named in `fields` must compile (see isValidPattern).
function checkPatterns(data: Record<PatternField, string>, ctx: z.RefinementCtx, fields: readonly PatternField[]) {
  for (const field of fields) {
    if (!isValidPattern(data[field])) ctx.addIssue({ code: 'custom', path: [field], message: 'Enter a valid regular expression.' })
  }
}

const maxMembersField = z
  .number({ message: 'Enter a whole number.' })
  .int('Enter a whole number.')
  .min(1, 'Enter at least 1, or clear it for no limit.')
  .nullable()
  .optional()

// Child limits (every entity) and root naming rules (roots only), shared by create and Governance.
const governanceShape = {
  allowedChildClasses: z.array(entityClassField),
  allowedChildTypes: tagList,
  maxMembers: maxMembersField,
  childNamePattern: patternField,
  childDisplayNamePattern: patternField,
  childSlugPattern: patternField,
  childNamingGuidance: optionalText(1000)
}

// The naming rules a root organisation sets for everything beneath it.
export type EntityNamingRules = {
  name?: string | null
  displayName?: string | null
  slug?: string | null
}

// Create. `parentId` '' = a new top-level organisation (only when `requireParent` is false).
// `namingRules` are the root's rules for a child (none for a new root); a value that breaks one
// is flagged on its field before submit.
export function createEntitySchema(namingRules: EntityNamingRules = {}, { requireParent = true }: { requireParent?: boolean } = {}) {
  return z
    .object({
      parentId: z.string(),
      entityClass: entityClassField,
      entityType: requiredText('Type', 50),
      displayName: requiredText('Display name', 200),
      name: requiredText('System name', 100),
      slug: requiredText('Slug', 100),
      description: optionalText(500),
      status: editableEntityStatusField,
      ...validityWindowShape,
      ...governanceShape
    })
    .superRefine((data, ctx) => {
      if (requireParent && !data.parentId) ctx.addIssue({ code: 'custom', path: ['parentId'], message: 'Choose the parent.' })
      checkValidityWindow(data, ctx)
      // A new root's rules are all new: each must compile.
      checkPatterns(data, ctx, PATTERN_FIELDS)
      const rules: [keyof typeof data, string | null | undefined, string][] = [
        ['name', namingRules.name, 'System name'],
        ['displayName', namingRules.displayName, 'Display name'],
        ['slug', namingRules.slug, 'Slug']
      ]
      for (const [field, pattern, label] of rules) {
        const value = String(data[field] ?? '').trim()
        if (pattern && value && breaksPattern(value, pattern)) {
          ctx.addIssue({ code: 'custom', path: [field], message: `${label} must match the organization's pattern ${pattern}.` })
        }
      }
    })
}
export type CreateEntitySchema = z.output<ReturnType<typeof createEntitySchema>>

export const editEntitySchema = z
  .object({
    displayName: requiredText('Display name', 200),
    description: optionalText(500),
    status: editableEntityStatusField,
    ...validityWindowShape
  })
  .superRefine(checkValidityWindow)
export type EditEntitySchema = z.output<typeof editEntitySchema>

// Governance. Only the patterns the admin changed are checked: a stored one was accepted by the
// server's re.compile, so the console never blocks a save (Max members, say) over it.
export function governanceSchemaFor(changedPatterns: readonly PatternField[] = PATTERN_FIELDS) {
  return z.object(governanceShape).superRefine((data, ctx) => checkPatterns(data, ctx, changedPatterns))
}
export type GovernanceSchema = z.output<ReturnType<typeof governanceSchemaFor>>

export const moveEntitySchema = z.object({
  destination: z.enum(['parent', 'top']),
  parentId: z.string()
}).superRefine((data, ctx) => {
  if (data.destination === 'parent' && !data.parentId) ctx.addIssue({ code: 'custom', path: ['parentId'], message: 'Choose the new parent.' })
})
export type MoveEntitySchema = z.output<typeof moveEntitySchema>

export const addMemberSchema = z
  .object({
    userId: z.string().min(1, 'Choose a user.'),
    roleIds: z.array(z.string()),
    status: membershipStatusField,
    ...validityWindowShape,
    reason: reasonText
  })
  .superRefine(checkValidityWindow)
export type AddMemberSchema = z.output<typeof addMemberSchema>

// The same rules as the user detail's Edit access (schemas/membership.ts).
export const editMemberSchema = editMembershipSchema
export type EditMemberSchema = z.output<typeof editMemberSchema>

// "ACME West Coast" -> "acme-west-coast"; the system name uses underscores ("acme_west_coast").
export function slugFrom(displayName: string): string {
  return displayName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

export function systemNameFrom(displayName: string): string {
  return slugFrom(displayName).replace(/-/g, '_')
}
