import { apiUrl, runId } from './env'
import { type PersonaKey, personaToken } from './personas'
import { testData } from './test-data'

// Typed API client for arranging state (the `api` / `apiAs` fixtures). Tests arrange through
// the API and assert through the UI. It authenticates with a persona's minted token — never
// by logging in — so arranging data does not spend the backend's password-login budget.
// Non-2xx responses throw ApiRequestError unless the status is listed in `allow`.

export class ApiRequestError extends Error {
  constructor(readonly method: string, readonly path: string, readonly status: number, readonly body: unknown) {
    super(`${method} ${path} → ${status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`)
    this.name = 'ApiRequestError'
  }
}

type Query = Record<string, string | number | boolean | null | undefined>

type RequestOptions = {
  body?: unknown
  query?: Query
  // Statuses to return instead of throwing (the parsed body, or null, is returned).
  allow?: number[]
}

export type ApiUser = {
  id: string
  email: string
  status?: string
  is_superuser?: boolean
  root_entity_id?: string | null
  root_entity_name?: string | null
  first_name?: string | null
  last_name?: string | null
}

export type ApiEntity = {
  id: string
  name: string
  slug: string
  display_name: string
  entity_class?: string
  entity_type?: string
  parent_entity_id?: string | null
  status?: string
  allowed_child_types?: string[]
  allowed_child_classes?: string[]
  max_members?: number | null
  child_name_pattern?: string | null
  child_display_name_pattern?: string | null
  child_slug_pattern?: string | null
  child_naming_guidance?: string | null
}

export type ApiRole = {
  id: string
  name: string
  display_name?: string
  is_global?: boolean
  root_entity_id?: string | null
}

export type ApiPermission = {
  id: string
  name: string
  display_name?: string
}

export type Page<T> = { items: T[], total?: number }

// Password that satisfies the example apps' password policy (upper, lower, digit, special).
export const TEST_PASSWORD = 'Pw-e2e-Passw0rd!'

export class ApiClient {
  readonly data = testData(runId)

  constructor(private readonly token: () => string, readonly label: string) {}

  static forPersona(key: PersonaKey): ApiClient {
    return new ApiClient(() => personaToken(key), key)
  }

  static forToken(token: string, label = 'token'): ApiClient {
    return new ApiClient(() => token, label)
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(apiUrl(path))
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
    }
    const headers: Record<string, string> = { Authorization: `Bearer ${this.token()}` }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    const response = await fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    })
    const text = await response.text()
    let parsed: unknown
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = text
    }
    if (!response.ok && !options.allow?.includes(response.status)) {
      throw new ApiRequestError(method, url.pathname + url.search, response.status, parsed)
    }
    return parsed as T
  }

  get<T>(path: string, options?: Omit<RequestOptions, 'body'>) {
    return this.request<T>('GET', path, options)
  }

  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) {
    return this.request<T>('POST', path, { ...options, body })
  }

  patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) {
    return this.request<T>('PATCH', path, { ...options, body })
  }

  put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) {
    return this.request<T>('PUT', path, { ...options, body })
  }

  delete<T = null>(path: string, options?: Omit<RequestOptions, 'body'>) {
    return this.request<T>('DELETE', path, options)
  }

  // Every row of a paginated list (bare array or { items } envelope; limit capped at 100).
  async listAll<T extends { id: string }>(path: string, query: Query = {}): Promise<T[]> {
    const rows: T[] = []
    const seen = new Set<string>()
    for (let page = 1; page <= 100; page++) {
      const data = await this.get<T[] | Page<T>>(path, { query: { ...query, page, limit: 100 } })
      const batch = Array.isArray(data) ? data : (data?.items ?? [])
      const fresh = batch.filter(row => row.id && !seen.has(row.id))
      for (const row of fresh) seen.add(row.id)
      rows.push(...fresh)
      if (batch.length < 100 || fresh.length === 0) break
    }
    return rows
  }

  me() {
    return this.get<ApiUser>('/users/me')
  }

  // An active user with a password, named with this run's marker (cleaned up after the run).
  createUser(input: Partial<Omit<ApiUser, 'id'>> & { password?: string, kind?: string } = {}) {
    const { kind = 'user', ...rest } = input
    return this.post<ApiUser>('/users/', {
      email: this.data.email(kind),
      password: TEST_PASSWORD,
      first_name: 'E2E',
      last_name: kind,
      ...rest
    })
  }

  async findUserByEmail(email: string): Promise<ApiUser | null> {
    const page = await this.get<Page<ApiUser>>('/users/', { query: { search: email, limit: 20 } })
    return page.items.find(user => user.email.toLowerCase() === email.toLowerCase()) ?? null
  }

  // A structural organization root (or a child when parent_entity_id is given), run-marked.
  createEntity(input: Partial<Omit<ApiEntity, 'id'>> & { kind?: string } = {}) {
    const { kind = 'entity', ...rest } = input
    const slug = this.data.name(kind)
    return this.post<ApiEntity>('/entities/', {
      name: slug,
      slug,
      display_name: this.data.displayName(kind),
      entity_class: 'structural',
      entity_type: 'organization',
      ...rest
    })
  }

  createRole(input: Partial<Omit<ApiRole, 'id'>> & { permissions?: string[], kind?: string } = {}) {
    const { kind = 'role', ...rest } = input
    return this.post<ApiRole>('/roles/', {
      name: this.data.name(kind),
      display_name: this.data.displayName(kind),
      permissions: [],
      ...rest
    })
  }

  createPermission(input: { action?: string, kind?: string, display_name?: string, description?: string } = {}) {
    const { kind = 'perm', action = 'read', ...rest } = input
    const resource = this.data.resource(kind)
    return this.post<ApiPermission>('/permissions/', {
      name: `${resource}:${action}`,
      display_name: this.data.displayName(kind),
      description: '',
      ...rest
    })
  }

  // Scopes this actor may grant a personal key (optionally anchored at an entity).
  async grantableScopes(entityId?: string): Promise<string[]> {
    const data = await this.get<{ grantable_scopes?: string[] }>('/api-keys/grantable-scopes', { query: { entity_id: entityId } })
    return data?.grantable_scopes ?? []
  }
}
