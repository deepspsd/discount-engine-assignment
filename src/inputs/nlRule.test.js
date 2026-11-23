import { describe, it, expect } from 'vitest'
import { interpretRuleCandidate, numberAppearsInText, nextRuleId } from './ruleCandidate.js'
import { parseRuleFromText, knownNames } from './nlRuleInput.js'
import { parseRule } from '../../api/_lib/parseRule.js'
import { priceCart } from '../engine/discountEngine.js'

const ok = (rule) => ({ status: 'ok', rule, missing: [], message: '' })

const context = {
  knownBrands: ['Natura Casa', 'LivSpace Pro', 'Nordic Basics'],
  knownPlatforms: ['Amazon India', 'Flipkart', 'Noon'],
}

describe('interpretRuleCandidate — the three examples from the brief', () => {
  it('brand percentage, stackable', () => {
    const text = '20% off for Natura Casa brand, stackable with other offers'
    const out = interpretRuleCandidate(
      ok({ scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 20, stackable: true, minCartValue: null }),
      text,
      context
    )
    expect(out).toEqual({
      status: 'ok',
      rule: { scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 20, stackable: true },
      warnings: [],
    })
  })

  it('platform flat, not stackable', () => {
    const out = interpretRuleCandidate(
      ok({ scope: 'platform', appliesTo: 'Flipkart', type: 'flat', value: 100, stackable: false, minCartValue: null }),
      'Rs.100 flat discount on all Flipkart items',
      context
    )
    expect(out.rule).toEqual({ scope: 'platform', appliesTo: 'Flipkart', type: 'flat', value: 100, stackable: false })
  })

  it('cart percentage with a threshold written with a comma', () => {
    const out = interpretRuleCandidate(
      ok({ scope: 'cart', appliesTo: '', type: 'percentage', value: 10, stackable: false, minCartValue: 5000 }),
      '10% off if cart value is more than Rs.5,000',
      context
    )
    expect(out.rule).toEqual({
      scope: 'cart', appliesTo: '', type: 'percentage', value: 10, stackable: false, minCartValue: 5000,
    })
  })
})

describe('interpretRuleCandidate — ambiguous input', () => {
  const vague = 'Give a discount for big orders'

  it('passes on the parser asking for more detail', () => {
    const out = interpretRuleCandidate(
      { status: 'unresolvable', rule: null, missing: ['value', 'minCartValue'], message: 'How much is the discount, and what cart value counts as a big order?' },
      vague
    )
    expect(out.status).toBe('unresolvable')
    expect(out.message).toMatch(/not specific enough/)
    expect(out.message).toMatch(/How much is the discount/)
  })

  it('still refuses when the parser makes up numbers instead', () => {
    const out = interpretRuleCandidate(
      ok({ scope: 'cart', appliesTo: '', type: 'percentage', value: 10, stackable: false, minCartValue: 5000 }),
      vague
    )
    expect(out.status).toBe('unresolvable')
    expect(out.message).toMatch(/could not find the discount amount/)
  })

  it('refuses a made-up cart threshold even when the value is real', () => {
    const out = interpretRuleCandidate(
      ok({ scope: 'cart', appliesTo: '', type: 'percentage', value: 10, stackable: false, minCartValue: 5000 }),
      '10% off for big orders'
    )
    expect(out.status).toBe('unresolvable')
    expect(out.message).toMatch(/minimum cart value/)
  })
})

describe('interpretRuleCandidate — invalid parser output never reaches the engine', () => {
  const text = '20% off Natura Casa'
  const base = { scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 20, stackable: false, minCartValue: null }

  it.each([
    ['null', null],
    ['a string', 'scope: brand'],
    ['unknown status', { status: 'maybe', rule: base }],
    ['ok without a rule', { status: 'ok', rule: null }],
    ['unknown scope', ok({ ...base, scope: 'category' })],
    ['unknown type', ok({ ...base, type: 'bogo' })],
    ['value as text', ok({ ...base, value: '20' })],
    ['value NaN', ok({ ...base, value: NaN })],
    ['stackable as text', ok({ ...base, stackable: 'yes' })],
  ])('%s → invalid', (_label, candidate) => {
    expect(interpretRuleCandidate(candidate, text).status).toBe('invalid')
  })

  it.each([
    ['zero value', ok({ ...base, value: 0 }), '0% off Natura Casa'],
    ['negative value', ok({ ...base, value: -20 }), text],
    ['percentage over 100', ok({ ...base, value: 150 }), '150% off Natura Casa'],
    ['brand rule with no brand', ok({ ...base, appliesTo: '  ' }), '20% off'],
    ['cart rule with no threshold', ok({ ...base, scope: 'cart', appliesTo: '', minCartValue: null }), '20% off the cart'],
    ['cart rule with negative threshold', ok({ ...base, scope: 'cart', appliesTo: '', minCartValue: -1 }), '20% off the cart'],
  ])('%s → asks the user', (_label, candidate, source) => {
    expect(interpretRuleCandidate(candidate, source).status).toBe('unresolvable')
  })

  it('drops fields the engine does not know and defaults stackable to false', () => {
    const { stackable, ...withoutStackable } = base
    const out = interpretRuleCandidate(ok({ ...withoutStackable, ruleId: 'HACK', extra: 1 }), text)
    expect(out.rule).toEqual({ scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 20, stackable: false })
  })
})

