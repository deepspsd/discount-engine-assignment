# Opptra Discount Engine

A cart pricing engine for a marketplace checkout: it applies the best available offer to each item, stacks offers that are allowed to stack, applies cart-level offers on top, and explains each result in words a customer can read.

Built on the base repo for the Opptra FDE Intern assignment.

**Live deployment:** https://discount-engine-assignment-deepak.vercel.app/

**Walkthrough video:** https://www.loom.com/share/2c3d4f7ce2fa4b3ebe6b8ec3beceaeba (recorded on the live deployment)

## Run locally

```bash
npm install
cp .env.example .env    # then set GROQ_API_KEY (only needed for the plain-English rule input)
npm run dev
```

Open http://localhost:5173. Run the tests with `npm test`.

## Try it

Sample files are in `sample-data/`.

1. Upload `rules.csv` under **Discount Rules**.
2. Upload `cart.csv` or `cart.pdf` under **Cart Items**. The cart is priced straight away.
3. Under **Or describe a rule**, type a rule such as `20% off for Natura Casa brand, stackable with other offers`, check the parsed fields, and choose **Add rule**. The cart is re-priced with it.
4. Upload `cart-malformed.pdf` to see how unreadable rows are handled.

Expected result for the sample rules and cart:

| Item | Base price | Final price | Offer applied | Status |
|---|---|---|---|---|
| ITEM-01 Cushion Cover | Rs.1,299 | Rs.1,104 | Platform offer: 15% off | Max discount |
| ITEM-02 Bed Sheet Set | Rs.849 | Rs.629 | Brand offer: Rs.150 off + Platform offer: 10% off | Stacked |
| ITEM-03 Wall Shelf | Rs.599 | Rs.509 | Platform offer: 15% off | Discount applied |
| ITEM-04 Ceramic Vase | Rs.2,499 | Rs.2,499 | No offers available | No offer |
| ITEM-05 Cutting Board | Rs.449 | Rs.382 | Platform offer: 15% off | Discount applied |
| ITEM-06 Desk Organiser | Rs.899 | Rs.809 | Platform offer: 10% off | Discount applied |

Cart total before offer Rs.5,932. Cart offer: 10% off — Rs.593 saved. **Final cart total Rs.5,339.**

## What was built

| | Brief | Where |
|---|---|---|
| Foundation | Run, verify, deploy | Base results verified by `src/engine/discountEngine.test.js` |
| Task 1 | Cart-level offer | `applyCartOffer`, `priceCart` in `src/engine/discountEngine.js` |
| Task 2 | Plain-English rule input | `src/inputs/nlRuleInput.js`, `src/inputs/ruleCandidate.js`, `api/parse-rule.js` |
| Task 3 | PDF cart upload | `src/inputs/pdfText.js`, `src/inputs/pdfCartParser.js`, `src/inputs/cartSources.js` |

## How it is put together

```
src/
  engine/                  pricing logic — pure functions, no UI, no network
    discountEngine.js        item-level rules, cart-level rules, priceCart()
    csvParser.js             CSV → rules / cart items
  inputs/                  everything that turns outside data into engine objects
    cartSources.js           the list of cart inputs (CSV, PDF)
    pdfText.js               PDF → lines of positioned words
    pdfCartParser.js         positioned words → cart items
    pdfCartInput.js          browser entry point for PDF upload
    nlRuleInput.js           text → server → validated rule
    ruleCandidate.js         validates an untrusted rule before the engine sees it
  ui/offerStatus.js        status badge for a priced item
  components/              upload area, tables, rule input with confirmation step
  App.jsx                  state and wiring
api/
  parse-rule.js            serverless function: POST /api/parse-rule
  _lib/parseRule.js        the LLM call (also served by the Vite dev server)
```

The rule that holds this together: **inputs adapt to the engine, never the other way round.** Every input produces the same two shapes, `DiscountRule` and `CartItem`, and everything ends at one function, `priceCart(cartItems, rules)`.

The item-level logic from the base repo is unchanged apart from one bug fix (flat discounts are capped at the price). Cart-level pricing was added beside it, not woven into it.

**Adding a third cart input** (JSON, a pasted list, an API) is one entry in `src/inputs/cartSources.js`:

```js
{ id: 'json', label: 'cart.json', description: 'Upload your cart JSON',
  accept: '.json', readAs: 'text', parse: (text) => parseCartJSON(text) }
```

`App.jsx` renders an upload area for each entry and handles the result the same way. The engine is not touched.

## Decisions and trade-offs

### Pricing

- **The cart threshold is inclusive and uses discounted prices.** A cart rule applies when the sum of *final* item prices is at or above its minimum. A cart of Rs.3,999 against a Rs.4,000 threshold gets no offer row. A cart whose base prices clear the threshold but whose discounted prices do not gets no cart offer either.
- **Just below the threshold, the customer is told.** No offer row appears, as the brief requires, but a small line under the total says how much more would unlock the offer. This is an addition; it is one element to remove if it is not wanted.
- **Several cart rules follow the item logic.** Among qualifying non-stackable cart rules the largest rupee saving wins; stackable ones apply on top. Each applied cart rule is its own line.
- **A cart rule without a minimum cart value is rejected,** in CSV and in text. Defaulting the threshold to zero would turn a typo into a discount on every order.
- **Flat discounts are capped at the price.** In the base code, Rs.150 off a Rs.100 item gave a price of −Rs.50.
- **Rounding** is to the nearest rupee at each step, as in the base engine. The cart offer is rounded once, on the cart total, so the figures on screen always add up.

### Plain-English rules

