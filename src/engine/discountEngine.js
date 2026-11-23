/**
 * discountEngine.js
 *
 * Pure discount calculation logic. No UI, no side effects.
 * All functions take plain objects and return plain objects.
 *
 * Data shapes:
 *
 * DiscountRule {
 *   ruleId:    string       — e.g. "RULE-01"
 *   scope:     "brand" | "platform" | "cart"
 *   appliesTo: string       — e.g. "Natura Casa", "Amazon India" ("" for cart scope)
 *   type:      "percentage" | "flat"
 *   value:     number       — percentage as integer (15 = 15%), flat in rupees
 *   stackable: boolean
 *   minCartValue?: number   — cart scope only: threshold the items total must meet
 * }
 *
 * CartOfferLine {
 *   ruleId:    string
 *   discount:  number       — rupees saved by this cart rule
 *   label:     string       — customer-readable, e.g. "Cart offer: 10% off — Rs.593 saved"
 *   condition: string       — why it triggered, e.g. "Cart total Rs.5,932 ≥ Rs.4,000"
 * }
 *
 * CartOfferResult {
 *   subtotal:      number   — sum of final item prices, before any cart offer
 *   finalTotal:    number   — what the customer pays
 *   totalDiscount: number   — rupees saved by cart offers
 *   lines:         CartOfferLine[]  — empty when no cart offer triggered
 *   appliedRules:  string[]
 *   skippedRules:  string[] — eligible cart rules that lost to a better one
 *   lockedOffer:   { ruleId, shortfall, hint } | null
 *                           — closest cart rule the total did not reach; only set
 *                             when no cart offer applied
 * }
 *
 * CartPricing {
 *   items:      DiscountResult[]
 *   subtotal:   number
 *   cartOffer:  CartOfferResult
 *   finalTotal: number
 * }
 *
 * CartItem {
 *   itemId:    string       — e.g. "ITEM-01"
 *   product:   string
 *   brand:     string
 *   platform:  string
 *   basePrice: number       — in rupees
 * }
 *
 * DiscountResult {
 *   itemId:        string
 *   product:       string
 *   brand:         string
 *   platform:      string
 *   basePrice:     number
 *   finalPrice:    number
 *   totalDiscount: number
 *   appliedRules:  string[]
 *   skippedRules:  string[]
 *   reasoning:     string   — customer-readable explanation
 * }
 */

/**
 * Returns true if the rule applies to this cart item.
 */
export function ruleMatchesItem(item, rule) {
  const normalise = (s) => s.trim().toLowerCase()
  if (rule.scope === 'brand') {
    return normalise(item.brand) === normalise(rule.appliesTo)
  }
  if (rule.scope === 'platform') {
    return normalise(item.platform) === normalise(rule.appliesTo)
  }
  return false
}

/**
 * Calculates the rupee discount a rule gives on a given price.
 * Uses the provided price, not the original base price — important for stacking.
 */
export function calculateDiscountAmount(price, rule) {
  if (rule.type === 'percentage') {
    return Math.round(price * rule.value / 100)
  }
  if (rule.type === 'flat') {
    // A flat offer can never take off more than the price it is applied to.
    return Math.min(rule.value, price)
  }
  return 0
}

/**
 * Builds the customer-facing reasoning string for an applied rule.
 */
function ruleToReasoning(rule) {
  const scopeLabel = rule.scope === 'brand' ? 'Brand' : 'Platform'
  if (rule.type === 'percentage') {
    return `${scopeLabel} offer: ${rule.value}% off`
  }
  if (rule.type === 'flat') {
    return `${scopeLabel} offer: Rs.${rule.value} off`
  }
  return `${scopeLabel} offer applied`
}

/**
 * Applies the active discount rules to a single cart item.
 * Returns a DiscountResult.
 *
 * Logic:
 *   1. Find all rules that match this item.
 *   2. Among non-stackable rules, pick the one giving the largest discount.
 *   3. Apply any stackable rules on top of that price.
 *   4. Build the reasoning string from what was applied.
 */
export function applyDiscounts(item, rules) {
  const matchingRules = rules.filter((r) => ruleMatchesItem(item, r))

  // No rules match — return base price with explanation
  if (matchingRules.length === 0) {
    return {
      itemId: item.itemId,
      product: item.product,
      brand: item.brand,
      platform: item.platform,
      basePrice: item.basePrice,
      finalPrice: item.basePrice,
      totalDiscount: 0,
      appliedRules: [],
      skippedRules: [],
      reasoning: 'No offers available',
    }
  }

  const nonStackable = matchingRules.filter((r) => !r.stackable)
  const stackable = matchingRules.filter((r) => r.stackable)

  // Pick the non-stackable rule that gives the largest saving
  let winner = null
  let skipped = []

  if (nonStackable.length > 0) {
    const sorted = [...nonStackable].sort(
      (a, b) =>
        calculateDiscountAmount(item.basePrice, b) -
        calculateDiscountAmount(item.basePrice, a)
    )
    winner = sorted[0]
    skipped = sorted.slice(1)
  }

  // Apply winner first, then stack on top
  let price = item.basePrice
  const appliedRules = []
  const reasoningParts = []

  if (winner) {
    price -= calculateDiscountAmount(price, winner)
    appliedRules.push(winner.ruleId)
    reasoningParts.push(ruleToReasoning(winner))
  }

  for (const rule of stackable) {
    price -= calculateDiscountAmount(price, rule)
    appliedRules.push(rule.ruleId)
    reasoningParts.push(ruleToReasoning(rule))
  }

  const finalPrice = Math.round(price)

  return {
    itemId: item.itemId,
    product: item.product,
    brand: item.brand,
    platform: item.platform,
    basePrice: item.basePrice,
    finalPrice,
    totalDiscount: item.basePrice - finalPrice,
    appliedRules,
    skippedRules: skipped.map((r) => r.ruleId),
    reasoning: reasoningParts.join(' + '),
  }
}

