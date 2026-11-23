/**
 * POST /api/parse-rule — Vercel serverless function.
 * Thin HTTP wrapper; the work is in _lib/parseRule.js.
 */

import { parseRule } from './_lib/parseRule.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed', message: 'Use POST.' })
  }

  // Vercel parses JSON bodies; a malformed one arrives as a string or undefined.
  const input = req.body && typeof req.body === 'object' ? req.body : {}
  const { status, body } = await parseRule(input, process.env)
  return res.status(status).json(body)
}
