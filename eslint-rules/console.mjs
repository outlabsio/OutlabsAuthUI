// @ts-check
// Local ESLint rules that make the console's styling non-negotiable mechanical
// (AGENTS.md, "Styling"). Registered as the `console` plugin in eslint.config.mjs and pinned
// by the negative fixtures under eslint-fixtures/ (test/unit/lint-guardrails.test.ts).

/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 * @typedef {import('eslint').Rule.RuleContext} RuleContext
 * @typedef {import('eslint').Rule.RuleListener} RuleListener
 */

// One class token, with any variant prefixes (`sm:`, `dark:`, `hover:`) and `!` marks.
const VARIANTS = String.raw`(?:[^\s:]+:)*!?`

/** Tailwind arbitrary values, variants and properties: `max-w-[260px]`, `data-[x]:`, `[mask:a]`. */
const ARBITRARY = [
  new RegExp(String.raw`^${VARIANTS}-?[a-z][\w-]*-\[[^\s\]]+\]!?$`),
  /(?:^|:)[a-z][\w-]*-\[[^\s\]]+\]:/,
  /(?:^|:)\[[^\s\]]*[&@][^\s\]]*\]:/,
  new RegExp(String.raw`^${VARIANTS}\[[a-z-]+:[^\s\]]+\]!?$`),
  new RegExp(String.raw`^${VARIANTS}-?[a-z][\w-]*-\(--[\w-]+\)!?$`)
]

const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|mauve|olive|mist|taupe'
const COLOR_UTILITIES = 'text|bg|border(?:-[trblxyse])?|ring(?:-offset)?|outline|fill|stroke|from|via|to|divide|decoration|accent|caret|shadow|inset-shadow|inset-ring|drop-shadow|placeholder'

/** Raw Tailwind palette shades (`text-red-500`, `bg-white`): semantic utilities only. */
const RAW_PALETTE = [
  new RegExp(String.raw`^${VARIANTS}(?:${COLOR_UTILITIES})-(?:${PALETTE})-(?:50|[1-9]00|950)(?:\/\d+)?!?$`),
  new RegExp(String.raw`^${VARIANTS}(?:${COLOR_UTILITIES})-(?:black|white)(?:\/\d+)?!?$`)
]

// The semantic aliases of app/app.config.ts (neutral is in PALETTE). `text-primary` is the
// semantic utility; a shade of it (`text-primary-500`) bypasses the theme's light/dark tokens.
const ALIASES = 'primary|secondary|success|info|warning|error|accent|special'
const ALIAS_SHADE = new RegExp(String.raw`^${VARIANTS}(?:${COLOR_UTILITIES})-(?:${ALIASES})-(?:50|[1-9]00|950)(?:\/\d+)?!?$`)

/**
 * The opening half of an arbitrary value split by interpolation: `w-[${n}px]` reaches the rule
 * as the template elements `w-[` and `px]`, so the last token before an expression is checked
 * for an unclosed `-[`.
 */
const OPEN_ARBITRARY = new RegExp(String.raw`^${VARIANTS}-?[a-z][\w-]*-\[[^\s\]]*$`)

/** @param {string} token */
function styleProblem(token) {
  if (ARBITRARY.some(pattern => pattern.test(token))) return 'arbitrary'
  if (RAW_PALETTE.some(pattern => pattern.test(token))) return 'palette'
  if (ALIAS_SHADE.test(token)) return 'shade'
  return null
}

/**
 * Visits the template too when the file is a Vue SFC parsed by vue-eslint-parser.
 * @param {RuleContext} context
 * @param {Record<string, (node: any) => void>} template
 * @param {RuleListener} script
 * @returns {RuleListener}
 */
function withTemplate(context, template, script) {
  const services = /** @type {any} */ (context.sourceCode.parserServices)
  if (services && typeof services.defineTemplateBodyVisitor === 'function') {
    return services.defineTemplateBodyVisitor(template, script)
  }
  return script
}

/** @param {string} name */
function toPascal(name) {
  return name.includes('-')
    ? name.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('')
    : name
}