/**
 * Runs applyDiscounts across every item in the cart.
 * Returns an array of DiscountResult objects.
 */
export function processCart(cartItems, rules) {
  return cartItems.map((item) => applyDiscounts(item, rules))
}

/**
 * Sums the final prices across all results.
 */
export function cartTotal(results) {
  return results.reduce((sum, r) => sum + r.finalPrice, 0)
}

// ── Cart-level offers ────────────────────────────────────────────

const rupees = (n) => `Rs.${n.toLocaleString('en-IN')}`

const cartOfferName = (rule) =>
  rule.type === 'percentage' ? `${rule.value}% off` : `${rupees(rule.value)} off`

/**
 * Returns true if a cart rule's condition is met by the items total.
 * The threshold is inclusive: a total exactly equal to minCartValue qualifies.
 * A cart rule without a numeric threshold never qualifies — input layers are
 * expected to reject it before it gets here.
 */
export function cartRuleIsEligible(itemsTotal, rule) {
  return (
    rule.scope === 'cart' &&
    Number.isFinite(rule.minCartValue) &&
    itemsTotal >= rule.minCartValue
  )
}

/**
 * Applies cart-level rules to the sum of final item prices.
 * Returns a CartOfferResult.
 *
 * Runs after item-level discounts and mirrors their selection logic:
 *   1. Keep the cart rules whose threshold the items total meets.
 *   2. Among non-stackable ones, pick the largest saving in rupees.
 *   3. Apply stackable ones on top of that.
 * Each applied rule becomes its own line, so the UI can show it separately
 * from the per-item offers.
 */
export function applyCartOffer(itemsTotal, rules) {
  const cartRules = rules.filter((r) => r.scope === 'cart')
  const eligible = cartRules.filter((r) => cartRuleIsEligible(itemsTotal, r))

  const nonStackable = eligible.filter((r) => !r.stackable)
  const stackable = eligible.filter((r) => r.stackable)

  const sorted = [...nonStackable].sort(
    (a, b) =>
      calculateDiscountAmount(itemsTotal, b) -
      calculateDiscountAmount(itemsTotal, a)
  )
  const winner = sorted[0] ?? null
  const skipped = sorted.slice(1)

  let total = itemsTotal
  const lines = []

  for (const rule of winner ? [winner, ...stackable] : stackable) {
    const discount = calculateDiscountAmount(total, rule)
    if (discount <= 0) continue // nothing to show the customer
    total -= discount
    lines.push({
      ruleId: rule.ruleId,
      discount,
      label: `Cart offer: ${cartOfferName(rule)} — ${rupees(discount)} saved`,
      condition: `Cart total ${rupees(itemsTotal)} ≥ ${rupees(rule.minCartValue)}`,
    })
  }

  // If nothing applied, surface the closest offer the customer missed.
  let lockedOffer = null
  if (lines.length === 0) {
    const locked = cartRules
      .filter((r) => Number.isFinite(r.minCartValue) && itemsTotal < r.minCartValue)
      .sort((a, b) => a.minCartValue - b.minCartValue)[0]
    if (locked) {
      const shortfall = locked.minCartValue - itemsTotal
      lockedOffer = {
        ruleId: locked.ruleId,
        shortfall,
        hint: `Add ${rupees(shortfall)} more to unlock ${cartOfferName(locked)} your cart`,
      }
    }
  }

  return {
    subtotal: itemsTotal,
    finalTotal: total,
    totalDiscount: itemsTotal - total,
    lines,
    appliedRules: lines.map((l) => l.ruleId),
    skippedRules: skipped.map((r) => r.ruleId),
    lockedOffer,
  }
}

/**
 * Prices a whole cart: item-level discounts first, then cart-level offers on
 * the resulting total. This is the single entry point the UI should call —
 * every input mode (CSV, PDF, natural language) ends up here.
 * Returns a CartPricing.
 */
export function priceCart(cartItems, rules) {
  const items = processCart(cartItems, rules)
  const subtotal = cartTotal(items)
  const cartOffer = applyCartOffer(subtotal, rules)
  return { items, subtotal, cartOffer, finalTotal: cartOffer.finalTotal }
}
