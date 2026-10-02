import { describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import { checkValidityWindow, dateInput, requiredText, tagList, validityWindowShape } from '~/schemas/common'
import { roleAssignmentEditSchema } from '~/schemas/membership'
import { createPermissionSchema } from '~/schemas/permission'
import { changedKeys, conflictingKeys, diffPatch, sameValue } from '~/utils/dirty-patch'
import { useDirtyPatch } from '~/composables/useDirtyPatch'
import { endOfDayIso, INCOMPLETE_DAY, startOfDayIso } from '~/utils/validity'
import { apiKeyRotateEffects } from '~/utils/api-key-confirm'
import { createTagsEnterGuard, TAGS_INPUT_SELECTOR } from '~/utils/tags-enter-guard'
import { z } from 'zod'

// The pure half of the forms-and-dialogs kit: diff-only PATCH bodies, conflict detection, the
// shared Zod pieces and the tags Enter guard's arming. The dialog behaviour (guard, pending lock,
// typed confirmation, Enter in a tags field) is in E2E.

describe('dirty-patch utils', () => {
  it('compares JSON-like values structurally', () => {
    expect(sameValue(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(sameValue(['a', 'b'], ['b', 'a'])).toBe(false)
    expect(sameValue({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true)
    expect(sameValue(null, undefined)).toBe(false)
    expect(sameValue({ a: undefined }, {})).toBe(true)
  })

  it('keeps only the changed keys, plus the always-keys when anything changed', () => {
    const before = { role_ids: ['r1'], status: 'active', valid_until: null as string | null, reason: undefined as string | undefined }
    expect(diffPatch(before, { ...before }, ['reason'])).toEqual({})
    expect(diffPatch(before, { ...before, reason: 'audit note' }, ['reason'])).toEqual({})
    expect(diffPatch(before, { ...before, valid_until: '2026-10-06T02:59:59.999Z', reason: 'extend' }, ['reason']))
      .toEqual({ valid_until: '2026-10-06T02:59:59.999Z', reason: 'extend' })
    // A cleared value is a change and is sent as null; an undefined always-key is left out.
    expect(diffPatch<{ valid_until: string | null, reason?: string }>({ valid_until: 'x', reason: undefined }, { valid_until: null, reason: undefined }, ['reason']))
      .toEqual({ valid_until: null })
    expect(changedKeys({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual(['b'])
  })

  it('reports a conflict only for a field both sides changed differently', () => {
    const base = { status: 'active', valid_until: null as string | null, role_ids: ['r1'] }
    const mine = { ...base, valid_until: '2026-10-06T02:59:59.999Z' }
    // They changed another field: no conflict (a diff-only PATCH leaves it alone).
    expect(conflictingKeys(base, mine, { ...base, role_ids: ['r1', 'r2'] })).toEqual([])
    // They changed the same field to something else: conflict.
    expect(conflictingKeys(base, mine, { ...base, valid_until: '2026-12-01T02:59:59.999Z' })).toEqual(['valid_until'])
    // They made the same change: no conflict.
    expect(conflictingKeys(base, mine, { ...mine })).toEqual([])
  })
})

describe('useDirtyPatch', () => {
  function setup() {
    const state = reactive({ status: 'active' as 'active' | 'suspended', validFrom: '', validUntil: '2026-10-05', reason: '' })
    const edit = useDirtyPatch(state, s => ({
      status: s.status,
      valid_from: startOfDayIso(s.validFrom, 'UTC'),
      valid_until: endOfDayIso(s.validUntil, 'UTC'),
      reason: s.reason.trim() || undefined
    }), { always: ['reason'] })
    edit.snapshot()
    return { state, edit }
  }

  it('is clean right after the snapshot and sends nothing', () => {
    const { edit } = setup()
    expect(edit.dirty.value).toBe(false)
    expect(edit.patch.value).toEqual({})
  })

  it('sends only what changed, with the audit note', async () => {
    const { state, edit } = setup()
    state.validUntil = '2026-10-20'
    state.reason = ' extend contract '
    await nextTick()
    expect(edit.dirty.value).toBe(true)
    expect(edit.changed.value).toEqual(['valid_until'])
    expect(edit.patch.value).toEqual({ valid_until: '2026-10-20T23:59:59.999Z', reason: 'extend contract' })
  })

  it('is clean again when the value is changed back', async () => {
    const { state, edit } = setup()
    state.status = 'suspended'
    await nextTick()
    expect(edit.dirty.value).toBe(true)
    state.status = 'active'
    await nextTick()
    expect(edit.dirty.value).toBe(false)
  })

  it('names the fields the server changed underneath the dialog', () => {
    const { state, edit } = setup()
    state.validUntil = '2026-10-20'
    const server = { status: 'active' as const, validFrom: '', validUntil: '2026-11-01', reason: '' }
    expect(edit.conflicts(server)).toEqual(['valid_until'])
    expect(edit.conflicts({ ...server, validUntil: '2026-10-05', status: 'suspended' })).toEqual([])
  })
})

describe('shared schemas', () => {
  it('requires trimmed text', () => {
    expect(requiredText('Name').safeParse('  ').success).toBe(false)
    expect(requiredText('Name').safeParse(' x ').data).toBe('x')
  })

  it('accepts a real day or nothing', () => {
    expect(dateInput.safeParse('').success).toBe(true)
    expect(dateInput.safeParse('2026-10-05').success).toBe(true)
    expect(dateInput.safeParse('2026-10-32').success).toBe(false)
  })

  it('rejects a partly typed day instead of treating it as not set', () => {
    const result = dateInput.safeParse(INCOMPLETE_DAY)
    expect(result.success).toBe(false)
    expect(result.error?.issues.map(issue => issue.message)).toEqual(['Enter the whole date, or clear it.'])
    // The window check leaves it to the field: one message, on the field that is incomplete.
    const schema = z.object(validityWindowShape).superRefine(checkValidityWindow)
    const window = schema.safeParse({ validFrom: INCOMPLETE_DAY, validUntil: '2026-10-05' })
    expect(window.error?.issues.map(issue => [issue.path.join('.'), issue.message])).toEqual([['validFrom', 'Enter the whole date, or clear it.']])
  })

  it('rejects duplicate or empty tags', () => {
    expect(tagList.safeParse(['billing', 'sensitive']).success).toBe(true)
    expect(tagList.safeParse(['billing', 'billing']).success).toBe(false)
    expect(tagList.safeParse(['']).success).toBe(false)
  })

  it('puts an out-of-order validity window on "valid until"', () => {
    const schema = z.object(validityWindowShape).superRefine(checkValidityWindow)
    const result = schema.safeParse({ validFrom: '2026-10-20', validUntil: '2026-10-10' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['validUntil'])
    expect(schema.safeParse({ validFrom: '2026-10-10', validUntil: '2026-10-10' }).success).toBe(true)
    expect(roleAssignmentEditSchema.safeParse({ status: 'active', validFrom: '2026-10-20', validUntil: '2026-10-10' }).success).toBe(false)
  })

  it('validates the reference permission form', () => {
    const valid = { resource: 'lead', action: 'create', display_name: 'Create lead', description: '', tags: ['billing'], is_active: true }
    expect(createPermissionSchema.safeParse(valid).success).toBe(true)
    expect(createPermissionSchema.safeParse({ ...valid, resource: 'Lead:x' }).success).toBe(false)
    expect(createPermissionSchema.safeParse({ ...valid, display_name: ' ' }).success).toBe(false)
  })
})

describe('rotate copy', () => {
  it('states what the new key keeps and that the old one stops at once', () => {
    const effects = apiKeyRotateEffects({ expires_at: null })
    expect(effects[0]).toMatch(/stops working immediately/)
    expect(effects[1]).toBe('A new key with the same name, description, scopes, IP allowlist and rate limits is issued and shown once.')
    expect(effects).toContain('Like the current key, the new key never expires.')
  })

  it('says the expiry is rounded up to whole days', () => {
    expect(apiKeyRotateEffects({ expires_at: '2026-10-30T12:00:00Z' }).join(' ')).toMatch(/rounded up to whole days, so it can end up to a day later/)
  })
})

describe('tags Enter guard', () => {
  // A stand-in for the DOM: an element matching the UInputTags input selector, or another one.
  const tagsInput = { matches: (selector: string) => selector === TAGS_INPUT_SELECTOR } as unknown as EventTarget
  const textInput = { matches: () => false } as unknown as EventTarget
  function setup() {
    const queue: Array<() => void> = []
    const guard = createTagsEnterGuard(run => queue.push(run))
    const submit = () => ({ preventDefault: vi.fn(), stopPropagation: vi.fn() })
    const nextTask = () => queue.splice(0).forEach(run => run())
    return { guard, submit, nextTask }
  }

  it('cancels the submit that an Enter in a tags field triggers, empty or filled', () => {
    const { guard, submit, nextTask } = setup()
    // keydown then keypress (the implicit submission runs in the keypress default action).
    guard.onKey({ key: 'Enter', target: tagsInput })
    guard.onKey({ key: 'Enter', target: tagsInput })
    const implicit = submit()
    expect(guard.onSubmit(implicit)).toBe(true)
    expect(implicit.preventDefault).toHaveBeenCalledOnce()
    expect(implicit.stopPropagation).toHaveBeenCalledOnce()
    nextTask()
  })

  it('lets a later submit through: a click on Save right after a tag Enter still saves', () => {
    const { guard, submit, nextTask } = setup()
    guard.onKey({ key: 'Enter', target: tagsInput })
    nextTask()
    const click = submit()
    expect(guard.onSubmit(click)).toBe(false)
    expect(click.preventDefault).not.toHaveBeenCalled()
    expect(click.stopPropagation).not.toHaveBeenCalled()
  })

  it('stays out of Enter in other fields and of other keys in tags fields', () => {
    const { guard, submit } = setup()
    guard.onKey({ key: 'Enter', target: textInput })
    guard.onKey({ key: 'Enter', target: null })
    guard.onKey({ key: 'a', target: tagsInput })
    guard.onKey({ key: 'Tab', target: tagsInput })
    expect(guard.onSubmit(submit())).toBe(false)
  })

  it('never cancels the key itself (reka would then skip adding the tag)', () => {
    const { guard } = setup()
    const key = { key: 'Enter', target: tagsInput, preventDefault: vi.fn(), stopPropagation: vi.fn() }
    guard.onKey(key)
    expect(key.preventDefault).not.toHaveBeenCalled()
    expect(key.stopPropagation).not.toHaveBeenCalled()
  })
})
