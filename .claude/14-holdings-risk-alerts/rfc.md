# \[RFC\] Holdings Risk Alerts — Aerarium Saturni

| Author          | Simone Porreca                                                           |
| :--------------- | :------------------------------------------------------------------------ |
| **Project**     | Aerarium Saturni                                                         |
| **RFC status**  | Draft                                                                    |
| **GitHub repo** | [Volscente/aerarium-saturni](https://github.com/Volscente/aerarium-saturni) |

### Timeline

| Date       | Status | Note |
| :--------- | :----- | :--- |
| 2026-09-01 | Draft  |      |
| 2026-09-15 | —      | Review deadline (no deadline given; defaulted to 14 days from draft date) |

### Table of contents

[Motivation](#motivation)

[Objectives](#objectives)

[Scope](#scope)

[Holdings Risk Alerts](#holdings-risk-alerts)

[Tech Stack](#tech-stack)

[Effort Estimations](#effort-estimations)

[FAQs](#faqs)

[Risks & Open Questions](#risks--open-questions)

[References](#references)

---

## Motivation {#motivation}

Portfolios drift over time due to market price swings, new buy/sell transactions, or periodic ETF index rebalances — a stock that was a safe 4% of the combined portfolio can silently cross a risky concentration threshold, or a holdings snapshot can quietly become stale, and today nothing on the dashboard tells the user this happened without them re-checking the numbers themselves. There is no automated mechanism that evaluates risk conditions against the already-computed look-through exposure data and proactively surfaces them; the user must remember to look.

## Objectives {#objectives}

- **Fix the cache-invalidation gap that blocks "real-time" from being possible at all**: none of the three named trigger events (transaction changes, price changes, holdings uploads) currently call `revalidateTag('holdings-exposure')` — confirmed by inspecting `actions.ts`, `etf-actions.ts`, and the holdings-upload route handler, none of which reference that tag today. Every subsequent objective depends on this being fixed first, or "real-time re-evaluation" is not achievable regardless of how the rules themselves are implemented.
- **Compute two risk rules server-side, reusing the existing aggregation**: Concentration Risk (`total_weight_percentage > 10` per stock) and Data Freshness Risk (`snapshot_date` more than 60 days old per owned ETF), both derived inside the existing `get_holdings_exposure` computation with no new query and no second network round-trip.
- **Consolidate the "10% warning" threshold into one source of truth**: today `WARNING_THRESHOLD_PCT = 10` is independently hardcoded in three separate frontend components (`ConcentrationAlertBadge.tsx`, `HoldingsBarChart.tsx`, `HoldingsTreemap.tsx`). This RFC makes the backend-computed alert list the single source of truth for "is this stock over the limit," which those three components can consume instead of re-deriving it themselves.
- **Surface both alert types on `/tabularium/portfolio` as a non-intrusive banner and a compact badge**: a single collapsible alert panel, reusing the collapsible-header interaction already established for the Concentration Alert Badge and Treemap sections shipped in the Holdings Data Visualisation initiative — collapsed to a compact badge-style summary by default, expandable to the full banner listing each active alert.
- **Do not introduce new infrastructure**: "real-time" is delivered by making sure every trigger event correctly invalidates the cache so the next render is always fresh — not by adding a WebSocket server, a polling loop, or a message queue, none of which exist in this stack today.

## Scope {#scope}

**In-Scope:**

- Concentration Risk alert rule: a single stock's total look-through weighted exposure exceeds 10%
- Data Freshness Risk alert rule: any held ETF's latest holdings snapshot_date is more than 60 days old
- Automatic re-evaluation of both rules on transaction changes (Event A), price changes (Event B), and holdings CSV/XLSX uploads (Event C)
- In-app warning banner and alert badge surfaced on the `/tabularium/portfolio` dashboard
- Fixing the missing `revalidateTag('holdings-exposure')` wiring across all three trigger events, since it is a prerequisite for the "real-time" objective

**Out-of-Scope:**

- **Email/push/Slack notifications**: Notification Delivery is explicitly in-app only for this phase.
- **User-configurable thresholds**: the 10% and 60-day limits are fixed constants per the given rule definitions, not settings.
- **Historical alert log or audit trail of past breaches**: not requested; a future phase if needed.

**Constraints:**

- Notification delivery is in-app only (warning banner + alert badge) — no email, push, or external notification channel.
- Thresholds are fixed at 10% (concentration) and 60 days (freshness) exactly as specified — not user-configurable in this phase.
- No new persistent infrastructure dependency (message queue, WebSocket server, cron scheduler): the existing Server-Component fetch-per-request model, correctly cache-invalidated, is sufficient to satisfy "real-time re-evaluation on update" as defined below.

---

# **Holdings Risk Alerts** {#holdings-risk-alerts}

## Approach Overview {#approach-overview}

The proposal's stated direction — re-evaluate automatically on the three named trigger events rather than on a fixed schedule — is adopted as-is, but investigation surfaced that this app cannot currently do so at all: `holdings-exposure` is a Next.js fetch cache tag introduced when the Concentration Dashboard UI was built, but no Server Action or route handler that mutates transactions, prices, or holdings ever calls `revalidateTag('holdings-exposure')`. Today, after any of the three events, the dashboard can keep showing pre-mutation numbers until Next.js's default cache eventually expires on its own. This is a pre-existing gap, not something introduced by this RFC, but it means Milestone 1 must fix it before any alert built on top of that data can be meaningfully "real-time." "Real-time" in this design means: the alert list (and the rest of the dashboard) is recomputed from live database state on the very next render after any of the three events, because the cache was correctly invalidated — not a push notification to an already-open tab, which would require infrastructure this stack does not have and which the Constraints section rules out introducing.

With that fixed, both rules are computed entirely inside the existing `get_holdings_exposure` function in `routers/portfolio.py`, using values it already has in memory: Concentration Risk reuses each holding's already-summed `total_weight_percentage`; Data Freshness Risk reuses each owned ETF's `snapshot_date`, already selected per contribution row by the existing query. Both are attached to the existing `HoldingsExposureResponse` as a new `alerts: list[RiskAlert]` field, so the frontend gets alerts in the same fetch it already makes — no new endpoint, no second round-trip. The frontend renders `alerts` through one new collapsible component that plays the role of both the "badge" (collapsed: alert count + worst severity) and the "banner" (expanded: one line per alert), reusing the exact expand/collapse header pattern already shipped for `ConcentrationAlertBadge`/`HoldingsTreemap` rather than inventing a new interaction. The three existing components that independently hardcode `WARNING_THRESHOLD_PCT = 10` (badge, bar chart, treemap) are updated to instead check "is this stock's key present in the concentration alerts list," so the 10% line is defined once, on the backend, not four times across the codebase.

### Fixing the missing cache invalidation (prerequisite) {#fixing-the-missing-cache-invalidation}

- `app/(tabularium)/tabularium/actions.ts` — `createTransaction`, `updateTransaction`, `deleteTransaction` each already call `revalidateTag('transactions')` and `revalidateTag('portfolio-overview')`; add `revalidateTag('holdings-exposure')` alongside them, since a transaction change alters net ETF quantities and therefore look-through exposure.
- `app/(tabularium)/tabularium/etf-actions.ts` — `createEtf`, `updateEtf`, `deleteEtf`, `addPriceSnapshot`, `updatePriceSnapshot`, `deletePriceSnapshot` each already call `revalidateTag('etfs')` and `revalidateTag('portfolio-overview')`; add `revalidateTag('holdings-exposure')` to all of them for the same reason `portfolio-overview` is already invalidated uniformly across all six, rather than reasoning case-by-case about which ones "really" affect exposure.
- `app/api/etfs/[id]/holdings/upload/route.ts` — this is a plain Route Handler (not a Server Action), but `revalidateTag` is a general Next.js server API usable there too; call `revalidateTag('holdings-exposure')` after a successful upload response, alongside a new `revalidateTag('portfolio-overview')` (holdings weight changes affect neither total_invested nor current_value directly, but a new snapshot_date affects Data Freshness Risk specifically, which lives on the same tag).

### Risk Rule Evaluation Engine {#risk-rule-evaluation-engine}

- **New schema** — `schemas/portfolio.py` gains `RiskAlert` (`rule: Literal["concentration_risk", "data_freshness_risk"]`, `message: str`, plus rule-specific context fields: `stock_isin`/`stock_ticker`/`stock_name`/`total_weight_percentage` for concentration alerts, `etf_ticker`/`etf_name`/`snapshot_date`/`days_stale` for freshness alerts). `HoldingsExposureResponse` gains `alerts: list[RiskAlert] = Field(default_factory=list)`.
- **Concentration Risk**: after `holdings` is built and sorted in `get_holdings_exposure`, iterate it once more and emit one `RiskAlert` per holding where `total_weight_percentage > CONCENTRATION_THRESHOLD_PCT` (a module-level constant, `10`, matching the same strict `>` convention already established across the frontend's badge/bar-chart/treemap coloring).
- **Data Freshness Risk**: the existing per-row query already selects each ETF's own `snapshot_date` (the latest per `etf_id`, via the existing `ix_etf_holdings_etf_id_snapshot_date` index). Dedupe by `etf_id` the same way `etf_values` already is, and for each distinct owned ETF where `date.today() - snapshot_date > timedelta(days=FRESHNESS_THRESHOLD_DAYS)` (`FRESHNESS_THRESHOLD_DAYS = 60`), emit one `RiskAlert`. This is deliberately per-ETF, not per-stock: a stock's `total_weight_percentage` still reflects all its contributing ETFs regardless of freshness (computation is not blocked by staleness), and a freshness alert names the specific stale ETF rather than every stock it happens to touch — a stock held across three ETFs where only one is stale gets zero freshness alerts attached to it directly; the alert is attached to the ETF.
- Both rule constants live next to each other at the top of `routers/portfolio.py`, mirroring how `WARNING_THRESHOLD_PCT` already sits at the top of each frontend component file today.

### Dashboard Alert Banner & Badge {#dashboard-alert-banner-badge}

- **New component** — `frontend/app/(tabularium)/tabularium/portfolio/components/RiskAlertPanel.tsx`, mounted in `PortfolioPageClient.tsx` above `ConcentrationAlertBadge` (risk warnings take visual priority over the informational badge). Renders nothing when `alerts` is empty — consistent with `ConcentrationAlertBadge`'s existing null-when-nothing-to-show behavior.
- Collapsed state (the "badge"): a compact single line — alert count plus the two rule types present (e.g. "⚠ 2 alerts: 1 concentration, 1 stale holding") — using the same `▸`/`▾` clickable-header pattern as `ConcentrationAlertBadge`/`HoldingsTreemap`. Defaults to **expanded** when `alerts.length > 0` (an active warning should be seen without an extra click, mirroring why the Concentration Alert Badge itself defaults open) and simply doesn't render at all when there are no alerts.
- Expanded state (the "banner"): one line per `RiskAlert`, styled with the existing `roman-terracotta` warning color and `TriangleAlert` icon already used by `ConcentrationAlertBadge`, not a new color/icon vocabulary.
- `ConcentrationAlertBadge.tsx`, `HoldingsBarChart.tsx`, `HoldingsTreemap.tsx` each currently define their own `WARNING_THRESHOLD_PCT = 10` and independently check `total_weight_percentage > WARNING_THRESHOLD_PCT`. Each is updated to instead check membership in `exposureData.alerts` (matching by the same `stock_isin ?? stock_ticker ?? stock_name` key already used as `holdingKey` elsewhere), so all four surfaces agree by construction — the backend's `RiskAlert` list is the only place `10` is ever compared against `total_weight_percentage`.

## Tech Stack {#tech-stack}

- **FastAPI / Pydantic v2**: existing backend framework; `RiskAlert` follows the same schema pattern as `HoldingContribution`.
- **SQLAlchemy (async)**: no new query — freshness and concentration data are both already selected by the existing `_build_holdings_exposure_query()`.
- **Next.js (App Router / Server Components)**: `revalidateTag` is an existing Next.js API already used throughout `actions.ts`/`etf-actions.ts`; this RFC adds calls to it, not a new dependency.
- **React**: `RiskAlertPanel.tsx` follows the existing `useState`-based collapsible pattern already shipped for `ConcentrationAlertBadge`/`HoldingsTreemap` — no new state-management library.

No new external dependency is introduced by this initiative.

## Effort Estimations {#effort-estimations}

Total estimated effort: **{N} sessions**.

| Milestone                                     | Description                                                                                          | Est. effort | GitHub Issue |
| :--------------------------------------------- | :---------------------------------------------------------------------------------------------------- | :---------- | :----------- |
| M1 — Risk Rule Evaluation Engine                | Fix the missing `revalidateTag('holdings-exposure')` wiring; `RiskAlert` schema; concentration + freshness rule derivation in `get_holdings_exposure`; tests | {N}         | #{issue}     |
| M2 — Dashboard Alert Banner & Badge             | `RiskAlertPanel.tsx`; wire the three existing components to the backend-provided alert list instead of their own hardcoded threshold checks | {N}         | #{issue}     |

### Recommended Order

1. M1 — Risk Rule Evaluation Engine (the dashboard has nothing to render, and "real-time" is impossible, until the cache-invalidation fix and rule derivation exist)
2. M2 — Dashboard Alert Banner & Badge (depends on the `alerts` field M1 adds to the response)

---

# **FAQs** {#faqs}

**Q: Why extend the existing `GET /portfolio/holdings/exposure` response instead of adding a new `/portfolio/alerts` endpoint?**

A: Both rules are derived from data that endpoint already computes (`total_weight_percentage`, `snapshot_date`). A separate endpoint would either duplicate that computation or require the frontend to make two requests and reconcile them client-side. Reusing the one response keeps rule derivation and the data it's derived from in the same place, and the frontend already fetches this endpoint on every page load via the existing `holdings-exposure` cache tag.

**Q: Why fix `revalidateTag` wiring as part of this RFC instead of filing it separately?**

A: It was discovered while designing this RFC's "real-time re-evaluation" objective, and that objective is unachievable without it — an alert engine built on top of a cache tag nothing ever invalidates would just be as stale as the dashboard already silently is today. It's a small, mechanical fix (add one `revalidateTag` call to nine existing functions across two files, plus one route handler), not a separate initiative's worth of work, so it ships as Milestone 1's prerequisite rather than blocking this RFC on an external fix landing first.

**Q: Why consolidate the "10% warning" threshold into the backend's alert list instead of leaving the three frontend components as they are and just adding a fourth check for the new banner?**

A: The three components already duplicate the same constant and comparison independently; adding a fourth independent copy for the alert panel would mean five places (once here, plus this RFC's own concentration rule) all encoding "10%" and all capable of silently drifting out of sync if one is ever changed without the others. Since this RFC already needs a canonical, backend-computed answer to "is this stock over the limit" for the alert rule itself, having the existing components consume that same answer removes duplication instead of adding to it.

**Q: Why is Data Freshness Risk per-ETF rather than per-stock, given a stock's exposure blends multiple ETFs?**

A: A stock's `total_weight_percentage` already correctly sums contributions from every ETF that holds it, stale or not — computation isn't gated on freshness. Staleness is a property of one ETF's holdings snapshot, not of any particular stock, so naming the stale ETF directly (rather than every stock that happens to pass through it) is both more precise and avoids one stale ETF fanning out into dozens of near-duplicate per-stock freshness alerts.

**Q: Terminology?**

A:
- **Concentration Risk** → the risk that a single stock represents too large a share of the combined portfolio's value, measured here as look-through weighted exposure exceeding 10%.
- **Data Freshness Risk** → the risk that a decision is being made on outdated holdings data, measured here as an ETF's holdings snapshot being more than 60 days old.
- **Look-through exposure** → a stock's true weight in the combined portfolio, computed by summing its weight within each owned ETF, scaled by that ETF's weight in the portfolio (see the Holdings Data Visualisation initiative).

---

## Risks & Open Questions {#risks--open-questions}

| Risk / Question                                                                 | Likelihood | Mitigation / Answer |
| :--------------------------------------------------------------------------------- | :--------- | :------------------- |
| The `holdings-exposure` cache tag is never invalidated by any of the three trigger events today — confirmed by inspecting `actions.ts`, `etf-actions.ts`, and the holdings-upload route handler | Certain (already confirmed) | Milestone 1 explicitly wires `revalidateTag('holdings-exposure')` into all nine mutation functions plus the upload route handler; verified manually by mutating each of the three event types and confirming the dashboard reflects the change on next render with no stale cache. |
| "Real-time" is ambiguous in a Server-Component/on-request architecture with no live push channel — a user with the dashboard already open in a tab will not see an alert appear without navigating or reloading | Medium | Defined explicitly in this RFC as "correctly cache-invalidated so the next render is fresh," not "pushed to an open tab." This matches the Constraints section's rejection of new infrastructure (WebSocket/polling); flagged here as an accepted limitation rather than left ambiguous. |
| Consolidating the frontend's three independent `WARNING_THRESHOLD_PCT` checks into a backend-alert-list lookup touches three already-shipped, tested components (`ConcentrationAlertBadge`, `HoldingsBarChart`, `HoldingsTreemap`) | Low | Each component's own rendering and layout are unchanged — only the boolean condition that decides warning-vs-default coloring is swapped from a local `> 10` comparison to an alert-list membership check; existing manual verification scenarios (see `.claude/13-holdings-data-visualisation/validation-scenarios.md`) already cover the >10%/exactly-10% boundary and can be re-run unchanged. |
| A stock or ETF could plausibly trigger both rule types at once (a concentrated stock inside a stale ETF) | Low | Not mutually exclusive by design — both alerts are independently derived and both are rendered; the panel lists every active alert rather than picking one per stock/ETF. |

## References {#references}

- [13-holdings-data-visualisation initiative](../13-holdings-data-visualisation/rfc.md)
- [Volscente/aerarium-saturni](https://github.com/Volscente/aerarium-saturni)