describe('interpretRuleCandidate — warnings on the confirmation step', () => {
  it('warns when the name is in the cart under the other scope', () => {
    const out = interpretRuleCandidate(
      ok({ scope: 'brand', appliesTo: 'Flipkart', type: 'flat', value: 100, stackable: false, minCartValue: null }),
      'Rs.100 off Flipkart',
      context
    )
    expect(out.status).toBe('ok')
    expect(out.warnings[0]).toMatch(/is a platform in the current cart/)
  })

  it('warns when nothing in the cart matches', () => {
    const out = interpretRuleCandidate(
      ok({ scope: 'brand', appliesTo: 'Ikea', type: 'percentage', value: 5, stackable: false, minCartValue: null }),
      '5% off Ikea',
      context
    )
    expect(out.warnings[0]).toMatch(/will not change this cart/)
  })

  it('matches names case-insensitively and stays quiet with no cart loaded', () => {
    const candidate = ok({ scope: 'brand', appliesTo: 'natura casa', type: 'percentage', value: 5, stackable: false, minCartValue: null })
    expect(interpretRuleCandidate(candidate, '5% off natura casa', context).warnings).toEqual([])
    expect(interpretRuleCandidate(candidate, '5% off natura casa', {}).warnings).toEqual([])
  })
})

describe('helpers', () => {
  it('numberAppearsInText matches whole numbers only', () => {
    expect(numberAppearsInText(5000, 'above Rs.5,000')).toBe(true)
    expect(numberAppearsInText(5000, 'above Rs.5000')).toBe(true)
    expect(numberAppearsInText(15, 'Rs.150 off')).toBe(false)
    expect(numberAppearsInText(12.5, '12.5% off')).toBe(true)
    expect(numberAppearsInText(20, 'twenty percent off')).toBe(false)
  })

  it('nextRuleId continues the RULE-NN sequence', () => {
    expect(nextRuleId([])).toBe('RULE-01')
    expect(nextRuleId([{ ruleId: 'RULE-01' }, { ruleId: 'RULE-04' }])).toBe('RULE-05')
    expect(nextRuleId([{ ruleId: 'PROMO-A' }])).toBe('RULE-01')
  })

  it('knownNames collects brands and platforms from cart and rules', () => {
    const names = knownNames(
      [{ brand: 'Natura Casa', platform: 'Flipkart' }, { brand: 'Natura Casa', platform: 'Noon' }],
      [{ scope: 'platform', appliesTo: 'Amazon India' }, { scope: 'cart', appliesTo: '' }]
    )
    expect(names).toEqual({ knownBrands: ['Natura Casa'], knownPlatforms: ['Flipkart', 'Noon', 'Amazon India'] })
  })
})

describe('parseRuleFromText — client side, never throws', () => {
  const respond = (status, body) => async () => ({ ok: status < 400, status, json: async () => body })

  it('does not call the server for empty text', async () => {
    let called = false
    const out = await parseRuleFromText('   ', {}, async () => { called = true })
    expect(out.status).toBe('error')
    expect(called).toBe(false)
  })

  it('returns a validated rule on success', async () => {
    const candidate = ok({ scope: 'platform', appliesTo: 'Flipkart', type: 'flat', value: 100, stackable: false, minCartValue: null })
    const out = await parseRuleFromText('Rs.100 flat discount on all Flipkart items', context, respond(200, { candidate }))
    expect(out.status).toBe('ok')
    expect(out.rule.appliesTo).toBe('Flipkart')
  })

  it('reports a network failure', async () => {
    const out = await parseRuleFromText('10% off Noon', {}, async () => { throw new TypeError('Failed to fetch') })
    expect(out).toMatchObject({ status: 'error' })
  })

  it('shows the server message on an error status', async () => {
    const out = await parseRuleFromText('10% off Noon', {}, respond(429, { error: 'llm_rate_limited', message: 'Busy. Try again.' }))
    expect(out).toEqual({ status: 'error', message: 'Busy. Try again.' })
  })

  it('survives a non-JSON response body', async () => {
    const out = await parseRuleFromText('10% off Noon', {}, async () => ({
      ok: false, status: 500, json: async () => { throw new SyntaxError('Unexpected token <') },
    }))
    expect(out.status).toBe('error')
  })

  it('treats a 200 with a broken candidate as invalid', async () => {
    const out = await parseRuleFromText('10% off Noon', {}, respond(200, { candidate: { status: 'ok', rule: { scope: 'shop' } } }))
    expect(out.status).toBe('invalid')
  })
})

