/**
 * cartSources.js
 *
 * Every way a cart can be loaded. Each source turns an uploaded file into
 * { data: CartItem[], errors: string[] } — the one shape the app and the
 * discount engine work with.
 *
 * To add another input mode (JSON, a pasted list, an API), add an entry here.
 * Neither App.jsx nor the engine needs to change.
 *
 *   id          stable key
 *   label       shown on the upload area
 *   description shown until a file is loaded
 *   accept      file picker filter
 *   readAs      'text' | 'arrayBuffer' — how the uploader hands over the file
 *   parse       (content) => { data, errors } | Promise<{ data, errors }>
 */

import { parseCartCSV } from '../engine/csvParser.js'
import { parseCartPDF } from './pdfCartInput.js'

export const CART_SOURCES = [
  {
    id: 'csv',
    label: 'cart.csv',
    description: 'Upload your cart CSV',
    accept: '.csv',
    readAs: 'text',
    parse: (text) => parseCartCSV(text),
  },
  {
    id: 'pdf',
    label: 'cart.pdf',
    description: 'Upload a cart PDF (Product, Brand, Platform, Base Price)',
    accept: '.pdf,application/pdf',
    readAs: 'arrayBuffer',
    parse: (buffer) => parseCartPDF(buffer),
  },
]
