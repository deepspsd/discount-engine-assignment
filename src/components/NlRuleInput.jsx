/**
 * NlRuleInput.jsx
 *
 * Text field for describing a discount rule in plain English, plus the
 * confirmation step. Nothing is added to the active rules until the user
 * confirms the parsed fields.
 *
 * Props:
 *   context   { knownBrands, knownPlatforms } — names from the current cart/rules
 *   onConfirm (rule) => void — called with a validated rule (no ruleId yet)
 */

import { useState } from 'react'
import { parseRuleFromText, MAX_RULE_TEXT_LENGTH } from '../inputs/nlRuleInput.js'

const rupees = (n) => `Rs.${n.toLocaleString('en-IN')}`
const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1)

/** The parsed rule as label/value pairs, in the order the brief shows them. */
function describeRule(rule) {
  const fields = [['Scope', capitalise(rule.scope)]]
  fields.push(['Applies to', rule.scope === 'cart' ? 'Entire cart' : rule.appliesTo])
  fields.push(['Type', capitalise(rule.type)])
  fields.push(['Value', rule.type === 'percentage' ? `${rule.value}%` : rupees(rule.value)])
  if (rule.scope === 'cart') fields.push(['Min cart value', rupees(rule.minCartValue)])
  fields.push(['Stackable', rule.stackable ? 'Yes' : 'No'])
  return fields
}

const S = {
  row: { display: 'flex', gap: 8 },
  input: {
    flex: 1, padding: '0.55rem 0.7rem', fontSize: 13, border: '1px solid #CECECE',
    borderRadius: 4, color: '#131A48', fontFamily: 'inherit',
  },
  btn: (enabled) => ({
    background: enabled ? '#131A48' : '#CECECE', color: '#fff', border: 'none', borderRadius: 4,
    padding: '0.55rem 1.1rem', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
    textTransform: 'uppercase', cursor: enabled ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap',
  }),
  help: { fontSize: 11, color: '#888', marginTop: 6 },
  notice: (tone) => ({
    marginTop: '0.6rem', padding: '0.6rem 0.9rem', borderRadius: 4, fontSize: 12,
    background: tone === 'ask' ? '#fff8e1' : '#fce8e8',
    border: `1px solid ${tone === 'ask' ? '#e6c35c' : '#e57373'}`,
    borderLeft: `3px solid ${tone === 'ask' ? '#b8860b' : '#c0392b'}`,
    color: tone === 'ask' ? '#5c4500' : '#5a1010',
  }),
  card: {
    marginTop: '0.6rem', padding: '0.8rem 0.9rem', borderRadius: 4,
    background: '#f4f6ff', border: '1px solid #c5cdf0',
  },
  cardTitle: { fontWeight: 700, fontSize: 12, color: '#131A48', marginBottom: 2 },
  quote: { fontSize: 11, color: '#666', fontStyle: 'italic', marginBottom: 8 },
  fields: { display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 14, rowGap: 3, fontSize: 12 },
  fieldLabel: { color: '#666' },
  fieldValue: { color: '#131A48', fontWeight: 700 },
  warning: { marginTop: 8, fontSize: 11, color: '#8a5a00' },
  actions: { display: 'flex', gap: 8, marginTop: 10 },
  confirm: {
    background: '#1e5c2c', color: '#fff', border: 'none', borderRadius: 4, padding: '0.45rem 1rem',
    fontSize: 12, fontWeight: 700, cursor: 'pointer',
  },
  discard: {
    background: '#fff', color: '#131A48', border: '1px solid #CECECE', borderRadius: 4,
    padding: '0.45rem 1rem', fontSize: 12, fontWeight: 700, cursor: 'pointer',
  },
}

export default function NlRuleInput({ context, onConfirm }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [problem, setProblem] = useState(null) // { tone: 'ask' | 'error', message }
  const [pending, setPending] = useState(null) // { rule, warnings, sourceText }

  const canParse = text.trim() !== '' && !loading && !pending

  async function handleParse(e) {
    e.preventDefault()
    if (!canParse) return
    setLoading(true)
    setProblem(null)
    const sourceText = text.trim()
    const outcome = await parseRuleFromText(sourceText, context)
    setLoading(false)

    if (outcome.status === 'ok') {
      setPending({ rule: outcome.rule, warnings: outcome.warnings, sourceText })
    } else {
      setProblem({
        tone: outcome.status === 'unresolvable' ? 'ask' : 'error',
        message: outcome.message,
      })
    }
  }

  function handleConfirm() {
    onConfirm(pending.rule)
    setPending(null)
    setText('')
  }

  // Discard keeps the text so the user can reword it instead of retyping.
  function handleDiscard() {
    setPending(null)
  }

  return (
    <div>
      <form style={S.row} onSubmit={handleParse}>
        <input
          style={S.input}
          type="text"
          value={text}
          maxLength={MAX_RULE_TEXT_LENGTH}
          disabled={loading || !!pending}
          placeholder='e.g. "20% off for Natura Casa brand, stackable with other offers"'
          aria-label="Describe a discount rule"
          onChange={(e) => {
            setText(e.target.value)
            setProblem(null)
          }}
        />
        <button type="submit" style={S.btn(canParse)} disabled={!canParse}>
          {loading ? 'Reading…' : 'Parse rule'}
        </button>
      </form>
      <div style={S.help}>
        Say what the discount is and what it applies to — a brand, a platform, or carts above a value.
        You will check the result before it is added.
      </div>

      {problem && (
        <div style={S.notice(problem.tone)} role="alert">
          {problem.message}
        </div>
      )}

      {pending && (
        <div style={S.card}>
          <div style={S.cardTitle}>Is this the rule you meant?</div>
          <div style={S.quote}>“{pending.sourceText}”</div>
          <div style={S.fields}>
            {describeRule(pending.rule).map(([label, value]) => (
              <span key={label} style={{ display: 'contents' }}>
                <span style={S.fieldLabel}>{label}</span>
                <span style={S.fieldValue}>{value}</span>
              </span>
            ))}
          </div>
          {pending.warnings.map((w) => (
            <div key={w} style={S.warning}>⚠ {w}</div>
          ))}
          <div style={S.actions}>
            <button type="button" style={S.confirm} onClick={handleConfirm}>Add rule</button>
            <button type="button" style={S.discard} onClick={handleDiscard}>Discard</button>
          </div>
        </div>
      )}
    </div>
  )
}
