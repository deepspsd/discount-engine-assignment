import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { applyCartOffer, applyDiscounts, priceCart } from './discountEngine.js'
import { parseRulesCSV, parseCartCSV } from './csvParser.js'

const sample = (name) =>
  readFileSync(new URL(`../../sample-data/${name}`, import.meta.url), 'utf8')

const cartRule = (overrides = {}) => ({
  ruleId: 'CART-10',
  scope: 'cart',
  appliesTo: '',
  type: 'percentage',
  value: 10,
  stackable: false,
  minCartValue: 4000,
  ...overrides,
})

describe('sample data — expected results from the assignment brief', () => {
  const rules = parseRulesCSV(sample('rules.csv'))
  const cart = parseCartCSV(sample('cart.csv'))
  const pricing = priceCart(cart.data, rules.data)

  it('parses both sample files without errors', () => {
    expect(rules.errors).toEqual([])
    expect(cart.errors).toEqual([])
    expect(rules.data).toHaveLength(4)
    expect(cart.data).toHaveLength(6)
  })

  it('prices every item as the brief expects', () => {
    const prices = Object.fromEntries(pricing.items.map((r) => [r.itemId, r.finalPrice]))
    expect(prices).toEqual({
      'ITEM-01': 1104,
      'ITEM-02': 629,
      'ITEM-03': 509,
      'ITEM-04': 2499,
      'ITEM-05': 382,
      'ITEM-06': 809,
    })
  })

  it('keeps cart rules out of the per-item reasoning', () => {
    for (const item of pricing.items) {
      expect(item.appliedRules).not.toContain('RULE-04')
      expect(item.reasoning).not.toMatch(/cart/i)
    }
    expect(pricing.items.find((r) => r.itemId === 'ITEM-04').reasoning).toBe('No offers available')
  })

  it('applies RULE-04 to the cart total as a separate line', () => {
    expect(pricing.subtotal).toBe(5932)
    expect(pricing.cartOffer.lines).toEqual([
      {
        ruleId: 'RULE-04',
        discount: 593,
        label: 'Cart offer: 10% off — Rs.593 saved',
        condition: 'Cart total Rs.5,932 ≥ Rs.4,000',
      },
    ])
    expect(pricing.finalTotal).toBe(5339)
  })
})

describe('applyCartOffer — threshold', () => {
  it('does not apply one rupee below the threshold, and says how far off it is', () => {
    const offer = applyCartOffer(3999, [cartRule()])
    expect(offer.lines).toEqual([])
    expect(offer.finalTotal).toBe(3999)
    expect(offer.totalDiscount).toBe(0)
    expect(offer.lockedOffer).toMatchObject({ ruleId: 'CART-10', shortfall: 1 })
  })

  it('applies when the total exactly equals the threshold', () => {
    const offer = applyCartOffer(4000, [cartRule()])
    expect(offer.finalTotal).toBe(3600)
    expect(offer.lockedOffer).toBeNull()
  })

  it('checks the threshold against discounted item prices, not base prices', () => {
    // Base price 4,200 clears the threshold; the 15% item offer brings it to 3,570, which does not.
    const item = { itemId: 'I1', product: 'Sofa', brand: 'B', platform: 'Amazon India', basePrice: 4200 }
    const platformRule = {
      ruleId: 'P15', scope: 'platform', appliesTo: 'Amazon India',
      type: 'percentage', value: 15, stackable: false,
    }
    const pricing = priceCart([item], [platformRule, cartRule()])
    expect(pricing.subtotal).toBe(3570)
    expect(pricing.cartOffer.lines).toEqual([])
    expect(pricing.finalTotal).toBe(3570)
  })

  it('ignores a cart rule that has no usable threshold', () => {
    const offer = applyCartOffer(9000, [cartRule({ minCartValue: undefined })])
    expect(offer.lines).toEqual([])
    expect(offer.finalTotal).toBe(9000)
  })
})

