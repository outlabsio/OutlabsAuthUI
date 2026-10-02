import { describe, expectTypeOf, it } from 'vitest'
import type { PaginatedResponse, SessionUser } from '~/types/auth'
import type { ApiKey, CreateApiKeyInput, CreateApiKeyResponse, IntegrationPrincipal } from '~/types/api-key'
import type { Entity } from '~/types/entity'
import type { AddMemberInput, EntityMember, Membership } from '~/types/membership'
import type { Permission } from '~/types/permission'
import type { Role } from '~/types/role'
import type { CreateUserInput, OrphanedUser, User, UserRoleMembership } from '~/types/user'
import type { Schemas } from '~/types/wire'

// The domain types derive from the generated wire types (F-135). These checks run under
// `bun run typecheck:tests`: a library release that renames or retypes a field the console
// relies on fails here, next to the regenerated app/types/api.gen.ts.

describe('domain types derived from the OpenAPI snapshot', () => {
  it('read the same shapes the API returns', () => {
    expectTypeOf<User>().toExtend<Schemas['UserResponse']>()
    expectTypeOf<SessionUser['locked_until']>().toEqualTypeOf<string | null>()
    expectTypeOf<Role>().toExtend<Schemas['RoleResponse']>()
    expectTypeOf<Role['permissions']>().toEqualTypeOf<string[]>()
    expectTypeOf<Permission>().toExtend<Schemas['PermissionResponse']>()
    expectTypeOf<Entity>().toExtend<Schemas['EntityResponse']>()
    expectTypeOf<Membership>().toExtend<Schemas['MembershipResponse']>()
    expectTypeOf<EntityMember>().toExtend<Schemas['EntityMemberResponse']>()
    expectTypeOf<UserRoleMembership>().toExtend<Schemas['UserRoleMembershipDetailResponse']>()
    expectTypeOf<OrphanedUser['user']>().toEqualTypeOf<User>()
    expectTypeOf<ApiKey>().toExtend<Schemas['ApiKeyResponse']>()
    expectTypeOf<ApiKey['is_currently_effective']>().toEqualTypeOf<boolean | null>()
    expectTypeOf<CreateApiKeyResponse['api_key']>().toEqualTypeOf<string>()
    expectTypeOf<IntegrationPrincipal>().toExtend<Schemas['IntegrationPrincipalResponse']>()
  })

  it('uses the API\'s paginated envelope', () => {
    expectTypeOf<PaginatedResponse<Role>>().toExtend<Omit<Schemas['PaginatedResponse_RoleResponse_'], 'items'>>()
    expectTypeOf<keyof PaginatedResponse<Role>>().toEqualTypeOf<keyof Schemas['PaginatedResponse_RoleResponse_']>()
  })

  it('builds request bodies the API accepts', () => {
    expectTypeOf<CreateUserInput>().toExtend<Partial<Schemas['UserCreateRequest']>>()
    expectTypeOf<AddMemberInput>().toExtend<Partial<Schemas['MembershipCreateRequest']>>()
    expectTypeOf<CreateApiKeyInput>().toExtend<Partial<Schemas['ApiKeyCreateRequest']>>()
  })
})
