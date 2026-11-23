/**
 * pdfText.js
 *
 * Reads the text layer of a PDF into lines of positioned words.
 * Knows about PDFs, nothing about carts — pdfCartParser.js does the rest.
 *
 * The pdf.js library is passed in rather than imported, because the browser
 * and Node (tests) load different builds of it.
 *
 * Returns { lines, pageCount, truncated } where
 *   lines: [{ page, words: [{ x, text }] }]   top-to-bottom, words left-to-right
 */

export const MAX_PDF_PAGES = 20

// Text items whose baselines are within this many points are the same line.
const SAME_LINE_TOLERANCE = 2

export async function extractPdfLines(data, pdfjs, { maxPages = MAX_PDF_PAGES } = {}) {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(data),
    isEvalSupported: false,
  }).promise

  const pagesToRead = Math.min(doc.numPages, maxPages)
  const lines = []

  for (let pageNo = 1; pageNo <= pagesToRead; pageNo++) {
    const page = await doc.getPage(pageNo)
    const { items } = await page.getTextContent()

    const words = []
    for (const item of items) {
      if (!item.str || item.str.trim() === '') continue
      const x = item.transform[4]
      const y = item.transform[5]
      // A PDF may draw a whole table row as one string, with the columns
      // lined up by spaces. Estimating where each word starts inside the
      // string recovers the column positions in that case too.
      for (const match of item.str.matchAll(/\S+/g)) {
        words.push({
          x: x + item.width * (match.index / item.str.length),
          y,
          text: match[0],
        })
      }
    }

    words.sort((a, b) => b.y - a.y || a.x - b.x) // PDF y grows upwards

    let current = null
    for (const word of words) {
      if (!current || Math.abs(current.y - word.y) > SAME_LINE_TOLERANCE) {
        current = { page: pageNo, y: word.y, words: [] }
        lines.push(current)
      }
      current.words.push({ x: word.x, text: word.text })
    }
  }

  for (const line of lines) {
    line.words.sort((a, b) => a.x - b.x)
    delete line.y
  }

  return { lines, pageCount: doc.numPages, truncated: doc.numPages > pagesToRead }
}
