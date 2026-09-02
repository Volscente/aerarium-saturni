# Holdings Risk Alerts — High-Level Planning

**Project:** Aerarium Saturni
**GitHub repo:** [Volscente/aerarium-saturni](https://github.com/Volscente/aerarium-saturni)
**Total estimated effort:** 3.0 FTE-days (1 FTE = 1 day)

---

## Overview

This initiative adds an automated risk-alert layer on top of the existing look-through exposure aggregation: a backend rule engine evaluates Concentration Risk (`total_weight_percentage > 10%`) and Data Freshness Risk (an owned ETF's `snapshot_date` more than 60 days old) inside the existing `GET /portfolio/holdings/exposure` response, and a new collapsible dashboard panel surfaces both as an in-app badge/banner. A prerequisite fix wires the missing `revalidateTag('holdings-exposure')` calls into all three trigger events (transactions, prices, holdings uploads), since without it the alerts (and the rest of the dashboard) cannot be "real-time" regardless of how the rules themselves are implemented.

### Dependency Order

```txt
TASK-1 ──┐
         ├──► TASK-3
TASK-2 ──┘
```

---

## TASK-1 — Cache Invalidation Fix

**GitHub Issue:** #{number}
**Effort estimate:** 0.5 FTE-days

### Scope

Add the missing `revalidateTag('holdings-exposure')` call to every existing mutation path that can change look-through exposure or holdings freshness — none of them call it today.

### Goal

Make "real-time re-evaluation" achievable at all: today the dashboard can silently show pre-mutation numbers after a buy/sell, a price change, or a holdings upload, because nothing invalidates the `holdings-exposure` cache tag introduced when the Concentration Dashboard UI was built.

### Deliverables

- `frontend/app/(tabularium)/tabularium/actions.ts` — `createTransaction`, `updateTransaction`, `deleteTransaction` each add `revalidateTag('holdings-exposure')` alongside their existing `revalidateTag('transactions')`/`revalidateTag('portfolio-overview')` calls
- `frontend/app/(tabularium)/tabularium/etf-actions.ts` — `createEtf`, `updateEtf`, `deleteEtf`, `addPriceSnapshot`, `updatePriceSnapshot`, `deletePriceSnapshot` each add `revalidateTag('holdings-exposure')` alongside their existing calls
- `frontend/app/api/etfs/[id]/holdings/upload/route.ts` — add `revalidateTag('holdings-exposure')` and `revalidateTag('portfolio-overview')` after a successful upload response

### Technical Overview

`revalidateTag` is a general Next.js server API, usable in Route Handlers as well as Server Actions, so the holdings-upload path (a plain Route Handler proxying to the backend) can call it the same way the Server Actions do. This is a mechanical addition — one extra line per function — with no new logic, since `portfolio-overview` is already invalidated uniformly across all nine existing mutation functions regardless of whether each one "really" affects exposure; `holdings-exposure` follows the same uniform pattern rather than a case-by-case judgment call.

---

## TASK-2 — Risk Rule Evaluation Engine

**GitHub Issue:** #{number}
**Effort estimate:** 1.0 FTE-days

### Scope

Derive both alert rules server-side inside the existing `get_holdings_exposure` computation, using data it already holds in memory, and attach them to the existing response.

### Goal

A single, backend-owned source of truth for "is this stock over the concentration limit" and "is this ETF's holdings snapshot stale" — reusable by the dashboard (this initiative) and any future notification channel, without a second query or a second endpoint.

### Deliverables

- `backend/src/backend/schemas/portfolio.py` — new `RiskAlert` Pydantic schema (`rule: Literal["concentration_risk", "data_freshness_risk"]`, `message: str`, plus rule-specific context fields); `HoldingsExposureResponse` gains `alerts: list[RiskAlert]`
- `backend/src/backend/routers/portfolio.py` — `CONCENTRATION_THRESHOLD_PCT = 10` and `FRESHNESS_THRESHOLD_DAYS = 60` module-level constants; `get_holdings_exposure` emits one `RiskAlert` per holding where `total_weight_percentage > CONCENTRATION_THRESHOLD_PCT`, and one `RiskAlert` per distinct owned ETF whose latest `snapshot_date` is more than `FRESHNESS_THRESHOLD_DAYS` days old
- `backend/tests/routers/test_portfolio.py` — new tests covering: a concentration alert firing above 10% and not at exactly 10%; a freshness alert firing above 60 days and not at exactly 60; multiple simultaneous alerts; zero alerts when nothing breaches either rule

### Technical Overview

Concentration Risk reuses each holding's already-summed `total_weight_percentage` — no new computation, just a second pass over the same `holdings` list already built. Data Freshness Risk reuses each ETF's `snapshot_date`, already selected per contribution row by the existing query (via the `ix_etf_holdings_etf_id_snapshot_date` index); dedupe by `etf_id` the same way `etf_values` is already deduped, so each stale ETF gets exactly one alert regardless of how many stocks it holds. This is deliberately per-ETF, not per-stock: a stock's total exposure still sums normally across all its contributing ETFs regardless of freshness, so a freshness alert names the specific stale ETF rather than fanning out into one alert per stock that ETF happens to touch.

---

## TASK-3 — Dashboard Alert Banner & Badge

**GitHub Issue:** #{number}
**Effort estimate:** 1.5 FTE-days

### Scope

Render both alert types on `/tabularium/portfolio` as one collapsible panel (badge when collapsed, banner when expanded), and consolidate the three existing components that independently hardcode the 10% warning threshold to consume the backend's alert list instead.

### Goal

A user sees active risk warnings without scrolling or interacting, and the "is this stock over the limit" decision is defined in exactly one place (the backend) instead of three.

### Deliverables

- `frontend/app/(tabularium)/tabularium/portfolio/components/RiskAlertPanel.tsx` — new component; renders nothing when `alerts` is empty; collapsed state shows an alert count summary, expanded state lists each `RiskAlert` message; reuses the `▸`/`▾` collapsible-header pattern already shipped for `ConcentrationAlertBadge`/`HoldingsTreemap`; defaults expanded when `alerts.length > 0`
- `frontend/app/(tabularium)/tabularium/portfolio/components/PortfolioPageClient.tsx` — mounts `<RiskAlertPanel>` above `ConcentrationAlertBadge`; `HoldingsExposureResponse`/adds `RiskAlert` to the exported TypeScript interfaces mirroring the backend schema
- `frontend/app/(tabularium)/tabularium/portfolio/components/ConcentrationAlertBadge.tsx`, `HoldingsBarChart.tsx`, `HoldingsTreemap.tsx` — each replaces its local `total_weight_percentage > WARNING_THRESHOLD_PCT` check with a membership check against `exposureData.alerts` (matched by the same `stock_isin ?? stock_ticker ?? stock_name` key already used elsewhere as `holdingKey`)

### Technical Overview

The panel is one component playing both roles (badge collapsed, banner expanded), not two separate components, since collapsed/expanded is exactly the interaction already established for `ConcentrationAlertBadge`/`HoldingsTreemap` — reusing it here avoids a second, parallel show/hide mechanism. Styling reuses the existing `roman-terracotta` warning color and `TriangleAlert` icon already used by `ConcentrationAlertBadge`, not a new visual vocabulary. Each of the three existing components' own `WARNING_THRESHOLD_PCT` constant and comparison is removed once its warning-coloring condition is rewired to the alert-list membership check, so `10` is compared against `total_weight_percentage` in exactly one place (TASK-2's backend rule) after this task lands.

---

## GitHub Issues

### Milestone 1 — Risk Rule Evaluation Engine

**Tasks:** TASK-1, TASK-2
**Effort:** 1.5 FTE-days

#### Scope

Fixing the cache-invalidation gap that blocks real-time re-evaluation, and deriving both Concentration Risk and Data Freshness Risk alerts inside the existing look-through exposure aggregation.

#### Goal

The dashboard has a correct, always-fresh, alert-annotated data source to render from before any frontend work begins.

#### Deliverables

- `revalidateTag('holdings-exposure')` wired into every transaction, price, and holdings-upload mutation path
- `RiskAlert` schema and `alerts` field on `HoldingsExposureResponse`
- Concentration Risk and Data Freshness Risk rule derivation in `get_holdings_exposure`
- Rule engine tests (threshold boundaries, multiple alerts, zero alerts)

---

### Milestone 2 — Dashboard Alert Banner & Badge

**Tasks:** TASK-3
**Effort:** 1.5 FTE-days

#### Scope

The collapsible alert badge/banner panel on `/tabularium/portfolio`, and consolidating the existing dashboard components onto the backend's alert list as the single source of truth for the 10% warning threshold.

#### Goal

Users see active concentration and staleness warnings on the dashboard without scrolling or interacting, and the warning-threshold logic is no longer duplicated across three components.

#### Deliverables

- Alert Badge/Banner panel (`RiskAlertPanel.tsx`)
- `ConcentrationAlertBadge`, `HoldingsBarChart`, `HoldingsTreemap` rewired to the backend alert list
