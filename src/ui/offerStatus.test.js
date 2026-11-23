import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { offerStatus } from './offerStatus.js'
import { parseRulesCSV, parseCartCSV } from '../engine/csvParser.js'
import { priceCart } from '../engine/discountEngine.js'

const sample = (name) => readFileSync(new URL(`../../sample-data/${name}`, import.meta.url), 'utf8')

describe('offerStatus', () => {
  it('matches the Status column in the assignment brief for the sample cart', () => {
    const { items } = priceCart(parseCartCSV(sample('cart.csv')).data, parseRulesCSV(sample('rules.csv')).data)
    expect(Object.fromEntries(items.map((r) => [r.itemId, offerStatus(r).label]))).toEqual({
      'ITEM-01': 'Max discount',
      'ITEM-02': 'Stacked',
      'ITEM-03': 'Discount applied',
      'ITEM-04': 'No offer',
      'ITEM-05': 'Discount applied',
      'ITEM-06': 'Discount applied',
    })
  })

  it('reports Stacked when offers both competed and stacked', () => {
    expect(offerStatus({ appliedRules: ['A', 'B'], skippedRules: ['C'] }).label).toBe('Stacked')
  })
})