- **The LLM's answer is treated as untrusted input.** It is requested as strict JSON, then every field is validated in `ruleCandidate.js` before it can become a rule: scope, type, value above zero, percentage at most 100, a brand or platform name, a threshold for cart rules. An invalid answer produces a message, never a rule and never a crash.
- **Numbers must come from the user, not the model.** The discount value and the cart threshold have to appear as digits in the text that was typed. If the model invents "10%" for "give a discount for big orders", the rule is refused and the user is asked for the missing detail. The cost is that "twenty percent" written in words is sent back with a request for digits. For a rule that changes prices, a false refusal is cheaper than a made-up number.
- **Unknown names warn, they do not block.** A rule for a brand that is not in the current cart is still valid for a later cart, so the confirmation step shows a warning. The same step flags a name parsed as a brand that the cart knows as a platform.
- **"More than Rs.5,000" becomes "at least Rs.5,000",** following the brief's example. The confirmation step shows the threshold, so the user sees exactly what will be applied.
- **One target per rule.** "20% off Natura Casa on Flipkart" needs a brand and a platform together, which the engine's rule shape cannot express. It is reported as unresolvable rather than silently applied to one of the two.
- **Discard keeps the text,** so the user can reword it rather than retype it.

### PDF upload

- **Columns are found by position, not by splitting on spaces.** Brand and platform names contain spaces, and in the brief's own layout "Nordic Basics" and "Amazon India" are a single space apart, so whitespace cannot tell where a column ends. The parser reads each word's horizontal position and assigns it to the column whose header it sits under.
- **A malformed row is skipped and reported.** The message quotes the row and says what is wrong ("missing base price", "base price "TBC" is not a valid amount"). The readable rows are loaded, with a notice that the totals do not include the skipped ones. Rejecting the whole file was the alternative; partial loading with a visible notice matches how the CSV input already behaves and lets the user see what was understood.
- **A file with nothing usable does not empty the cart.** A non-PDF, a scanned image with no text, a password-protected file, or a file over 5 MB produces a specific message and leaves the current cart in place.
- **Item ids follow the row number in the PDF,** since the PDF has no id column. If row 2 is skipped, the items are ITEM-01 and ITEM-03, so each id still points at its line in the document.
- "Total" lines and ruled lines under the header are not treated as items.

## Where I disagree with the brief

**1. "A backend is optional — only add a server if PDF parsing requires it."**
PDF parsing does not need a server and runs in the browser. The LLM call does. Calling the LLM from the browser means shipping the API key in a public JavaScript bundle, where anyone can copy it. So there is one serverless function, `api/parse-rule.js`, that holds the key and forwards the text. It has no state and no database. The consequence is that the deployment needs a host that runs functions (Vercel) rather than a plain static host for `dist/`.

**2. The confirmation step.**
I kept it and would not remove it: a pricing rule should not go live on a model's reading alone. Two changes I would propose. First, let the user edit the parsed fields in place instead of only confirm or discard; fixing "15" to "20" is quicker than rewording a sentence. Second, show the effect before confirming ("this changes 2 items, cart total Rs.5,339 → Rs.5,104"), because the fields say what the rule is and the preview says what it does.

**3. The PDF format assumption.**
A fixed four-column table is fine for a known source. Carts exported from different platforms will not share a layout, and position-based parsing fails on right-aligned or wrapped cells. For that, I would keep this parser as the fast path and fall back to an LLM extraction, validated row by row with the same checks, when no header is found.

**4. Stacking order is not always the biggest saving.**
The brief says to always give the customer the biggest saving. For ITEM-02 it applies Rs.150 off and then 10%, giving Rs.629. Applying 10% first and then Rs.150 gives Rs.614. I kept the brief's order, because the expected results depend on it, but the two statements conflict and a product owner should choose one.

**5. One offer label.**
The stakeholder asks for "one final price, one offer label". When offers stack, the engine shows both ("Brand offer: Rs.150 off + Platform offer: 10% off"). I left this as the base engine has it, since hiding one of two applied offers would be less clear, not more.

## Known limitations

- `/api/parse-rule` has no rate limiting or authentication. Anyone with the URL can use the LLM quota. Input length is capped and the key is a free-tier key; a real deployment would put a per-IP limit in front of it.
- The free LLM tier allows only a few requests per minute. The server waits and retries once when the provider asks for a short pause; beyond that the user sees "The rule parser is busy".
- Rules cannot be edited or removed one by one. Uploading a rules CSV replaces all rules, including those added by text.
- PDF parsing expects cells left-aligned under their headers and one line per item.
- State is in memory only, as the brief specifies. A page refresh clears it.

## Tests

`npm test` runs 98 tests:

- the brief's expected results for every item, the cart offer, and the status of each item
- cart threshold edges: one rupee below, exactly at, base prices above but discounted prices below
- LLM answers that are malformed, out of range, or contain invented numbers
- the client and server halves of the rule input, with the network mocked
- PDF parsing against the real sample PDFs, including malformed rows and non-PDF files

## Deployment

The app is a Vite build plus one serverless function, deployed on Vercel. Set `GROQ_API_KEY` in the project's environment variables. `GROQ_MODEL` is optional and defaults to `openai/gpt-oss-20b`.

## File formats

**rules.csv**

| Column | Values | Notes |
|---|---|---|
| rule_id | text | e.g. RULE-01 |
| scope | brand, platform, cart | |
| applies_to | text | brand or platform name; empty for cart |
| type | percentage, flat | |
| value | number | percent (1–100) or rupees |
| stackable | true, false | |
| min_cart_value | number | required for cart rules; the column is optional otherwise |

**cart.csv**: `item_id, product, brand, platform, base_price`

**Cart PDF**: a text PDF with a header row `Product  Brand  Platform  Base Price` and one item per line. Lines above the header are ignored. Prices may be written as `Rs.1,299`, `₹1299`, `INR 1,299` or `1299`.
