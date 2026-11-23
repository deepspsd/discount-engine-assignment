import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parseCartLines, parsePrice } from './pdfCartParser.js'
import { parseCartPDF, MAX_PDF_BYTES } from './pdfCartInput.js'
import { parseCartCSV, parseRulesCSV } from '../engine/csvParser.js'
import { priceCart } from '../engine/discountEngine.js'

const sampleFile = (name) => new URL(`../../sample-data/${name}`, import.meta.url)

/** A fresh ArrayBuffer each time — pdf.js takes ownership of the one it is given. */
const samplePdf = (name) => {
  const file = readFileSync(sampleFile(name))
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)
}

// Column positions used by the hand-built lines below.
const X = { product: 50, brand: 150, platform: 250, price: 350 }

const header = {
  page: 1,
  words: [
    { x: X.product, text: 'Product' },
    { x: X.brand, text: 'Brand' },
    { x: X.platform, text: 'Platform' },
    { x: X.price, text: 'Base' },
    { x: X.price + 30, text: 'Price' },
  ],
}

/** Builds a line from cells, placing each cell's words from its column start. */
const line = (cells) => ({
  page: 1,
  words: Object.entries(cells).flatMap(([column, text]) =>
    text.split(' ').filter(Boolean).map((word, i) => ({ x: X[column] + i * 40, text: word }))
  ),
})

describe('parseCartPDF — the sample cart from the brief', () => {
  it('reads the same cart as cart.csv', async () => {
    const fromPdf = await parseCartPDF(samplePdf('cart.pdf'), pdfjs)
    const fromCsv = parseCartCSV(readFileSync(sampleFile('cart.csv'), 'utf8'))
    expect(fromPdf.errors).toEqual([])
    expect(fromPdf.data).toEqual(fromCsv.data)
  })

  it('keeps multi-word names whole, even one space apart from the next column', async () => {
    const { data } = await parseCartPDF(samplePdf('cart.pdf'), pdfjs)
    // "Nordic Basics Amazon India" has a single space between brand and platform.
    expect(data[4]).toMatchObject({ product: 'Cutting Board', brand: 'Nordic Basics', platform: 'Amazon India' })
  })

  it('prices to the expected final cart total with the sample rules', async () => {
    const { data } = await parseCartPDF(samplePdf('cart.pdf'), pdfjs)
    const rules = parseRulesCSV(readFileSync(sampleFile('rules.csv'), 'utf8')).data
    const pricing = priceCart(data, rules)
    expect(pricing.subtotal).toBe(5932)
    expect(pricing.finalTotal).toBe(5339)
  })
})

describe('parseCartPDF — malformed rows', () => {
  it('loads the good rows and reports each bad one with its text and reason', async () => {
    const { data, errors } = await parseCartPDF(samplePdf('cart-malformed.pdf'), pdfjs)

    expect(data.map((item) => item.product)).toEqual(['Cushion Cover', 'Wall Shelf', 'Desk Organiser'])
    expect(errors).toHaveLength(3)
    expect(errors[0]).toMatch(/^Row 2 \("Bed Sheet Set Natura Casa Flipkart"\): missing base price — row skipped$/)
    expect(errors[1]).toMatch(/^Row 4 .*: missing brand — row skipped$/)
    expect(errors[2]).toMatch(/^Row 5 .*: base price "TBC" is not a valid amount — row skipped$/)
  })

  it('numbers items by their row in the PDF, so ids still point at the right line', async () => {
    const { data } = await parseCartPDF(samplePdf('cart-malformed.pdf'), pdfjs)
    expect(data.map((item) => item.itemId)).toEqual(['ITEM-01', 'ITEM-03', 'ITEM-06'])
  })

  it('does not treat the Total line as an item', async () => {
    const { data, errors } = await parseCartPDF(samplePdf('cart-malformed.pdf'), pdfjs)
    expect(data.some((item) => /total/i.test(item.product))).toBe(false)
    expect(errors.some((e) => /total/i.test(e))).toBe(false)
  })
})

