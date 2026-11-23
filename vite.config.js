import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { parseRule } from './api/_lib/parseRule.js'

/**
 * Serves POST /api/parse-rule during `npm run dev`, using the same code the
 * Vercel function runs in production. Keeps local setup to `npm install` +
 * `npm run dev` — no separate server or Vercel CLI needed.
 */
function devApi(env) {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use('/api/parse-rule', (req, res) => {
        const send = (status, body) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (req.method !== 'POST') {
          return send(405, { error: 'method_not_allowed', message: 'Use POST.' })
        }
        let raw = ''
        req.on('data', (chunk) => { raw += chunk })
        req.on('end', async () => {
          let input = {}
          try { input = JSON.parse(raw) } catch { /* handled as empty input */ }
          const { status, body } = await parseRule(input, env)
          send(status, body)
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // '' prefix: load every variable from .env, not just VITE_ ones. They stay
  // on the dev server — nothing here is exposed to the browser bundle.
  const env = loadEnv(mode, process.cwd(), '')
  return { plugins: [react(), devApi(env)] }
})
