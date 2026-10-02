// Static inventory of every API route the console calls, checked against the OpenAPI snapshot by
// test/unit/api-contract.test.ts (and against a live backend by e2e/app/openapi-routes.spec.ts).
//
// It reads the source of app/**: every `apiClient.<method>(path, …)` call and the client's own
// `buildApiUrl(path)` requests. A path is a string or template literal; interpolations become a
// `{param}` segment, query strings are dropped, and the few computed prefixes the code uses are
// expanded from DYNAMIC_PATHS. A call whose path cannot be resolved is reported, so a new dynamic
// path has to be taught here before the contract test passes.

const METHODS = ['get', 'post', 'put', 'patch', 'delete']

// Computed path expressions -> every path they can produce (keep in sync with the helpers).
export const DYNAMIC_PATHS = {
  // app/queries/api-keys.ts principalsBase(scope)
  'principalsBase(scope)': ['/admin/entities/{param}/integration-principals', '/admin/system/integration-principals'],
  // app/queries/abac.ts base(scope)
  'base(scope)': ['/roles/{param}', '/permissions/{param}'],
  // app/queries/session.ts fetchMyPermissions: myPermissionsPath(mounted_surfaces)
  'path@app/queries/session.ts': ['/permissions/me', '/users/me/permissions'],
  // app/queries/roles.ts fetchAllRolePages(path): rolesCatalogQuery and entityRolesQuery
  'path(page)@app/queries/roles.ts': ['/roles/', '/roles/entity/{param}']
}

// Routes the console calls that the example backends behind the snapshot do not mount.
export const ROUTES_OUTSIDE_SNAPSHOT = {
  'GET /oauth/{param}/authorize': 'OAuth sign-in router; mounted only when the host configures providers.',
  'GET /oauth-associate/{param}/authorize': 'OAuth account-linking router; mounted only when the host configures providers.',
  'GET /users/me/permissions': 'The self_service_users surface, used only when the permissions router is not mounted.'
}

function lineOf(source, index) {
  let line = 1
  for (let i = 0; i < index; i++) if (source.charCodeAt(i) === 10) line++
  return line
}

// Index just past a balanced group starting at `start` (source[start] is the opener).
function skipBalanced(source, start, open, close) {
  let depth = 0
  for (let i = start; i < source.length; i++) {
    const char = source[i]
    if (char === '\'' || char === '"' || char === '`') {
      i = skipString(source, i)
      continue
    }
    if (char === open) depth++
    else if (char === close) {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return source.length
}

// Index of the closing quote of the string literal starting at `start`.
function skipString(source, start) {
  const quote = source[start]
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === '\\') {
      i++
      continue
    }
    if (quote === '`' && source[i] === '$' && source[i + 1] === '{') {
      i = skipBalanced(source, i + 1, '{', '}') - 1
      continue
    }
    if (source[i] === quote) return i
  }
  return source.length
}

// The first call argument's source text (up to a top-level comma or the closing paren).
function firstArgument(source, openParen) {
  let depth = 0
  for (let i = openParen + 1; i < source.length; i++) {
    const char = source[i]
    if (char === '\'' || char === '"' || char === '`') {
      i = skipString(source, i)
      continue
    }
    if (char === '(' || char === '[' || char === '{') depth++
    else if (char === ')' || char === ']' || char === '}') {
      if (depth === 0) return source.slice(openParen + 1, i).trim()
      depth--
    } else if (char === ',' && depth === 0) {
      return source.slice(openParen + 1, i).trim()
    }
  }
  return source.slice(openParen + 1).trim()
}

function stripQuery(path) {
  const index = path.indexOf('?')
  return index === -1 ? path : path.slice(0, index)
}

