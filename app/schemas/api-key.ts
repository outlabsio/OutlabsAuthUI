import { z } from 'zod'
import { optionalText, requiredText, tagList } from '~/schemas/common'
import { EXPIRY_CHOICES } from '~/utils/api-keys'

// API-key and service-account forms (UForm :schema).
// - Key fields (machine and personal keys share apiKeyFieldsShape): the IP allowlist is a list
//   (UInputTags) validated per entry as an IPv4/IPv6 address or CIDR range (F-116); the rate limit
//   is a UInputNumber value (null when cleared) with an explicit "No rate limit" switch, and the
//   expiry a preset (F-114).
// - Service accounts: name, description and the access envelope. At least one role or direct scope
//   (the API refuses an account that can do nothing); "includes child entities" exists only for
//   entity-anchored accounts (the API refuses it on platform-wide ones, F-182).

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

function isIpv6(value: string): boolean {
  if (!value.includes(':') || /[^0-9a-f:.]/i.test(value)) return false
  try {
    // The WHATWG URL parser validates IPv6 literals (and IPv4-mapped tails) exactly.
    void new URL(`http://[${value}]/`)
    return true
  } catch {
    return false
  }
}

/** An IPv4 or IPv6 address, optionally with a CIDR prefix length (203.0.113.0/24, 2001:db8::/32). */
export function isIpOrCidr(value: string): boolean {
  const [address = '', prefix, extra] = value.trim().split('/')
  if (extra !== undefined) return false
  const v4 = IPV4.test(address)
  const v6 = !v4 && isIpv6(address)
  if (!v4 && !v6) return false
  if (prefix === undefined) return true
  if (!/^\d{1,3}$/.test(prefix)) return false
  return Number(prefix) <= (v4 ? 32 : 128)
}

/** UInputTags list of IP addresses or CIDR ranges; the first bad entry is named. */
export const ipAllowlist = tagList.superRefine((values, ctx) => {
  const bad = values.find(value => !isIpOrCidr(value))
  if (bad) ctx.addIssue({ code: 'custom', message: `${bad} is not an IP address or CIDR range.` })
})

export const API_KEY_PREFIX_TYPES = ['sk_live', 'sk_test'] as const

/**
 * The fields a key shares, whoever owns it (F-114): a whole-number rate limit of at least 1 unless
 * "No rate limit" is on (the API reads 0 as unlimited; a blank or negative limit is refused here,
 * never sent), an expiry chosen from presets, and the IP allowlist as validated tags.
 */
export const apiKeyFieldsShape = {
  name: requiredText('Name', 100),
  description: optionalText(500),
  prefix_type: z.enum(API_KEY_PREFIX_TYPES),
  scopes: z.array(z.string()).min(1, 'Choose at least one scope.'),
  no_rate_limit: z.boolean(),
  rate_limit_per_minute: z
    .number({ message: 'Enter a whole number.' })
    .int('Enter a whole number.')
    .min(1, 'Enter at least 1, or turn on No rate limit.')
    .max(1_000_000, 'Enter at most 1,000,000.')
    // Cleared: null or undefined, depending on how the field was emptied.
    .nullish(),
  expires: z.enum(EXPIRY_CHOICES),
  ip_whitelist: ipAllowlist
}

/** A rate limit is required unless "No rate limit" is on. */
export function checkRateLimit(value: { no_rate_limit: boolean, rate_limit_per_minute?: number | null }, ctx: z.RefinementCtx) {
  if (!value.no_rate_limit && value.rate_limit_per_minute == null) {
    ctx.addIssue({ code: 'custom', path: ['rate_limit_per_minute'], message: 'Enter a rate limit, or turn on No rate limit.' })
  }
}

/** The rate limit the API stores: 0 means none. */
export function rateLimitWire(value: { no_rate_limit: boolean, rate_limit_per_minute?: number | null }): number {
  return value.no_rate_limit ? 0 : (value.rate_limit_per_minute ?? 0)
}

export const machineKeySchema = z.object(apiKeyFieldsShape).superRefine(checkRateLimit)
export type MachineKeySchema = z.output<typeof machineKeySchema>
export type MachineKeyFormState = z.input<typeof machineKeySchema>

/**
 * A personal key (F-083): optionally restricted to one entity ('' = not restricted), and then
 * optionally to everything beneath it too.
 */
export const personalKeySchema = z
  .object({
    ...apiKeyFieldsShape,
    entity_id: z.string(),
    inherit_from_tree: z.boolean()
  })
  .superRefine((value, ctx) => {
    checkRateLimit(value, ctx)
    if (value.inherit_from_tree && !value.entity_id) {
      ctx.addIssue({ code: 'custom', path: ['inherit_from_tree'], message: 'Choose an entity first.' })
    }
  })
export type PersonalKeySchema = z.output<typeof personalKeySchema>
export type PersonalKeyFormState = z.input<typeof personalKeySchema>

const serviceAccountShape = {
  name: requiredText('Name', 255),
  description: optionalText(1000),
  role_ids: z.array(z.string()),
  allowed_scopes: z.array(z.string()),
  inherit_from_tree: z.boolean()
}

function envelopeNotEmpty(value: { role_ids: string[], allowed_scopes: string[] }, ctx: z.RefinementCtx) {
  if (!value.role_ids.length && !value.allowed_scopes.length) {
    ctx.addIssue({ code: 'custom', path: ['role_ids'], message: 'Choose at least one role, or add a direct scope under Advanced.' })
  }
}

export const serviceAccountSchema = z.object(serviceAccountShape).superRefine(envelopeNotEmpty)
export type ServiceAccountSchema = z.output<typeof serviceAccountSchema>
export type ServiceAccountFormState = z.input<typeof serviceAccountSchema>
