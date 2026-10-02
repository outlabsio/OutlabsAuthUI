// Types for client-routes.mjs (used by the unit contract test and the live E2E route check).

export type ClientRoute = { method: string, path: string, file: string, line: number }
export type UnresolvedCall = { file: string, line: number, expression: string }
export type RouteProblem = ClientRoute & { problem: string }

export const DYNAMIC_PATHS: Record<string, string[]>
export const ROUTES_OUTSIDE_SNAPSHOT: Record<string, string>

export function resolvePathExpression(expression: string, file?: string): string[] | null
export function extractClientRoutes(files: Array<{ file: string, source: string }>): { routes: ClientRoute[], unresolved: UnresolvedCall[] }
export function normalizeTemplatePath(path: string): string
export function compareRoutes(
  clientRoutes: ClientRoute[],
  apiRoutes: Array<{ method: string, path: string }>,
  options?: { outside?: Record<string, string> }
): RouteProblem[]
