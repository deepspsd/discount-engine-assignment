/**
 * App.jsx
 *
 * Top-level component. Manages state for rules, cart items, and results.
 * Wires together CSV upload → parse → engine → display.
 */

import { useState } from 'react'
import FileUploader from './components/FileUploader.jsx'
import DataTable from './components/DataTable.jsx'
import ErrorBanner from './components/ErrorBanner.jsx'
import { parseRulesCSV } from './engine/csvParser.js'
import { priceCart } from './engine/discountEngine.js'
import NlRuleInput from './components/NlRuleInput.jsx'
import { knownNames } from './inputs/nlRuleInput.js'
import { nextRuleId } from './inputs/ruleCandidate.js'
import { CART_SOURCES } from './inputs/cartSources.js'
import { offerStatus } from './ui/offerStatus.js'

// ── Column definitions ───────────────────────────────────────────

const RULES_COLUMNS = [
  { key: 'ruleId',    label: 'Rule ID', nowrap: true },
  { key: 'scope',     label: 'Scope',      render: (v) => v.charAt(0).toUpperCase() + v.slice(1) },
  { key: 'appliesTo', label: 'Applies To', render: (v, row) => (row.scope === 'cart' ? 'Entire cart' : v) },
  { key: 'type',      label: 'Type',       render: (v) => v.charAt(0).toUpperCase() + v.slice(1) },
  {
    key: 'value',
    label: 'Value',
    render: (v, row) => row.type === 'percentage' ? `${v}% off` : `Rs.${v} off`,
  },
  {
    key: 'minCartValue',
    label: 'Condition',
    render: (v, row) =>
      row.scope === 'cart' ? `Cart total ≥ Rs.${v.toLocaleString('en-IN')}` : '—',
  },
  { key: 'stackable', label: 'Stackable',  render: (v) => (v ? 'Yes' : 'No') },
]

const CART_COLUMNS = [
  { key: 'itemId',    label: 'Item', nowrap: true },
  { key: 'product',   label: 'Product' },
  { key: 'brand',     label: 'Brand' },
  { key: 'platform',  label: 'Platform' },
  { key: 'basePrice', label: 'Base Price', render: (v) => `Rs.${v.toLocaleString('en-IN')}` },
]

const RESULTS_COLUMNS = [
  { key: 'itemId',    label: 'Item', nowrap: true },
  { key: 'product',   label: 'Product' },
  { key: 'basePrice', label: 'Base Price',  render: (v) => `Rs.${v.toLocaleString('en-IN')}` },
  { key: 'finalPrice',label: 'Final Price',
    render: (v, row) => (
      <span style={{ fontWeight: 700, color: row.totalDiscount > 0 ? '#1e5c2c' : '#131A48' }}>
        Rs.{v.toLocaleString('en-IN')}
      </span>
    ),
  },
  {
    key: 'totalDiscount',
    label: 'You Save',
    render: (v) =>
      v > 0 ? (
        <span style={{ color: '#1e5c2c', fontWeight: 600 }}>Rs.{v.toLocaleString('en-IN')}</span>
      ) : (
        <span style={{ color: '#888' }}>—</span>
      ),
  },
  {
    key: 'reasoning',
    label: 'Offer Applied',
    render: (v) => (
      <span style={{ color: v === 'No offers available' ? '#888' : '#131A48', fontStyle: v === 'No offers available' ? 'italic' : 'normal' }}>
        {v}
      </span>
    ),
  },
  {
    key: 'appliedRules',
    label: 'Status',
    render: (_v, row) => {
      const status = offerStatus(row)
      return <span style={S.tag(status.color, status.background)}>{status.label}</span>
    },
  },
]

// ── Styles ───────────────────────────────────────────────────────

