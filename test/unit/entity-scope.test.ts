import { describe, expect, it } from 'vitest'
import { anchoredRootFor, entityPickBlocked } from '~/utils/entity-scope'

// One scoping rule for entities, users and roles (F-020), and when an admin has no entity to
// pick at all (F-016). Mirrors outlabs-auth's access scope: superusers and holders of an active
// direct system-wide role reach every organization.

const ROOT = 'root-1'

describe('anchoredRootFor (F-020)', () => {
  it('anchors a non-global admin on their organization', () => {
    expect(anchoredRootFor({ superuser: false, actorIsGlobal: false, rootEntityId: ROOT })).toBe(ROOT)
  })

  it('keeps an admin of unknown reach anchored, so nothing widens before it is known', () => {
    expect(anchoredRootFor({ superuser: false, actorIsGlobal: null, rootEntityId: ROOT })).toBe(ROOT)
  })

  it('lets superusers and system-wide admins inside an organization browse every organization', () => {
    expect(anchoredRootFor({ superuser: true, actorIsGlobal: true, rootEntityId: ROOT })).toBeNull()
    expect(anchoredRootFor({ superuser: false, actorIsGlobal: true, rootEntityId: ROOT })).toBeNull()
  })

  it('never anchors an account without an organization', () => {
    expect(anchoredRootFor({ superuser: false, actorIsGlobal: false, rootEntityId: null })).toBeNull()
  })
})

describe('entityPickBlocked (F-016)', () => {
  const base = { enterprise: true, superuser: false, actorIsGlobal: false as boolean | null, anchoredRootId: null as string | null }

  it('blocks a rootless admin without global reach, also while the reach is unknown', () => {
    expect(entityPickBlocked(base)).toBe(true)
    expect(entityPickBlocked({ ...base, actorIsGlobal: null })).toBe(true)
  })

  it('lets a rootless system-wide admin pick through the global search, like a superuser', () => {
    expect(entityPickBlocked({ ...base, actorIsGlobal: true })).toBe(false)
    expect(entityPickBlocked({ ...base, superuser: true, actorIsGlobal: null })).toBe(false)
  })

  it('never blocks an anchored admin or SimpleRBAC', () => {
    expect(entityPickBlocked({ ...base, anchoredRootId: ROOT })).toBe(false)
    expect(entityPickBlocked({ ...base, enterprise: false })).toBe(false)
  })
})
