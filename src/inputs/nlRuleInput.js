/**
 * nlRuleInput.js
 *
 * Input mode: plain-English text → DiscountRule.
 * Calls the server-side parser, then runs its answer through the shared
 * candidate gate. Knows nothing about the discount engine beyond the rule shape.
 *
 * Always resolves — never throws — to one of:
 *   { status: 'ok', rule, warnings }
 *   { status: 'unresolvable', message }   description needs more detail
 *   { status: 'invalid', message }        parser answered with something unusable
 *   { status: 'error', message }          network / server problem
 */

import { interpretRuleCandidate } from './ruleCandidate.js'

export const MAX_RULE_TEXT_LENGTH = 300

const unique = (values) => [...new Set(values.filter(Boolean))]

/**
 * Brand and platform names the app already knows about. Sent to the parser so
 * it can tell "Flipkart" (platform) from "Natura Casa" (brand), and used for
 * the confirmation warnings.
 */
export function knownNames(cartItems, rules) {
  return {
    knownBrands: unique([
      ...cartItems.map((i) => i.brand),
      ...rules.filter((r) => r.scope === 'brand').map((r) => r.appliesTo),
    ]),
    knownPlatforms: unique([
      ...cartItems.map((i) => i.platform),
      ...rules.filter((r) => r.scope === 'platform').map((r) => r.appliesTo),
    ]),
  }
}

export async function parseRuleFromText(text, context = {}, fetchImpl = fetch) {
  const trimmed = text.trim()
  if (trimmed === '') {
    return { status: 'error', message: 'Describe the discount rule first.' }
  }
  if (trimmed.length > MAX_RULE_TEXT_LENGTH) {
    return { status: 'error', message: `Keep the description under ${MAX_RULE_TEXT_LENGTH} characters.` }
  }

  let response
  try {
    response = await fetchImpl('/api/parse-rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: trimmed,
        knownBrands: context.knownBrands ?? [],
        knownPlatforms: context.knownPlatforms ?? [],
      }),
    })
  } catch {
    return { status: 'error', message: 'Could not reach the rule parser. Check your connection and try again.' }
  }

  let body
  try {
    body = await response.json()
  } catch {
    return { status: 'error', message: 'The rule parser is unavailable right now. Try again.' }
  }

  if (!response.ok) {
    return {
      status: 'error',
      message: typeof body?.message === 'string' ? body.message : 'The rule parser failed. Try again.',
    }
  }

  return interpretRuleCandidate(body?.candidate, trimmed, context)
}
