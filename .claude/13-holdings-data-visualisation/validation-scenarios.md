# Holdings Data Visualisation — Validation Scenarios (UAT)

Manual end-to-end validation script for the initiative described in [rfc.md](rfc.md). Every number below is computed from the **real** holdings already uploaded in this environment (`EUNL`, `VWCE`, `LYP6`) — not invented — so each scenario has a concrete expected value you can check the UI against, not just "something should appear."

## Success criteria under test

| # | Criterion | Covered by |
| --- | --- | --- |
| 1 | Portfolio engine aggregates holding weights across all owned ETFs using look-through math | Scenarios 2, 3, 4 |
| 2 | Dashboard presents four distinct components: Alert Badge, Horizontal Bar Chart, Treemap, and Searchable Data Table | Scenario 0 (empty), Scenario 2 (populated), Scenario 5 (search/sort) |
| 3 | Users can instantly identify their top single-stock risk without scrolling | Scenarios 2, 3 (badge always shows the #1 risk with no interaction) |

Scenarios 1, 4, 6, 7 are supporting checks (data-quality edge cases and interaction details) that protect the three criteria above from silently breaking.

---

## Prerequisites

- Backend running (`just backend-dev` or `docker compose up`), reachable at `http://localhost:8000`.
- Frontend running (`just frontend-dev`), reachable at `http://localhost:3000`.
- `EUNL`, `VWCE`, `LYP6` already registered with holdings uploaded (already true in this environment — confirmed via `GET /etfs` and the holdings tables).
- A terminal for `curl` (setup/cleanup) and a browser at `/tabularium/portfolio` (verification).

**Reference data used throughout** (queried directly from this environment; do not re-derive):

| ETF | ID | ISIN | Latest holdings snapshot |
| --- | --- | --- | --- |
| EUNL | `97a1d7cc-5e12-4c51-94ea-cff91b3124f8` | `IE00B4L5Y983` | 2026-07-23 |
| VWCE | `2872f137-ed3a-485f-a3f8-79b657119cd4` | `IE00BK5BQT80` | 2026-06-30 |
| LYP6 | `36b22cdb-45e0-4a49-b9a0-a3351ecff989` | `LU0908500753` | 2026-07-22 |

| Stock | Weight in EUNL | Weight in VWCE | Weight in LYP6 |
| --- | --- | --- | --- |
| NVIDIA (`NVDA`, no ISIN in either fund) | 5.4400% | 4.4503% | — (not held) |
| Apple (`AAPL`) | 5.3300% | 3.9824% | — (not held) |
| RWE AG (`DE0007037129` — ticker-only in EUNL/VWCE, ISIN-native in LYP6) | 0.0400% | 0.0462% | 0.2804% |

RWE is the deliberate stress-test for TASK-1's cross-issuer identity resolution: EUNL and VWCE only ever reported it as ticker `RWE`, and it was backfilled to ISIN `DE0007037129` from LYP6's own ISIN via OpenFIGI — so all three rows must merge into **one** table row, not three.

**Cleanup safety note:** transactions created below use `owner: "qa-validation"` so they can be deleted individually afterward via `DELETE /transactions/{id}` (Scenario cleanup, at the end). Price snapshots have **no delete endpoint** — logging a test price on `EUNL`/`VWCE`/`LYP6` leaves a permanent (but harmless) extra row in that ETF's real price history. If you'd rather not touch real ETF price history at all, skip straight to **Scenario 7**, which uses a fully synthetic, fully deletable test ETF instead.

**Collapsible sections note (added after the initial UAT pass):** the Badge and Treemap cards are now collapsible via a clickable `▸`/`▾` header, matching the row-expansion pattern already used elsewhere on this page. The **Badge defaults to expanded** (its whole point is being visible with no interaction), but the **Treemap now defaults to collapsed** — with only two largely-overlapping ETFs held, it added little over the Bar Chart, so it's tucked away by default and becomes more useful once more, less-overlapping ETFs are added. Any scenario below that checks Treemap content assumes you've clicked its header open first.

---

## Scenario 0 — Empty state

**Setup:** none (fresh environment, or after full cleanup).

**Steps:**
1. Open `http://localhost:3000/tabularium/portfolio`.

**Expected:**
- No Concentration Alert Badge renders at all (not an empty badge — nothing; it still returns null before any card/header when there's no top holding to show).
- Bar chart card shows "No holdings data available."
- Treemap card renders collapsed by default; expand it (click the header) → "No holdings data available."
- Detailed table card shows "No holdings data available." (not the "no search matches" message — that's a different state, see Scenario 5).
- Existing "Portfolio Overview" table below still shows its own "No portfolio data available." independently.

---

## Scenario 1 — One ETF bought, no price logged yet (`skipped_etfs`)

**Setup:**
```bash
curl -s -X POST http://localhost:8000/transactions -H "Content-Type: application/json" -d '{
  "owner": "qa-validation", "broker_platform": "ibkr", "transaction_type": "buy",
  "asset_class": "etf", "ticker": "EUNL", "isin": "IE00B4L5Y983",
  "quantity": 10, "price": 100, "currency": "EUR", "transaction_date": "2026-08-29"
}'
```

**Expected (`GET /portfolio/holdings/exposure`):**
```json
{ "holdings": [], "skipped_etfs": ["EUNL"] }
```
`current_value` for EUNL is `NULL` (no price record exists), so the whole ETF is excluded rather than the response failing.

**In the browser:**
- A one-line advisory appears above the badge: *"Excluded from concentration analysis (no price data): EUNL"*.
- No badge renders, bar chart and detailed table show their empty states, and the (collapsed-by-default) treemap shows its empty state once expanded — a priceless ETF must not crash or half-render the dashboard.

---

## Scenario 2 — Price logged, single-ETF exposure (100% portfolio weight)

**Setup:**
```bash
curl -s -X POST http://localhost:8000/etfs/97a1d7cc-5e12-4c51-94ea-cff91b3124f8/price -H "Content-Type: application/json" -d '{
  "price": 100, "currency": "EUR"
}'
```

**Expected math:** `current_value(EUNL) = 10 × 100 = €1000`; it's the only ETF, so its portfolio weight is 100%. Look-through weight = raw EUNL weight for every stock.

| Stock | Expected `total_weight_percentage` |
| --- | --- |
| NVIDIA (top) | **5.44%** |
| Apple | 5.33% |
| Microsoft | 3.04% |
| Amazon | 2.55% |

**In the browser:**
- Advisory line disappears (no more `skipped_etfs`).
- **Badge:** "Largest single-stock exposure — NVDA — 5.44% — NVIDIA CORP", no warning color (well under 10%).
- **Bar chart:** NVDA is the tallest bar at 5.44%, all bars in the default (non-warning) color, comfortably left of the 10% threshold marker.
- **Treemap** (click its header to expand — collapsed by default): NVDA's rectangle is visibly the largest area; hovering it shows a tooltip with "NVIDIA CORP (NVDA) — 5.44%".
- **Detailed table:** search "NVDA" → one row, `Total Weight % = 5.44`; expand it → exactly one contribution row: `EUNL`, Portfolio Share `100.00%`, Fund Weight `5.44%`, Contribution `5.44%`, `2026-07-23`. (Portfolio Share × Fund Weight = Contribution — this is the breakdown added after the initial UAT pass, so the math is checkable at a glance instead of only showing the final product.)

---

## Scenario 3 — Second ETF added (the combined-portfolio case)

This is the "Add €1000 in EUNL and €500 in VWCE" scenario, with the actual expected NVIDIA number.

**Setup:**
```bash
curl -s -X POST http://localhost:8000/transactions -H "Content-Type: application/json" -d '{
  "owner": "qa-validation", "broker_platform": "ibkr", "transaction_type": "buy",
  "asset_class": "etf", "ticker": "VWCE", "isin": "IE00BK5BQT80",
  "quantity": 5, "price": 100, "currency": "EUR", "transaction_date": "2026-08-29"
}'

curl -s -X POST http://localhost:8000/etfs/2872f137-ed3a-485f-a3f8-79b657119cd4/price -H "Content-Type: application/json" -d '{
  "price": 100, "currency": "EUR"
}'
```

**Expected math:** `current_value(VWCE) = 5 × 100 = €500`. Total portfolio = `€1500`. EUNL weight = 1000/1500 = **66.67%**, VWCE weight = 500/1500 = **33.33%**.

`total_weight(stock) = 0.6667 × weight_in_EUNL + 0.3333 × weight_in_VWCE`

| Stock | EUNL contribution | VWCE contribution | **Total** |
| --- | --- | --- | --- |
| NVIDIA (top) | 3.63% | 1.48% | **5.11%** |
| Apple | 3.55% | 1.33% | 4.88% |
| Microsoft | 2.03% | 0.88% | 2.91% |
| Amazon | 1.70% | 0.73% | 2.43% |

**In the browser:**
- **Badge** updates to "NVDA — 5.11%" — a *lower* number than Scenario 2, because VWCE's own NVDA weight (4.45%) is lower than EUNL's (5.44%) and now dilutes the combined figure. This is the single most important number in this whole script to eyeball-check: if it doesn't move to ~5.11%, the aggregation math is wrong.
- **Bar chart** re-ranks: NVDA still tallest at 5.11%, but every bar has shifted down slightly from Scenario 2's values.
- **Detailed table:** expand NVDA → now **two** contributions, each showing Portfolio Share × Fund Weight = Contribution:
  - `EUNL` — Portfolio Share `66.67%`, Fund Weight `5.44%`, Contribution `3.63%`, `2026-07-23`
  - `VWCE` — Portfolio Share `33.33%`, Fund Weight `4.45%`, Contribution `1.48%`, `2026-06-30`

  summing to 5.11%.

---

## Scenario 4 — Third ETF + cross-issuer ISIN merge correctness (RWE)

**Setup:**
```bash
curl -s -X POST http://localhost:8000/transactions -H "Content-Type: application/json" -d '{
  "owner": "qa-validation", "broker_platform": "ibkr", "transaction_type": "buy",
  "asset_class": "etf", "ticker": "LYP6", "isin": "LU0908500753",
  "quantity": 5, "price": 100, "currency": "EUR", "transaction_date": "2026-08-29"
}'

curl -s -X POST http://localhost:8000/etfs/36b22cdb-45e0-4a49-b9a0-a3351ecff989/price -H "Content-Type: application/json" -d '{
  "price": 100, "currency": "EUR"
}'
```

**Expected math:** Total portfolio = `€2000`. EUNL = 50%, VWCE = 25%, LYP6 = 25%.

| Stock | Expected total | Why it matters |
| --- | --- | --- |
| NVIDIA | 3.83% (down again — LYP6 holds none, diluting further) | Confirms an ETF holding *zero* of a stock correctly contributes 0, not `null`/crash |
| **RWE AG** | **0.10%** (50%×0.04 + 25%×0.0462 + 25%×0.2804) | **The core TASK-1 check** |

**In the browser — RWE is the critical check:**
- Search "RWE" in the detailed table → **exactly one row** (not three). If you see three separate RWE rows, the ISIN backfill/merge is broken.
- Expand that row → **three** contributions, each showing Portfolio Share × Fund Weight = Contribution:
  - `EUNL` — Portfolio Share `50.00%`, Fund Weight `0.04%`, Contribution `0.02%`
  - `VWCE` — Portfolio Share `25.00%`, Fund Weight `0.05%`, Contribution `0.01%`
  - `LYP6` — Portfolio Share `25.00%`, Fund Weight `0.28%`, Contribution `0.07%`

  summing to ≈0.10%.
- Search `DE0007037129` (RWE's ISIN) in the same search box → the same single row appears, proving the search matches on ISIN too, not just name/ticker.

---

## Scenario 5 — Search and sort in the Detailed Table

**Setup:** none beyond Scenario 4's state.

**Steps & expected:**
1. Type `NVDA` in the search box → only the NVIDIA row shown; clear it → full list returns.
2. Type `zzz-nonexistent` → table shows "No stocks match your search." (a *different* message from Scenario 0's "No holdings data available.").
3. Click the **Total Weight %** column header once → rows sort descending (NVDA first); click again → ascending (NVDA last, since nothing has a smaller-than-others tie at this point — the smallest-weight stock sorts first).
4. Click **Ticker** → alphabetical by ticker; note rows with no ticker (ISIN-only, e.g. some LYP6-native stocks) sort to the bottom in both directions.

---

## Scenario 6 — Independent multi-row expansion

**Steps:**
1. Expand the NVDA row.
2. Without collapsing it, expand the RWE row too.

**Expected:** both rows stay expanded simultaneously. This is a deliberate divergence from the ETF Registry table's single-expand behavior (documented in [70-detailed-table.md](70-detailed-table.md)) — confirm it, don't file it as a bug.

---

## Scenario 7 (optional/stretch) — Crossing the 10% warning threshold

None of the real EUNL/VWCE/LYP6 data can push a single stock above ~5.5% no matter how you allocate between them (NVDA's own highest single-fund weight is 5.44%). To actually see the red/`roman-terracotta` warning styling fire on the badge, bar chart, and treemap, you need a deliberately concentrated holding — and a synthetic, fully-deletable test ETF is the clean way to get one without touching real fund data:

```bash
# 1. Create a throwaway ETF
curl -s -X POST http://localhost:8000/etfs -H "Content-Type: application/json" -d '{
  "ticker": "QATEST", "isin": "QA0000000001", "name": "QA Concentration Test Fund",
  "issuer": "QA", "asset_class": "Equities", "domicile": "Ireland",
  "fiscal_year_end": "31-Dec", "german_tax_classification": "Aktienfonds",
  "replication_strategy": "Full replication", "dividend_policy": "Accumulating",
  "ter": "0.001", "currency_hedged": false
}'
# → note the returned "id" as QATEST_ID

# 2. Upload one holding at 95% weight (CSV contract: stock_isin,stock_name,weight_percentage,snapshot_date)
printf 'stock_isin,stock_name,weight_percentage,snapshot_date\nUS0000000001,QA Concentration Stock,95,2026-08-29\n' > /tmp/qatest_holdings.csv
curl -s -X POST http://localhost:8000/etfs/{QATEST_ID}/holdings/upload -F "file=@/tmp/qatest_holdings.csv"

# 3. Buy enough of it to dominate the existing €2000 portfolio from Scenario 4
curl -s -X POST http://localhost:8000/transactions -H "Content-Type: application/json" -d '{
  "owner": "qa-validation", "broker_platform": "ibkr", "transaction_type": "buy",
  "asset_class": "etf", "ticker": "QATEST", "isin": "QA0000000001",
  "quantity": 100, "price": 100, "currency": "EUR", "transaction_date": "2026-08-29"
}'
curl -s -X POST http://localhost:8000/etfs/{QATEST_ID}/price -H "Content-Type: application/json" -d '{"price": 100, "currency": "EUR"}'
```

**Expected math:** `current_value(QATEST) = €10,000`. Total portfolio = `€12,000`. QATEST weight ≈ 83.3%. "QA Concentration Stock" total ≈ `0.833 × 95% ≈ 79.2%`.

**In the browser:**
- Badge flips to red/warning styling, showing "QA Concentration Stock — ~79%".
- Bar chart's top bar is almost entirely red, far past the dashed 10% threshold line.
- Treemap (expand its header first — collapsed by default): largest rectangle fills most of the canvas in `roman-terracotta`.

**Cleanup for this scenario only:** `DELETE /etfs/{QATEST_ID}` — cascades to delete both the holding and the price snapshot, leaving zero residue (unlike touching EUNL/VWCE/LYP6 directly).

---

## Cleanup (Scenarios 1–6)

```bash
# Find every transaction created for this validation run
curl -s "http://localhost:8000/transactions?owner=qa-validation" | python3 -c "
import json, sys
for t in json.load(sys.stdin):
    print(t['id'])
"
# Then delete each one:
curl -s -X DELETE http://localhost:8000/transactions/{id}
```

This fully removes the test positions (`net_quantity` returns to what it was before), so `GET /portfolio/holdings/exposure` returns to Scenario 0's empty state. The three price snapshots logged on `EUNL`/`VWCE`/`LYP6` during Scenarios 2–4 remain in their price history permanently (no delete endpoint exists) — this is expected residue, not a leak to chase down; a real price update later simply supersedes them as the "latest" price.