/** @type {RuleModule} */
const noRawTailwind = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow Tailwind arbitrary values and raw palette colours; use stock utilities and semantic colours.' },
    schema: [],
    messages: {
      arbitrary: '"{{token}}" is an arbitrary Tailwind value. Use a stock utility or a Nuxt UI component prop (AGENTS.md, "Styling").',
      palette: '"{{token}}" is a raw palette colour. Use a semantic utility (text-muted, bg-elevated, text-error, ...) or a component color prop (AGENTS.md, "Styling").',
      shade: '"{{token}}" picks a shade of a semantic colour. Use the semantic utility itself (text-primary, bg-error/10, ...) or a component color prop (AGENTS.md, "Styling").'
    }
  },
  create(context) {
    /**
     * @param {any} node
     * @param {unknown} value
     */
    function check(node, value) {
      if (typeof value !== 'string' || !value) return
      const reported = new Set()
      for (const token of value.split(/\s+/)) {
        const problem = token && styleProblem(token)
        if (!problem || reported.has(token)) continue
        reported.add(token)
        context.report({ node, messageId: problem, data: { token } })
      }
    }

    const script = {
      /** @param {any} node */
      Literal(node) {
        if (node.parent?.type === 'ImportDeclaration' || node.parent?.type === 'ExportAllDeclaration') return
        check(node, node.value)
      },
      /** @param {any} node */
      TemplateElement(node) {
        const cooked = node.value.cooked
        check(node, cooked)
        if (node.tail || typeof cooked !== 'string') return
        const last = cooked.split(/\s+/).pop()
        if (last && OPEN_ARBITRARY.test(last)) {
          context.report({ node, messageId: 'arbitrary', data: { token: `${last}…` } })
        }
      }
    }

    return withTemplate(context, {
      ...script,
      // Static attribute values that hold classes: class="…", any *-class / *Class prop.
      /** @param {any} node */
      'VAttribute[directive=false]'(node) {
        const name = String(node.key.rawName ?? node.key.name ?? '')
        if (node.value && /(?:^|-)class$|Class$/.test(name)) check(node.value, node.value.value)
      }
    }, script)
  }
}

// Which Nuxt UI components may take a `:ui` prop, and which slots of it (AGENTS.md, "Styling").
// `max-width` slots accept only max-width utilities; `classes` slots accept stock utilities as
// the official dashboard template uses them.
const DEFAULT_UI_ALLOWLIST = {
  UModal: { content: 'max-width' },
  USlideover: { content: 'max-width' },
  UDashboardPanel: { body: 'classes' },
  UDashboardSidebar: { footer: 'classes' }
}

const MAX_WIDTH_TOKEN = /^(?:(?:sm|md|lg|xl|2xl):)?max-w-[a-z0-9.]+$/

/**
 * The strings a `ui` slot value can evaluate to, when it is a literal or picks between literals
 * (`size === 'xl' ? 'sm:max-w-3xl' : undefined`); null when any leaf is not a literal.
 * @param {any} node
 * @returns {{ node: any, value: string }[] | null}
 */
function literalLeaves(node) {
  if (!node) return null
  switch (node.type) {
    case 'Literal':
      if (typeof node.value === 'string') return [{ node, value: node.value }]
      return node.value === null ? [] : null
    case 'Identifier':
      return node.name === 'undefined' ? [] : null
    case 'TemplateLiteral':
      return node.expressions.length === 0 ? [{ node, value: String(node.quasis[0]?.value.cooked ?? '') }] : null
    case 'ConditionalExpression': {
      const consequent = literalLeaves(node.consequent)
      const alternate = literalLeaves(node.alternate)
      return consequent && alternate ? [...consequent, ...alternate] : null
    }
    case 'LogicalExpression': {
      // `wide && 'sm:max-w-3xl'`: the left side is a condition; with || and ?? it is a value.
      const right = literalLeaves(node.right)
      if (node.operator === '&&') return right
      const left = literalLeaves(node.left)
      return left && right ? [...left, ...right] : null
    }
    default:
      return null
  }
}