describe('parseRule — server side', () => {
  const env = { GROQ_API_KEY: 'test-key' }
  const groqReply = (content) => async () => ({
    ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }),
  })

  it('rejects empty and oversized text without calling the LLM', async () => {
    const never = async () => { throw new Error('should not be called') }
    expect((await parseRule({ text: '' }, env, never)).status).toBe(400)
    expect((await parseRule({ text: 'x'.repeat(301) }, env, never)).status).toBe(400)
    expect((await parseRule({}, env, never)).status).toBe(400)
  })

  it('fails clearly when the key is not configured', async () => {
    const out = await parseRule({ text: '10% off Noon' }, {}, async () => { throw new Error('should not be called') })
    expect(out.status).toBe(500)
    expect(out.body.error).toBe('not_configured')
  })

  it('returns the model JSON as an unvalidated candidate', async () => {
    const candidate = ok({ scope: 'platform', appliesTo: 'Noon', type: 'percentage', value: 10, stackable: false, minCartValue: null })
    const out = await parseRule({ text: '10% off Noon' }, env, groqReply(JSON.stringify(candidate)))
    expect(out).toEqual({ status: 200, body: { candidate } })
  })

  it('sends the key in the header and the text as data, not in the system prompt', async () => {
    let sent
    await parseRule({ text: '10% off Noon', knownPlatforms: ['Noon'] }, env, async (_url, init) => {
      sent = init
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{}' } }] }) }
    })
    const body = JSON.parse(sent.body)
    expect(sent.headers.Authorization).toBe('Bearer test-key')
    expect(body.messages[0].content).not.toContain('10% off Noon')
    expect(body.messages[1].content).toContain('10% off Noon')
    expect(body.messages[1].content).toContain('Known platforms: Noon')
  })

  it('maps non-JSON model output to 502', async () => {
    const out = await parseRule({ text: '10% off Noon' }, env, groqReply('Sure! Here is your rule:'))
    expect(out.status).toBe(502)
    expect(out.body.error).toBe('llm_bad_output')
  })

  it('maps provider errors without leaking their body', async () => {
    const limited = await parseRule({ text: '10% off Noon' }, env, async () => ({ ok: false, status: 429, text: async () => '' }))
    expect(limited.status).toBe(429)
    const down = await parseRule({ text: '10% off Noon' }, env, async () => ({ ok: false, status: 500, text: async () => '' }))
    expect(down.status).toBe(502)
    const offline = await parseRule({ text: '10% off Noon' }, env, async () => { throw new TypeError('fetch failed') })
    expect(offline.status).toBe(504)
  })
})

describe('a confirmed rule flows into the engine unchanged', () => {
  it('re-prices the cart with the new rule included', () => {
    const cart = [{ itemId: 'ITEM-02', product: 'Bed Sheet Set', brand: 'Natura Casa', platform: 'Flipkart', basePrice: 849 }]
    const rules = [{ ruleId: 'RULE-02', scope: 'brand', appliesTo: 'Natura Casa', type: 'flat', value: 150, stackable: false }]
    const { rule } = interpretRuleCandidate(
      ok({ scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 20, stackable: true, minCartValue: null }),
      '20% off for Natura Casa brand, stackable with other offers'
    )
    const next = [...rules, { ruleId: nextRuleId(rules), ...rule }]
    const [item] = priceCart(cart, next).items
    expect(item.appliedRules).toEqual(['RULE-02', 'RULE-03'])
    expect(item.finalPrice).toBe(559) // (849 − 150) − 20%
    expect(item.reasoning).toBe('Brand offer: Rs.150 off + Brand offer: 20% off')
  })
})
