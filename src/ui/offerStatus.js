/**
 * offerStatus.js
 *
 * One-word summary of what happened to an item, for the status badge in the
 * cart summary. Derived from a DiscountResult — the engine is not involved.
 *
 *   No offer          no rule matched
 *   Max discount      several offers competed and the best one was applied
 *   Stacked           more than one offer was applied together
 *   Discount applied  a single offer applied
 *
 * When offers both competed and stacked, "Stacked" wins: it describes what
 * the customer actually received.
 */

export const OFFER_STATUS = {
  none:    { label: 'No offer',         color: '#666666', background: '#eeeeee' },
  max:     { label: 'Max discount',     color: '#8a4b00', background: '#fff0d6' },
  stacked: { label: 'Stacked',          color: '#1a3d8f', background: '#e3ebff' },
  applied: { label: 'Discount applied', color: '#1e5c2c', background: '#e2f4e6' },
}

export function offerStatus(result) {
  if (result.appliedRules.length === 0) return OFFER_STATUS.none
  if (result.appliedRules.length > 1) return OFFER_STATUS.stacked
  if (result.skippedRules.length > 0) return OFFER_STATUS.max
  return OFFER_STATUS.applied
}
