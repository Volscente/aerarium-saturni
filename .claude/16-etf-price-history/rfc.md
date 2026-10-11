# \[RFC\] ETF Price History — Aerarium Saturni

| Author          | Simone Porreca                                                                                                  |
| :-------------- | :-------------------------------------------------------------------------------------------------------------- |
| **Project**     | Aerarium Saturni                                                                                                |
| **RFC status**  | Draft (2026-10-11)                                                                                              |
| **Notion page** | [ETF Price History](https://app.notion.com/p/16-ETF-Price-History-3f65cc6c0f0780ac9bbfe316750fcac2)             |
| **Milestone**   | [Milestone: 16-etf-price-history](https://github.com/Volscente/aerarium-saturni/milestone/12)                   |

### Table of contents

[Motivation](#motivation)

[Objectives](#objectives)

[Scope](#scope)

[ETF Price History](#etf-price-history)

[Tech Stack](#tech-stack)

[FAQs](#faqs)

[Risks & Open Questions](#risks--open-questions)

[References](#references)

---

## Motivation {#motivation}

ETF prices are entered by hand, one snapshot at a time, through the ETF Registry page. This is tedious and error-prone, leaves the price history sparse, and degrades every feature that depends on current valuations (portfolio overview, look-through exposure). The registry also offers no way to see how an ETF's price has evolved: history is only visible as a drop-down table under each entry, which supports neither visual nor cross-ETF comparison. The solution must retrieve prices from a free-of-charge external source and fit within the existing Tabularium structure and Lighthouse budget. For full context, see the [Notion initiative page](https://app.notion.com/p/16-ETF-Price-History-3f65cc6c0f0780ac9bbfe316750fcac2).

## Objectives {#objectives}

- **Automate price retrieval**: a single backend operation fetches the latest price and the full available history for any registered ETF from a free external provider and stores it in `etf_price_history`, with no manual price input.
- **Enable on-demand updates from the registry**: the ETF Registry page exposes one button that updates all ETFs by default or a user-selected subset of the registry's existing ETF list, and reports per-ETF success or failure.
- **Remove manual price handling**: manual price entry/editing and the per-row drop-down history table no longer exist in the ETF Registry page.
- **Visualise price evolution**: a Timeline Chart on the ETF Registry page plots the price series of a selected ETF and can overlay several ETFs for comparison.
- **Preserve data integrity and performance**: repeated updates never create duplicate daily rows, dependent dashboards refresh after an update, and `/tabularium/portfolio` keeps a Lighthouse performance score ≥ 90.

## Scope {#scope}

**In-Scope:**

- Automated retrieval of ETF prices and full price history
- Trigger button on the ETF Registry page, defaulting to all ETFs with the option to select specific ones
- Removal of manual price entry from the ETF Registry page
- Removal of the per-ETF drop-down price history table from the ETF Registry page
- Timeline Chart on the ETF Registry page showing the price series of one or multiple selected ETFs

**Constraints:**

- The trigger must live in the ETF Registry page and offer all ETFs by default, with per-ETF selection.
- The ETF list used for selection is the one already present in the ETF Registry.
- Manual price modification and the per-ETF history drop-down must be removed from the ETF Registry page.
- Existing invariants still apply: the Tabularium keeps exactly two sub-routes, schema changes go through Alembic, and any write path must revalidate the `etfs`, `portfolio-overview` and `holdings-exposure` cache tags.
- Frontend Lighthouse performance score must remain ≥ 90.
- The external provider of the ETF information must be free of charge.

---

# **ETF Price History** {#etf-price-history}

## Approach Overview {#approach-overview}

The user presses an "Update prices" control in the ETF Registry tab. A Server Action calls a new backend endpoint with the selected ETF ids (or none, meaning all). For each ETF the backend resolves a provider symbol, requests daily prices from an external provider through a small provider-adapter interface, and upserts the result into `etf_price_history`. The first run for an ETF requests the full available history; later runs request only the range after the latest stored date. The endpoint returns a per-ETF result (`updated` / `failed`, rows written, error message) so one failing ETF never aborts the rest. When the Server Action completes it revalidates `etfs`, `portfolio-overview` and `holdings-exposure`.

The registry UI loses `PriceUpdateButton` and the expandable history sub-table. In their place a Timeline Chart sits above the registry table; ETFs are chosen from the same list, and each selected ETF's series is loaded through the existing `fetchPriceHistory` Server Action (cached client-side per ETF) and plotted.

**Relation to the proposal's direction:** the stated direction (backend retrieval from an external source, on-demand trigger, chart replacing the table) is adopted as-is. Two refinements are added: (1) the provider is hidden behind an adapter because the free-provider choice is still open and free sources are the least stable dependency in the design; (2) multi-ETF comparison defaults to a rebased view (each series indexed to 100 at the start of the common range), since raw prices of different ETFs are not visually comparable, with a toggle for absolute prices.

## Provider adapter and symbol resolution {#provider-adapter-and-symbol-resolution}

A `PriceProvider` interface exposes one operation: given a provider symbol and an optional start date, return daily `(date, close, currency)` points. A first adapter is implemented with `httpx` (already a runtime dependency) against a free, keyless source; the leading candidate is Yahoo Finance's public chart data, with Stooq as the fallback candidate. Neither is an official, contractually guaranteed API, which is why the choice is isolated behind the adapter and listed as an open question.

Registered ETFs carry a `ticker` and `isin` but UCITS funds trade on several exchanges under different symbols, so a bare ticker is ambiguous for any provider. The design adds a nullable `price_symbol` column to `etfs` (Alembic migration 005), defaulting to `ticker` when empty, so the symbol used for retrieval is explicit and editable in the ETF form rather than guessed.

## Storage and idempotency {#storage-and-idempotency}

Retrieved points are stored in the existing `etf_price_history` table. To make repeated updates safe, the migration adds a uniqueness guarantee on `(etf_id, trading day)` and the writer performs an upsert, so overlapping ranges and re-runs never duplicate rows. The migration must first collapse any existing manual snapshots that fall on the same day for the same ETF (keeping the most recent). Retrieved data overwrites a manual snapshot for the same day; the exact collapse rule is to be confirmed during implementation. Currency is stored as reported by the provider and compared against the ETF's own currency; a mismatch is reported as a failure for that ETF instead of being stored.

## Update endpoint {#update-endpoint}

`POST /etfs/prices/refresh` accepts an optional list of ETF ids (absent or empty = all ETFs) and returns a list of per-ETF results. Updates run with bounded concurrency to respect provider rate limits and stay within a single request for the expected registry size (tens of ETFs). Unknown ids return 404; provider failures are reported per ETF in the response body, not as a request-level error. The existing `POST /etfs/{id}/price` endpoint is left in place on the backend in this RFC (only its UI is removed), to keep the change surgical; retiring it can follow separately.

## Registry UI changes {#registry-ui-changes}

- **Update control**: an "Update prices" button with a multi-select over the registry's ETFs (all selected by default), a pending state while the Server Action runs, and an inline per-ETF result summary. Mounted within the ETF Registry tab, so no new Tabularium sub-route is introduced.
- **Removals**: `PriceUpdateButton`, the expandable history row and its `priceHistoryMap` state in `EtfRegistryTable`; the `addPriceSnapshot`, `updatePriceSnapshot` and `deletePriceSnapshot` Server Actions become unused and are removed.
- **Timeline Chart**: a `'use client'` SVG line chart following the project's existing precedent of lightweight, dependency-minimal charts (`HoldingsBarChart` is plain HTML/CSS; `HoldingsTreemap` uses only `d3-hierarchy`'s layout). It supports multi-series overlay with a legend, a hover tooltip with date and value, and the rebased/absolute toggle. It reuses the `roman-*` Tailwind tokens and renders an empty state for ETFs without history.

## Milestone 1 {#milestone-1}

{Description}

## Milestone 2 {#milestone-2}

{Description}

## Tech Stack {#tech-stack}

- **Python / FastAPI**: hosts the refresh endpoint and the provider adapter, alongside the existing ETF router.
- **SQLAlchemy (async)**: performs the per-ETF upsert into `etf_price_history` within the existing session-per-request pattern.
- **PostgreSQL**: enforces the `(etf_id, trading day)` uniqueness that makes repeated updates idempotent.
- **Alembic**: carries the `price_symbol` column and uniqueness constraint; required because new schema changes must not use `create_all()`.
- **httpx**: already a runtime dependency; the free-provider adapter reuses it, so no new HTTP client is added.
- **Next.js 15**: the Server Action triggers the update and revalidates cache tags; the Timeline Chart lives in the existing ETF Registry tab.
- **Tailwind CSS**: styles the chart and controls with the existing `roman-*` tokens.
- **Zod**: validates the refresh request (ETF id selection) in the Server Action, matching `etf-actions.ts`.

---

# **FAQs** {#faqs}

**Q: Why a provider adapter instead of calling one source directly?**

A: Free market-data sources are unofficial or rate-limited and can change without notice. The adapter confines that fragility to one module, so swapping providers does not touch the endpoint, schema or UI.

**Q: Why is the update synchronous rather than a background job?**

A: The registry is small and the user triggers updates deliberately, so a single request with bounded concurrency and per-ETF results is the simplest design. If the provider proves too slow, moving to a job with polling is the escalation path.

**Q: Why rebase multi-ETF comparisons to 100 by default?**

A: ETFs trade at very different price levels, so overlaying raw prices hides relative performance. The absolute view stays available through the toggle.

**Q: Why remove the manual price path entirely?**

A: Keeping it would mix manual and retrieved values for the same day and defeat the goal of freeing the user from data entry. The consequence is no fallback when the provider is down (see Risks).

**Q: Terminology?**

A: Terms used in this RFC:

- ETF → Exchange-Traded Fund
- UCITS → Undertakings for Collective Investment in Transferable Securities, the EU fund regulatory framework
- ISIN → International Securities Identification Number
- SVG → Scalable Vector Graphics, used to draw the Timeline Chart

---

## Risks & Open Questions {#risks--open-questions}

| Risk / Question | Likelihood | Mitigation / Answer |
| :-- | :-- | :-- |
| Free provider is unofficial, rate-limited, or changes/removes access; availability, UCITS/multi-exchange coverage and terms of use are unverified | High | Isolate behind `PriceProvider`; verify coverage against the registered ETFs (EUNL, VWCE, LYP6, …) before committing to a provider; keep Stooq as fallback candidate |
| Provider symbol for a UCITS ETF is ambiguous across exchanges, yielding wrong or missing data | Medium | Explicit `price_symbol` column, editable in the ETF form; report unresolved symbols per ETF |
| Fetching long histories for many ETFs is slow or hits rate limits in a single request | Medium | Incremental fetch after the latest stored date; bounded concurrency; escalate to a background job if needed |
| Existing manual snapshots overlap with retrieved data (same-day duplicates, currency or source differences) | Medium | Collapse same-day duplicates in the migration; upsert with retrieved data winning; fail the ETF on currency mismatch |
| Removing manual entry leaves no fallback when the provider is down or lacks an ETF | Medium | Per-ETF error reporting; existing stored history stays visible and used by valuations; revisit a manual override only if it proves necessary |
| Chart component regresses the Lighthouse ≥ 90 budget on `/tabularium/portfolio` | Low | Hand-rolled SVG (optionally `d3-scale`/`d3-shape` only); no charting runtime; run `lhci` in CI |
| Open question: should prices also refresh automatically on a schedule? | — | Out of this RFC (trigger is on-demand per the initiative); revisit after the manual trigger is in use |
| Open question: keep or retire the backend `POST /etfs/{id}/price` endpoint? | — | Kept for now; decide in a follow-up once nothing in the UI uses it |

## References {#references}

- [ETF Price History — Notion initiative page](https://app.notion.com/p/16-ETF-Price-History-3f65cc6c0f0780ac9bbfe316750fcac2)
- [Milestone: 16-etf-price-history](https://github.com/Volscente/aerarium-saturni/milestone/12)