describe('parseCartPDF — files that are not a usable cart', () => {
  const bytes = (text) => new TextEncoder().encode(text).buffer

  it('rejects an empty file', async () => {
    expect(await parseCartPDF(new ArrayBuffer(0), pdfjs)).toEqual({ data: [], errors: ['The file is empty.'] })
  })

  it('rejects a file that is not a PDF', async () => {
    const { data, errors } = await parseCartPDF(bytes('item_id,product\nITEM-01,Cushion Cover'), pdfjs)
    expect(data).toEqual([])
    expect(errors[0]).toMatch(/not a readable PDF/)
  })

  it('rejects an oversized file before trying to read it', async () => {
    const { data, errors } = await parseCartPDF(new ArrayBuffer(MAX_PDF_BYTES + 1), pdfjs)
    expect(data).toEqual([])
    expect(errors[0]).toMatch(/larger than 5 MB/)
  })
})

describe('parseCartLines', () => {
  it('ignores everything above the header', () => {
    const { data, errors } = parseCartLines([
      { page: 1, words: [{ x: 50, text: 'Order' }, { x: 90, text: '#OP-9921' }] },
      header,
      line({ product: 'Wall Shelf', brand: 'LivSpace Pro', platform: 'Noon', price: 'Rs.599' }),
    ])
    expect(errors).toEqual([])
    expect(data).toEqual([
      { itemId: 'ITEM-01', product: 'Wall Shelf', brand: 'LivSpace Pro', platform: 'Noon', basePrice: 599 },
    ])
  })

  it('explains what is expected when there is no table header', () => {
    const { data, errors } = parseCartLines([
      line({ product: 'Wall Shelf', brand: 'LivSpace Pro', platform: 'Noon', price: 'Rs.599' }),
    ])
    expect(data).toEqual([])
    expect(errors[0]).toMatch(/header row with the columns Product, Brand, Platform and Base Price/)
  })

  it('reports a header with no rows under it', () => {
    const { data, errors } = parseCartLines([header])
    expect(data).toEqual([])
    expect(errors).toEqual(['The cart table has a header but no item rows.'])
  })

  it('skips ruled lines and a header repeated on a later page', () => {
    const { data, errors } = parseCartLines([
      header,
      { page: 1, words: [{ x: 50, text: '----------' }] },
      line({ product: 'Wall Shelf', brand: 'LivSpace Pro', platform: 'Noon', price: 'Rs.599' }),
      { ...header, page: 2 },
      line({ product: 'Vase', brand: 'LivSpace Pro', platform: 'Noon', price: 'Rs.2,499' }),
    ])
    expect(errors).toEqual([])
    expect(data.map((item) => item.itemId)).toEqual(['ITEM-01', 'ITEM-02'])
  })

  it('follows the header when columns are in a different order', () => {
    const reordered = {
      page: 1,
      words: [
        { x: 50, text: 'Brand' },
        { x: 150, text: 'Product' },
        { x: 250, text: 'Base' },
        { x: 280, text: 'Price' },
        { x: 350, text: 'Platform' },
      ],
    }
    const row = {
      page: 1,
      words: [
        { x: 50, text: 'Natura' }, { x: 90, text: 'Casa' },
        { x: 150, text: 'Cushion' }, { x: 195, text: 'Cover' },
        { x: 250, text: 'Rs.1,299' },
        { x: 350, text: 'Amazon' }, { x: 390, text: 'India' },
      ],
    }
    expect(parseCartLines([reordered, row]).data[0]).toMatchObject({
      product: 'Cushion Cover', brand: 'Natura Casa', platform: 'Amazon India', basePrice: 1299,
    })
  })

  it('rejects a zero or negative price', () => {
    const { data, errors } = parseCartLines([
      header,
      line({ product: 'Vase', brand: 'LivSpace Pro', platform: 'Noon', price: 'Rs.0' }),
      line({ product: 'Shelf', brand: 'LivSpace Pro', platform: 'Noon', price: '-599' }),
    ])
    expect(data).toEqual([])
    expect(errors).toHaveLength(2)
  })
})

describe('parsePrice', () => {
  it.each([
    ['Rs.1,299', 1299],
    ['Rs. 1,299', 1299],
    ['Rs 849', 849],
    ['₹2,499', 2499],
    ['INR 599', 599],
    ['449', 449],
    ['Rs.1,29,999', 129999], // Indian digit grouping
    ['Rs.899.50', 899.5],
    ['Rs.499/-', 499],
  ])('%s → %d', (raw, expected) => {
    expect(parsePrice(raw)).toBe(expected)
  })

  it.each(['', 'TBC', 'Rs.', 'Rs.abc', '12 34', 'Rs.0', '-599', 'Rs.1,2,3', 'free'])('%s → null', (raw) => {
    expect(parsePrice(raw)).toBeNull()
  })
})
