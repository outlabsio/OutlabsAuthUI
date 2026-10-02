import type { components } from '~/types/api.gen'

// Helpers for deriving the console's domain types from the generated wire types
// (app/types/api.gen.ts, from the checked-in OpenAPI snapshot). A field renamed or retyped by a
// library release then fails typecheck where it is used instead of rendering blank.

/** Every component schema of the targeted outlabs-auth release. */
export type Schemas = components['schemas']

/**
 * A response body. FastAPI serializes every field a response model declares (null when unset,
 * [] for list defaults), so none is ever missing — even fields the schema does not list as
 * required, such as lists built by a default factory.
 */
export type ResponseBody<T> = { [K in keyof T]-?: T[K] }

/**
 * Replace some fields of a wire type, e.g. narrow a `status: string` to the values the console
 * handles. Only existing fields may be replaced.
 */
export type Narrow<T, Replacements extends { [K in keyof Replacements]: K extends keyof T ? unknown : never }>
  = Omit<T, keyof Replacements> & Replacements

/**
 * A request body as the console builds it: the listed fields required, every other field of the
 * schema optional (fields with a server-side default are required in the generated type because
 * responses always carry them, but a request may omit them).
 */
export type RequestBody<T, Required extends keyof T = never> = Pick<T, Required> & Partial<Omit<T, Required>>