const S = {
  page:    { minHeight: '100vh', background: '#f7f7f9', fontFamily: 'Arial, sans-serif' },
  header:  { background: '#131A48', padding: '0.85rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logoTxt: { fontFamily: 'Georgia, serif', fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' },
  logoSpan:{ color: '#FF5800' },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em' },
  main:    { maxWidth: 960, margin: '0 auto', padding: '1.8rem 1.5rem' },
  section: { background: '#fff', border: '1px solid #CECECE', borderRadius: 6, padding: '1.2rem 1.4rem', marginBottom: '1.2rem' },
  sectionTitle: { fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 14, color: '#131A48', marginBottom: '0.7rem', paddingBottom: 6, borderBottom: '2px solid #FF5800', display: 'inline-block' },
  sourceList: { display: 'grid', gap: 8 },
  notice: { fontSize: 12, color: '#7a4b00', fontWeight: 600, marginTop: '0.6rem' },
  subTitle: { fontWeight: 700, fontSize: 12, color: '#131A48', margin: '1rem 0 0.4rem' },
  grid2:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' },
  btn:     {
    background: '#FF5800', color: '#fff', border: 'none', borderRadius: 4,
    padding: '0.65rem 2rem', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    letterSpacing: '0.04em', textTransform: 'uppercase',
  },
  btnDisabled: {
    background: '#CECECE', color: '#fff', border: 'none', borderRadius: 4,
    padding: '0.65rem 2rem', fontSize: 13, fontWeight: 700, cursor: 'not-allowed',
    letterSpacing: '0.04em', textTransform: 'uppercase',
  },
  totalRow: {
    display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
    gap: '1rem', marginTop: '0.75rem', paddingTop: '0.75rem',
    borderTop: '2px solid #131A48',
  },
  summaryRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginTop: '0.75rem', padding: '0.45rem 0.6rem', fontSize: 13, color: '#131A48',
  },
  summaryLabel: { fontWeight: 600 },
  summaryValue: { fontWeight: 600 },
  offerRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem',
    padding: '0.5rem 0.6rem', background: '#f0faf2', border: '1px solid #cfe8d4',
    borderRadius: 4, fontSize: 13, marginTop: 4,
  },
  offerLabel: { fontWeight: 700, color: '#1e5c2c' },
  offerCondition: { color: '#666', fontSize: 11, marginLeft: 8 },
  offerValue: { fontWeight: 700, color: '#1e5c2c', whiteSpace: 'nowrap' },
  lockedHint: { textAlign: 'right', fontSize: 11, color: '#888', marginTop: 6 },
  totalLabel: { fontWeight: 700, fontSize: 14, color: '#131A48' },
  totalValue: { fontWeight: 700, fontSize: 16, color: '#131A48' },
  tag: (color, bg) => ({
    display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '1px 6px',
    borderRadius: 20, background: bg, color, textTransform: 'uppercase', letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
  }),
}

// ── Component ────────────────────────────────────────────────────

