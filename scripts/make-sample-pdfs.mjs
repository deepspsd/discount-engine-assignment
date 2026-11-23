/**
 * make-sample-pdfs.mjs
 *
 * Writes the sample cart PDFs in sample-data/. Run with: npm run sample-pdfs
 *
 *   cart.pdf            the cart from the assignment brief, in its layout
 *   cart-malformed.pdf  the same cart with broken rows, for trying error handling
 *
 * The PDFs are written by hand (one page, Courier) so the repo needs no PDF
 * library just to produce two fixtures.
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const row = (product, brand, platform, price) =>
  (product.padEnd(17) + brand.padEnd(14) + platform.padEnd(15) + price).trimEnd()

const HEADER = [
  'Order #OP-9921  |  Date: 15 Jan 2025',
  '',
  row('Product', 'Brand', 'Platform', 'Base Price'),
  '-'.repeat(58),
]

const cart = [
  ...HEADER,
  row('Cushion Cover', 'Natura Casa', 'Amazon India', 'Rs.1,299'),
  row('Bed Sheet Set', 'Natura Casa', 'Flipkart', 'Rs.849'),
  row('Wall Shelf', 'LivSpace Pro', 'Amazon India', 'Rs.599'),
  row('Ceramic Vase', 'LivSpace Pro', 'Noon', 'Rs.2,499'),
  row('Cutting Board', 'Nordic Basics', 'Amazon India', 'Rs.449'),
  row('Desk Organiser', 'Nordic Basics', 'Flipkart', 'Rs.899'),
]

const malformed = [
  ...HEADER,
  row('Cushion Cover', 'Natura Casa', 'Amazon India', 'Rs.1,299'),
  row('Bed Sheet Set', 'Natura Casa', 'Flipkart', ''), // no price
  row('Wall Shelf', 'LivSpace Pro', 'Amazon India', 'Rs.599'),
  row('Ceramic Vase', '', 'Noon', 'Rs.2,499'), // no brand
  row('Cutting Board', 'Nordic Basics', 'Amazon India', 'TBC'), // price is not a number
  row('Desk Organiser', 'Nordic Basics', 'Flipkart', 'Rs.899'),
  '',
  'Total                                         Rs.6,694',
]

const escape = (text) => text.replace(/[\\()]/g, (c) => `\\${c}`)

function buildPdf(lines) {
  const content =
    'BT\n/F1 10 Tf\n14 TL\n50 780 Td\n' +
    lines.map((line) => `(${escape(line)}) Tj\nT*\n`).join('') +
    'ET\n'

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 5 0 R /Resources << /Font << /F1 4 0 R >> >> >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}endstream`,
  ]

  let pdf = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })

  const xrefStart = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`

  return Buffer.from(pdf, 'latin1')
}

const out = (name) => fileURLToPath(new URL(`../sample-data/${name}`, import.meta.url))

writeFileSync(out('cart.pdf'), buildPdf(cart))
writeFileSync(out('cart-malformed.pdf'), buildPdf(malformed))
console.log('Wrote sample-data/cart.pdf and sample-data/cart-malformed.pdf')
