/**
 * pdfCartParser.js
 *
 * Turns the positioned lines of a cart PDF into CartItem objects.
 * Pure — takes the output of pdfText.js, returns { data, errors } in the same
 * shape as parseCartCSV, so the app treats both inputs identically.
 *
 * Expected table: a header row naming Product, Brand, Platform and Base Price,
 * followed by one row per item. Anything above the header (order number,
 * date) is ignored.
 *
 * Cells are assigned to columns by horizontal position, not by splitting on
 * whitespace. Names contain spaces ("Natura Casa", "Amazon India") and in the
 * sample layout "Nordic Basics" is one space away from "Amazon India", so
 * whitespace alone cannot tell where one column ends.
 *
 * Assumption: cells are left-aligned under their header, as in the sample.
 */

const COLUMNS = ['product', 'brand', 'platform', 'basePrice']

const LABELS = { product: 'product', brand: 'brand', platform: 'platform', basePrice: 'base price' }

// A word this many points left of a column's start still belongs to it.
const COLUMN_TOLERANCE = 3

const lineText = (line) => line.words.map((w) => w.text).join(' ')

/**
 * If the line is the table header, returns each column's start position.
 */
function readHeader(line) {
  const find = (name) => line.words.find((w) => w.text.toLowerCase() === name)
  const product = find('product')
  const brand = find('brand')
  const platform = find('platform')
  const price = find('base') ?? find('price')
  if (!product || !brand || !platform || !price) return null

  return [
    { key: 'product', x: product.x },
    { key: 'brand', x: brand.x },
    { key: 'platform', x: platform.x },
    { key: 'basePrice', x: price.x },
  ].sort((a, b) => a.x - b.x)
}

/** Groups a row's words into cells using the header's column positions. */
function readCells(line, columns) {
  const cells = Object.fromEntries(COLUMNS.map((key) => [key, []]))
  for (const word of line.words) {
    let column = columns[0]
    for (const candidate of columns) {
      if (candidate.x <= word.x + COLUMN_TOLERANCE) column = candidate
    }
    cells[column.key].push(word.text)
  }
  return Object.fromEntries(Object.entries(cells).map(([key, words]) => [key, words.join(' ')]))
}

/**
 * "Rs.1,299" | "₹1299" | "INR 1,299.00" | "1299" → 1299. Anything else → null.
 */
export function parsePrice(raw) {
  const cleaned = raw.replace(/^(rs\.?|inr|₹)\s*/i, '').replace(/\/-$/, '').trim()
  if (!/^\d{1,3}(,\d{2,3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(cleaned)) return null
  const value = Number(cleaned.replace(/,/g, ''))
  return Number.isFinite(value) && value > 0 ? value : null
}

const isSeparator = (text) => !/[a-z0-9]/i.test(text)
const isTotalsLine = (text) => /^(sub\s*-?\s*total|grand\s+total|total)\b/i.test(text)

export function parseCartLines(lines) {
  const headerIndex = lines.findIndex((line) => readHeader(line) !== null)
  if (headerIndex === -1) {
    return {
      data: [],
      errors: [
        'Could not find the cart table. The PDF needs a header row with the columns Product, Brand, Platform and Base Price.',
      ],
    }
  }

  const columns = readHeader(lines[headerIndex])
  const data = []
  const errors = []
  let rowNum = 0

  for (const line of lines.slice(headerIndex + 1)) {
    const text = lineText(line)
    if (isSeparator(text)) continue // ruled line under the header
    if (readHeader(line)) continue // header repeated on a later page
    if (isTotalsLine(text)) continue // a summary line, not an item

    rowNum++
    const cells = readCells(line, columns)
    const where = `Row ${rowNum} ("${text}")`

    const missing = COLUMNS.filter((key) => cells[key] === '').map((key) => LABELS[key])
    if (missing.length > 0) {
      errors.push(`${where}: missing ${missing.join(', ')} — row skipped`)
      continue
    }

    const price = parsePrice(cells.basePrice)
    if (price === null) {
      errors.push(`${where}: base price "${cells.basePrice}" is not a valid amount — row skipped`)
      continue
    }

    data.push({
      // The PDF carries no item ids, so they are numbered by position in the table.
      itemId: `ITEM-${String(rowNum).padStart(2, '0')}`,
      product: cells.product,
      brand: cells.brand,
      platform: cells.platform,
      basePrice: Math.round(price),
    })
  }

  if (rowNum === 0) {
    errors.push('The cart table has a header but no item rows.')
  }

  return { data, errors }
}