/** @type {RuleModule} */
const uiAllowlist = {
  meta: {
    type: 'problem',
    docs: { description: 'Allow the Nuxt UI `ui` prop only on allowlisted components and slots.' },
    schema: [{ type: 'object', additionalProperties: { type: 'object', additionalProperties: { enum: ['max-width', 'classes'] } } }],
    messages: {
      element: '`ui` overrides are not allowed on <{{element}}>. Use the component\'s props, a layout wrapper or app.config.ts (AGENTS.md, "Styling").',
      static: 'A static `ui` attribute is not allowed. Only allowlisted components take `:ui`, as an object literal (AGENTS.md, "Styling").',
      object: '`:ui` on <{{element}}> must be an object literal naming its slots, so the allowlist can be checked.',
      slot: '`ui.{{slot}}` is not allowed on <{{element}}>; allowed: {{allowed}} (AGENTS.md, "Styling").',
      maxWidth: '`ui.{{slot}}` on <{{element}}> may only set a max width (max-w-*, sm:max-w-*), not "{{token}}".',
      literal: '`ui.{{slot}}` on <{{element}}> must be a string literal, or a choice between literals, so the allowlist can check it.',
      spread: '`ui` passed inside an object `v-bind` cannot be checked. Bind `:ui` directly on an allowlisted component (AGENTS.md, "Styling").'
    }
  },
  create(context) {
    /** @type {Record<string, Record<string, string>>} */
    const allowlist = context.options[0] ?? DEFAULT_UI_ALLOWLIST

    return withTemplate(context, {
      /** @param {any} node */
      'VAttribute[directive=false][key.name="ui"]'(node) {
        context.report({ node, messageId: 'static' })
      },
      /** @param {any} node */
      'VAttribute[directive=true][key.name.name="bind"][key.argument.name="ui"]'(node) {
        const element = toPascal(String(node.parent?.parent?.rawName ?? ''))
        const slots = allowlist[element]
        if (!slots) {
          context.report({ node, messageId: 'element', data: { element } })
          return
        }
        const expression = node.value?.expression
        if (!expression || expression.type !== 'ObjectExpression') {
          context.report({ node, messageId: 'object', data: { element } })
          return
        }
        for (const property of expression.properties) {
          const slot = property.type === 'Property' && !property.computed
            ? (property.key.type === 'Identifier' ? property.key.name : String(property.key.value))
            : null
          if (!slot || !slots[slot]) {
            context.report({
              node: property,
              messageId: 'slot',
              data: { slot: slot ?? '…', element, allowed: Object.keys(slots).join(', ') }
            })
            continue
          }
          const leaves = literalLeaves(property.value)
          if (!leaves) {
            context.report({ node: property.value, messageId: 'literal', data: { slot, element } })
            continue
          }
          if (slots[slot] !== 'max-width') continue
          for (const leaf of leaves) {
            for (const token of leaf.value.split(/\s+/).filter(Boolean)) {
              if (!MAX_WIDTH_TOKEN.test(token)) {
                context.report({ node: leaf.node, messageId: 'maxWidth', data: { slot, element, token } })
              }
            }
          }
        }
      },
      // v-bind="{ ui: … }" would slip past the checks above.
      /** @param {any} node */
      'VAttribute[directive=true][key.name.name="bind"]'(node) {
        if (node.key.argument) return
        const expression = node.value?.expression
        if (expression?.type !== 'ObjectExpression') return
        for (const property of expression.properties) {
          if (property.type !== 'Property' || property.computed) continue
          const name = property.key.type === 'Identifier' ? property.key.name : String(property.key.value)
          if (name === 'ui') context.report({ node: property, messageId: 'spread' })
        }
      }
    }, {})
  }
}

export default {
  meta: { name: 'console' },
  rules: {
    'no-raw-tailwind': noRawTailwind,
    'ui-allowlist': uiAllowlist
  }
}

export { DEFAULT_UI_ALLOWLIST }
