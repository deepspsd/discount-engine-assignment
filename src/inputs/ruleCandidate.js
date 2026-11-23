/**
 * ruleCandidate.js
 *
 * The gate between "something described a rule" and "the engine may use it".
 * Takes an untrusted candidate (today: the LLM's JSON) and returns either a
 * valid DiscountRule or a reason the user can act on. Pure — no network, no UI.
 *
 * The LLM is treated like any other unreliable input. Its answer is never
 * used as-is: every field is checked here, and the numbers are checked against
 * what the user actually typed.
 *
 * Outcomes:
 *   { status: 'ok', rule, warnings }      — safe to show for confirmation
 *   { status: 'unresolvable', message }   — the description lacks something; ask the user
 *   { status: 'invalid', message }        — the parser's answer was unusable; not the user's fault
 */

const SCOPES = ['brand', 'platform', 'cart']
const TYPES = ['percentage', 'flat']

const invalid = (detail) => ({
  status: 'invalid',
  message: `The rule parser gave an answer we could not use (${detail}). Try rephrasing the rule.`,
})

const unresolvable = (message) => ({ status: 'unresolvable', message })

/**
 * True if `n` is written as a number in `text`.
 * "5,000" and "5000" both match 5000; "150" does not match 15 or 50.
 */
export function numberAppearsInText(n, text) {
  const written = (text.replace(/(\d),(?=\d)/g, '$1').match(/\d+(\.\d+)?/g) ?? []).map(Number)
  return written.includes(n)
}

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * @param {unknown} candidate   what the parser returned
 * @param {string} sourceText   what the user typed
 * @param {{ knownBrands?: string[], knownPlatforms?: string[] }} context
 *        names in the current cart, used only for warnings
 */
export function interpretRuleCandidate(candidate, sourceText, context = {}) {
  if (!candidate || typeof candidate !== 'object') return invalid('not an object')

  if (candidate.status === 'unresolvable') {
    const detail =
      typeof candidate.message === 'string' && candidate.message.trim() !== ''
        ? candidate.message.trim()
        : 'Say how much the discount is and what it applies to.'
    return unresolvable(`That is not specific enough to make a rule. ${detail}`)
  }
  if (candidate.status !== 'ok') return invalid('unknown status')

  const r = candidate.rule
  if (!r || typeof r !== 'object') return invalid('no rule')

  // ── Shape ──
  if (!SCOPES.includes(r.scope)) return invalid('unknown scope')
  if (!TYPES.includes(r.type)) return invalid('unknown discount type')
  if (typeof r.value !== 'number' || !Number.isFinite(r.value)) return invalid('value is not a number')
  if (r.stackable !== undefined && typeof r.stackable !== 'boolean') return invalid('stackable is not yes/no')

  // ── Business limits ──
  if (r.value <= 0) return unresolvable('The discount has to be more than zero. How much should it be?')
  if (r.type === 'percentage' && r.value > 100) {
    return unresolvable(`A discount cannot be more than 100%, but this reads as ${r.value}%. What should it be?`)
  }

  const appliesTo = typeof r.appliesTo === 'string' ? r.appliesTo.trim() : ''
  if (r.scope !== 'cart' && appliesTo === '') {
    return unresolvable(`Which ${r.scope} should this offer apply to?`)
  }

  let minCartValue
  if (r.scope === 'cart') {
    if (typeof r.minCartValue !== 'number' || !Number.isFinite(r.minCartValue) || r.minCartValue < 0) {
      return unresolvable('A cart offer needs a minimum cart value. From what cart total should it apply?')
    }
    minCartValue = r.minCartValue
  }

  // ── Grounding: the numbers must be the user's, not the model's ──
  // A pricing rule with a guessed value costs real money, so this blocks rather than warns.
  // Trade-off: numbers written as words ("twenty percent") are sent back for digits.
  if (!numberAppearsInText(r.value, sourceText)) {
    return unresolvable(
      'We could not find the discount amount in what you typed. Write it as a number, like "20%" or "Rs.100".'
    )
  }
  if (r.scope === 'cart' && !numberAppearsInText(minCartValue, sourceText)) {
    return unresolvable(
      'We could not find the minimum cart value in what you typed. Write it as a number, like "Rs.5,000".'
    )
  }

  const rule = {
    scope: r.scope,
    appliesTo: r.scope === 'cart' ? '' : appliesTo,
    type: r.type,
    value: r.value,
    stackable: r.stackable === true,
  }
  if (r.scope === 'cart') rule.minCartValue = minCartValue

  return { status: 'ok', rule, warnings: buildWarnings(rule, context) }
}

/**
 * Things the user should see before confirming. They do not block: a rule for
 * a brand that is not in today's cart is still a legitimate rule.
 */
function buildWarnings(rule, { knownBrands = [], knownPlatforms = [] }) {
  if (rule.scope === 'cart') return []
  const warnings = []
  const own = rule.scope === 'brand' ? knownBrands : knownPlatforms
  const other = rule.scope === 'brand' ? knownPlatforms : knownBrands
  const otherScope = rule.scope === 'brand' ? 'platform' : 'brand'

  if (own.length + other.length === 0) return warnings // no cart loaded, nothing to compare

  if (!own.some((n) => sameName(n, rule.appliesTo))) {
    if (other.some((n) => sameName(n, rule.appliesTo))) {
      warnings.push(
        `"${rule.appliesTo}" is a ${otherScope} in the current cart, but this rule treats it as a ${rule.scope}. It will not match any item — discard and rephrase if that is not what you meant.`
      )
    } else {
      warnings.push(
        `No item in the current cart has the ${rule.scope} "${rule.appliesTo}". The rule will be added but will not change this cart.`
      )
    }
  }
  return warnings
}

/**
 * Next free id in the RULE-NN sequence, so a typed rule sits alongside uploaded ones.
 */
export function nextRuleId(rules) {
  const used = rules
    .map((r) => /^RULE-(\d+)$/i.exec(r.ruleId ?? ''))
    .filter(Boolean)
    .map((m) => Number(m[1]))
  const next = (used.length ? Math.max(...used) : 0) + 1
  return `RULE-${String(next).padStart(2, '0')}`
}
