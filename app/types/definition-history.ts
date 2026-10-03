import type { PaginatedResponse } from '~/types/auth'
import type { ResponseBody, Schemas } from '~/types/wire'

// Definition history (outlabs-auth 0.1.0a35): the append-only record of changes to one role or
// permission definition, GET /roles/{id}/history and GET /permissions/{id}/history, newest first.
// `name`, `display_name` and `status` are snapshots at the event; role events also carry the
// permission names after the event. `before` / `after` are whole definition snapshots (role keys
// `role_name`, `role_display_name`, `role_description`, `status`, …; permission keys
// `permission_name`, `permission_display_name`, …) and `metadata` says what the event changed.
export type DefinitionHistoryEvent = ResponseBody<Schemas['DefinitionHistoryEventResponse']>

export type DefinitionHistoryResponse = PaginatedResponse<DefinitionHistoryEvent>

export type DefinitionKind = DefinitionHistoryEvent['definition_kind']
