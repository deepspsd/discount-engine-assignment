/**
 * pdfCartInput.js
 *
 * Input mode: cart PDF → CartItem[].
 * Browser entry point: loads pdf.js on demand, reads the text, hands it to the
 * pure parser. Always resolves to { data, errors } — a bad file is reported,
 * never thrown.
 */

import { extractPdfLines, MAX_PDF_PAGES } from './pdfText.js'
import { parseCartLines } from './pdfCartParser.js'

export const MAX_PDF_BYTES = 5 * 1024 * 1024

// pdf.js is large, so it is only downloaded when someone uploads a PDF.
let pdfjsPromise = null
function loadPdfjs() {
  pdfjsPromise ??= Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    return pdfjs
  })
  return pdfjsPromise
}

const failure = (message) => ({ data: [], errors: [message] })

function describeReadError(err) {
  switch (err?.name) {
    case 'PasswordException':
      return 'This PDF is password-protected. Remove the password and upload it again.'
    case 'InvalidPDFException':
      return 'This file is not a readable PDF. It may be damaged or not a PDF at all.'
    default:
      return 'The PDF could not be read. Try exporting it again, or upload the cart as CSV.'
  }
}

/**
 * @param {ArrayBuffer} buffer  the uploaded file
 * @param {object} [pdfjs]      pdf.js build to use; defaults to the browser one
 */
export async function parseCartPDF(buffer, pdfjs) {
  if (buffer.byteLength === 0) {
    return failure('The file is empty.')
  }
  if (buffer.byteLength > MAX_PDF_BYTES) {
    return failure('The PDF is larger than 5 MB. A cart PDF should be a short text document.')
  }

  let extracted
  try {
    extracted = await extractPdfLines(buffer, pdfjs ?? (await loadPdfjs()))
  } catch (err) {
    return failure(describeReadError(err))
  }

  if (extracted.lines.length === 0) {
    return failure(
      'No text was found in this PDF. It is probably a scanned image — upload a PDF with selectable text, or the cart as CSV.'
    )
  }

  const result = parseCartLines(extracted.lines)
  if (extracted.truncated) {
    result.errors.push(
      `Only the first ${MAX_PDF_PAGES} of ${extracted.pageCount} pages were read. Items on later pages are not in the cart.`
    )
  }
  return result
}
