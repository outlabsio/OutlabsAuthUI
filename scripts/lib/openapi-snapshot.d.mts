// Types for openapi-snapshot.mjs (used by scripts/gen-api-types.mjs, the unit contract test and
// the live E2E route check).

export type OpenApiOperation = { [key: string]: unknown, 'tags'?: string[], 'x-outlabs-auth-surface'?: string[] }
export type OpenApiPathItem = {
  [method: string]: OpenApiOperation | string[] | undefined
  'get'?: OpenApiOperation
  'put'?: OpenApiOperation
  'post'?: OpenApiOperation
  'delete'?: OpenApiOperation
  'patch'?: OpenApiOperation
  'x-outlabs-auth-presets'?: string[]
}

export type OpenApiDocument = {
  [key: string]: unknown
  openapi?: string
  info?: { title?: string, version?: string, description?: string }
  paths?: Record<string, OpenApiPathItem>
  components?: { schemas?: Record<string, unknown> }
}

export type Snapshot = {
  'openapi': string
  'info': { title: string, version: string, description: string }
  'x-outlabs-auth-source': string
  'paths': Record<string, OpenApiPathItem>
  'components': { schemas: Record<string, unknown> }
}

export type SnapshotRoute = { method: string, path: string, surfaces: string[], presets: string[] }

export const SURFACE_EXTENSION: 'x-outlabs-auth-surface'
export const PRESETS_EXTENSION: 'x-outlabs-auth-presets'
export const HTTP_METHODS: string[]
export const API_TYPES_HEADER: string

export function buildSnapshot(
  sources: Array<{ preset: string, spec: OpenApiDocument }>,
  options: { prefix?: string, version: string, source?: string }
): { snapshot: Snapshot, conflicts: string[] }
export function snapshotRoutes(snapshot: { paths?: Record<string, OpenApiPathItem> }): SnapshotRoute[]
export function renderApiTypes(snapshot: object): Promise<string>