export default function App() {
  const [rules, setRules]           = useState([])
  const [rulesErrors, setRulesErr]  = useState([])
  const [rulesFileName, setRulesFileName] = useState('')

  const [cartItems, setCartItems]   = useState([])
  const [cartErrors, setCartErrors] = useState([])
  const [cartFileName, setCartFileName]   = useState('')
  const [cartSourceId, setCartSourceId]   = useState(null) // which input the current cart came from
  const [cartNotice, setCartNotice]       = useState('')
  const [cartBusyId, setCartBusyId]       = useState(null)

  const [results, setResults]       = useState(null)

  // ── Handlers ──

  function handleRulesLoad(csvText, fileName) {
    const { data, errors } = parseRulesCSV(csvText)
    setRules(data)
    setRulesErr(errors)
    setRulesFileName(fileName)
    // Rules changed: re-price the cart already loaded, so the summary on
    // screen never describes rules that are no longer active.
    setResults(data.length > 0 && cartItems.length > 0 ? priceCart(cartItems, data) : null)
  }

  // One handler for every cart input. A source only has to produce
  // { data, errors }; what happens next is the same for all of them.
  async function handleCartLoad(source, content, fileName) {
    setCartBusyId(source.id)
    let parsed
    try {
      parsed = await source.parse(content)
    } catch {
      parsed = { data: [], errors: ['Something went wrong reading this file. Try again.'] }
    } finally {
      setCartBusyId(null)
    }
    const { data, errors } = parsed

    // Nothing usable in the file: keep the cart the customer already has
    // rather than emptying it.
    if (data.length === 0) {
      setCartErrors(errors.length > 0 ? errors : ['No cart items were found in this file.'])
      setCartNotice(
        cartItems.length > 0
          ? `${fileName} was not loaded. The cart below is unchanged.`
          : `${fileName} was not loaded.`
      )
      return
    }

    setCartItems(data)
    setCartErrors(errors)
    setCartFileName(fileName)
    setCartSourceId(source.id)
    // Some rows were unreadable: load the rest, but say plainly that the
    // totals are for fewer items than the file listed.
    setCartNotice(
      errors.length > 0
        ? `Loaded ${data.length} item${data.length > 1 ? 's' : ''} from ${fileName}. The rows listed below were skipped and are not included in any total.`
        : ''
    )
    // A new cart is priced straight away with the rules already active.
    setResults(rules.length > 0 ? priceCart(data, rules) : null)
  }

  function handleCartReadError(message, fileName) {
    setCartErrors([message])
    setCartNotice(`${fileName} was not loaded.`)
  }

  function handleCalculate() {
    setResults(priceCart(cartItems, rules))
  }

  // A rule the user described in plain English and confirmed. It joins the
  // active rules like any uploaded one, and the current cart is re-priced with it.
  function handleRuleConfirmed(rule) {
    const nextRules = [...rules, { ruleId: nextRuleId(rules), ...rule }]
    setRules(nextRules)
    if (cartItems.length > 0) {
      setResults(priceCart(cartItems, nextRules))
    }
  }

  const canCalculate = rules.length > 0 && cartItems.length > 0

  // ── Render ──

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.logoTxt}>O<span style={S.logoSpan}>pp</span>tra</div>
        <div style={S.headerSub}>Discount Engine</div>
      </div>

      <div style={S.main}>

        {/* Upload row */}
        <div style={S.grid2}>
          {/* Rules upload */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Discount Rules</div>
            <FileUploader
              label="rules.csv"
              description="Upload your discount rules CSV"
              onLoad={handleRulesLoad}
              hasData={rules.length > 0}
              fileName={rulesFileName}
            />
            <ErrorBanner errors={rulesErrors} />
            {rules.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                  {rules.length} rule{rules.length > 1 ? 's' : ''} loaded
                </div>
                <DataTable columns={RULES_COLUMNS} rows={rules} />
              </div>
            )}
            <div style={S.subTitle}>Or describe a rule</div>
            <NlRuleInput context={knownNames(cartItems, rules)} onConfirm={handleRuleConfirmed} />
          </div>

          {/* Cart upload */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Cart Items</div>
            <div style={S.sourceList}>
              {CART_SOURCES.map((source) => (
                <FileUploader
                  key={source.id}
                  label={source.label}
                  description={source.description}
                  accept={source.accept}
                  readAs={source.readAs}
                  busy={cartBusyId === source.id}
                  onLoad={(content, fileName) => handleCartLoad(source, content, fileName)}
                  onError={handleCartReadError}
                  hasData={cartSourceId === source.id && cartItems.length > 0}
                  fileName={cartFileName}
                />
              ))}
            </div>
            {cartNotice && <div style={S.notice}>{cartNotice}</div>}
            <ErrorBanner errors={cartErrors} />
            {cartItems.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                  {cartItems.length} item{cartItems.length > 1 ? 's' : ''} loaded
                </div>
                <DataTable columns={CART_COLUMNS} rows={cartItems} />
              </div>
            )}
          </div>
        </div>

        {/* Calculate button */}
        <div style={{ textAlign: 'center', marginBottom: '1.2rem' }}>
          <button
            style={canCalculate ? S.btn : S.btnDisabled}
            onClick={handleCalculate}
            disabled={!canCalculate}
          >
            Calculate Discounts
          </button>
          {!canCalculate && (
            <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
              Upload both files to calculate
            </div>
          )}
        </div>

        {/* Results */}
        {results && (
          <div style={S.section}>
            <div style={S.sectionTitle}>Cart Summary</div>
            <DataTable columns={RESULTS_COLUMNS} rows={results.items} />

            {/* Cart-level offers sit below the items: they belong to the cart, not to any one item */}
            {results.cartOffer.lines.length > 0 && (
              <div style={S.summaryRow}>
                <span style={S.summaryLabel}>Cart total before offer</span>
                <span style={S.summaryValue}>Rs.{results.subtotal.toLocaleString('en-IN')}</span>
              </div>
            )}
            {results.cartOffer.lines.map((line) => (
              <div key={line.ruleId} style={S.offerRow}>
                <span>
                  <span style={S.offerLabel}>{line.label}</span>
                  <span style={S.offerCondition}>{line.condition}</span>
                </span>
                <span style={S.offerValue}>−Rs.{line.discount.toLocaleString('en-IN')}</span>
              </div>
            ))}

            <div style={S.totalRow}>
              <span style={S.totalLabel}>
                {results.cartOffer.lines.length > 0 ? 'Final Cart Total' : 'Cart Total'}
              </span>
              <span style={S.totalValue}>Rs.{results.finalTotal.toLocaleString('en-IN')}</span>
            </div>

            {results.cartOffer.lockedOffer && (
              <div style={S.lockedHint}>{results.cartOffer.lockedOffer.hint}</div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