// Template literal body -> path alternatives.
function resolveTemplate(body) {
  let alternatives = ['']
  let i = 0
  while (i < body.length) {
    if (body[i] === '$' && body[i + 1] === '{') {
      const end = skipBalanced(body, i + 1, '{', '}')
      const expression = body.slice(i + 2, end - 1).trim()
      i = end
      if (DYNAMIC_PATHS[expression]) {
        alternatives = alternatives.flatMap(prefix => DYNAMIC_PATHS[expression].map(path => prefix + path))
      } else if (/['"`]\?/.test(expression) || alternatives.some(a => a.includes('?'))) {
        // A conditional query string, or anything after the '?'.
        alternatives = alternatives.map(a => `${a}?`)
      } else {
        alternatives = alternatives.map(a => `${a}{param}`)
      }
      continue
    }
    alternatives = alternatives.map(a => a + body[i])
    i++
  }
  return alternatives.map(stripQuery)
}

/** Path alternatives for a call's first-argument source, or null when it cannot be resolved. */
export function resolvePathExpression(expression, file = '') {
  const expr = expression.trim()
  const wrapped = /^withFrontendProfileQuery\(([\s\S]*)\)$/.exec(expr)
  if (wrapped) return resolvePathExpression(wrapped[1], file)
  if ((expr.startsWith('\'') && expr.endsWith('\'')) || (expr.startsWith('"') && expr.endsWith('"'))) {
    return [stripQuery(expr.slice(1, -1))]
  }
  if (expr.startsWith('`') && expr.endsWith('`')) return resolveTemplate(expr.slice(1, -1))
  const known = DYNAMIC_PATHS[expr] ?? DYNAMIC_PATHS[`${expr}@${file}`]
  return known ? [...known] : null
}

/**
 * Every route the given source files call.
 * @param {Array<{ file: string, source: string }>} files - repo-relative path + contents
 */
export function extractClientRoutes(files) {
  const routes = []
  const unresolved = []
  for (const { file, source } of files) {
    const callPattern = /apiClient\.(get|post|put|patch|delete)\b/g
    let match
    while ((match = callPattern.exec(source))) {
      let index = match.index + match[0].length
      if (source[index] === '<') index = skipBalanced(source, index, '<', '>')
      if (source[index] !== '(') continue
      const argument = firstArgument(source, index)
      const line = lineOf(source, match.index)
      const paths = resolvePathExpression(argument, file)
      if (!paths) {
        unresolved.push({ file, line, expression: argument })
        continue
      }
      for (const path of paths) routes.push({ method: match[1].toUpperCase(), path, file, line })
    }

    const urlPattern = /buildApiUrl\(/g
    while ((match = urlPattern.exec(source))) {
      // Skip the helper's own definition.
      if (/function\s+$/.test(source.slice(Math.max(0, match.index - 12), match.index))) continue
      const open = match.index + match[0].length - 1
      const argument = firstArgument(source, open)
      // The generic request() builder takes its caller's path; the literal ones are the client's
      // own session requests, whose method is given right after.
      if (argument === 'path') continue
      const line = lineOf(source, match.index)
      const paths = resolvePathExpression(argument, file)
      const method = /method:\s*'([A-Z]+)'/.exec(source.slice(open, open + 400))?.[1]
      if (!paths || !method || !METHODS.includes(method.toLowerCase())) {
        unresolved.push({ file, line, expression: argument })
        continue
      }
      for (const path of paths) routes.push({ method, path, file, line })
    }
  }
  return { routes, unresolved }
}

/** '/users/{user_id}' -> '/users/{param}' so client and snapshot paths compare. */
export function normalizeTemplatePath(path) {
  return path.replace(/\{[^}]+\}/g, '{param}')
}

/**
 * Compare client routes with snapshot routes ({ method, path }).
 * Returns the problems: a missing route, a method the path does not accept, or a trailing-slash
 * mismatch (the API answers those with a 307 redirect, which can drop a request body and
 * breaks behind proxies).
 */
export function compareRoutes(clientRoutes, apiRoutes, { outside = ROUTES_OUTSIDE_SNAPSHOT } = {}) {
  const byPath = new Map()
  for (const route of apiRoutes) {
    const path = normalizeTemplatePath(route.path)
    if (!byPath.has(path)) byPath.set(path, new Set())
    byPath.get(path).add(route.method.toUpperCase())
  }
  const problems = []
  const seen = new Set()
  for (const route of clientRoutes) {
    const key = `${route.method} ${route.path}`
    if (seen.has(key)) continue
    seen.add(key)
    if (outside[key]) continue
    const methods = byPath.get(route.path)
    if (methods?.has(route.method)) continue
    const toggled = route.path.endsWith('/') ? route.path.slice(0, -1) : `${route.path}/`
    if (byPath.get(toggled)?.has(route.method)) {
      problems.push({ ...route, problem: `trailing slash: the API route is ${toggled}` })
    } else if (methods) {
      problems.push({ ...route, problem: `the API route accepts ${[...methods].sort().join(', ')} only` })
    } else {
      problems.push({ ...route, problem: 'no such API route' })
    }
  }
  return problems
}