describe('applyCartOffer — several cart rules', () => {
  it('picks the non-stackable rule with the largest rupee saving', () => {
    const offer = applyCartOffer(6000, [
      cartRule({ ruleId: 'CART-10' }),
      cartRule({ ruleId: 'CART-FLAT', type: 'flat', value: 800, minCartValue: 5000 }),
    ])
    expect(offer.appliedRules).toEqual(['CART-FLAT'])
    expect(offer.skippedRules).toEqual(['CART-10'])
    expect(offer.finalTotal).toBe(5200)
  })

  it('applies a stackable cart rule on top of the winner, as its own line', () => {
    const offer = applyCartOffer(5000, [
      cartRule({ ruleId: 'CART-10' }),
      cartRule({ ruleId: 'CART-EXTRA', value: 5, stackable: true, minCartValue: 1000 }),
    ])
    expect(offer.lines.map((l) => [l.ruleId, l.discount])).toEqual([
      ['CART-10', 500],
      ['CART-EXTRA', 225], // 5% of the 4,500 left after the winner
    ])
    expect(offer.finalTotal).toBe(4275)
  })

  it('only counts rules whose threshold is met', () => {
    const offer = applyCartOffer(4500, [
      cartRule({ ruleId: 'CART-10' }),
      cartRule({ ruleId: 'CART-20', value: 20, minCartValue: 8000 }),
    ])
    expect(offer.appliedRules).toEqual(['CART-10'])
    expect(offer.skippedRules).toEqual([])
    expect(offer.lockedOffer).toBeNull() // an offer applied, so no nudge
  })

  it('returns the total untouched when there are no cart rules', () => {
    const offer = applyCartOffer(5932, [])
    expect(offer).toMatchObject({ lines: [], finalTotal: 5932, totalDiscount: 0, lockedOffer: null })
  })
})

describe('flat discounts never push a price below zero', () => {
  it('caps an item-level flat offer at the item price', () => {
    const item = { itemId: 'I1', product: 'Coaster', brand: 'Natura Casa', platform: 'Noon', basePrice: 100 }
    const rule = {
      ruleId: 'B150', scope: 'brand', appliesTo: 'Natura Casa',
      type: 'flat', value: 150, stackable: false,
    }
    const result = applyDiscounts(item, [rule])
    expect(result.finalPrice).toBe(0)
    expect(result.totalDiscount).toBe(100)
  })

  it('caps a cart-level flat offer at the cart total', () => {
    const offer = applyCartOffer(300, [cartRule({ type: 'flat', value: 500, minCartValue: 200 })])
    expect(offer.finalTotal).toBe(0)
    expect(offer.lines[0].discount).toBe(300)
  })
})

describe('parseRulesCSV — cart rules', () => {
  const header = 'rule_id,scope,applies_to,type,value,stackable,min_cart_value\n'

  it('reads a cart rule with an empty applies_to', () => {
    const { data, errors } = parseRulesCSV(header + 'RULE-04,cart,,percentage,10,false,4000')
    expect(errors).toEqual([])
    expect(data[0]).toMatchObject({ scope: 'cart', appliesTo: '', minCartValue: 4000 })
  })

  it('rejects a cart rule with no threshold instead of guessing one', () => {
    const { data, errors } = parseRulesCSV(header + 'RULE-04,cart,,percentage,10,false,')
    expect(data).toEqual([])
    expect(errors[0]).toMatch(/Row 2: a cart rule needs min_cart_value/)
  })

  it('rejects a non-numeric threshold', () => {
    const { data, errors } = parseRulesCSV(header + 'RULE-04,cart,,percentage,10,false,lots')
    expect(data).toEqual([])
    expect(errors).toHaveLength(1)
  })

  it('still requires applies_to for brand and platform rules', () => {
    const { data, errors } = parseRulesCSV(header + 'RULE-09,brand,,flat,50,false,')
    expect(data).toEqual([])
    expect(errors[0]).toMatch(/missing fields — applies_to/)
  })

  it('still accepts the original six-column file', () => {
    const { data, errors } = parseRulesCSV(
      'rule_id,scope,applies_to,type,value,stackable\nRULE-01,platform,Amazon India,percentage,15,false'
    )
    expect(errors).toEqual([])
    expect(data[0]).not.toHaveProperty('minCartValue')
  })

  it('rejects a percentage above 100', () => {
    const { data, errors } = parseRulesCSV(header + 'RULE-09,platform,Noon,percentage,150,false,')
    expect(data).toEqual([])
    expect(errors[0]).toMatch(/cannot exceed 100/)
  })
})
