# ETF Price History — High-Level Planning

**Project:** Aerarium Saturni
**GitHub Milestone:** [16-etf-price-history](https://github.com/Volscente/aerarium-saturni/milestone/12)
**Notion page:** [ETF Price History](https://app.notion.com/p/16-ETF-Price-History-3f65cc6c0f0780ac9bbfe316750fcac2)
**Total estimated effort:** 7 FTE-days (1 FTE = 1 day)

---

## Overview

This initiative replaces manual ETF price entry with automated retrieval of prices and full history from a free external provider, triggered on demand from the ETF Registry page. Technically it adds a provider adapter, an idempotent refresh endpoint and a schema migration to the backend, and in the frontend replaces the manual price form and per-row history table with an "Update prices" control and a multi-ETF Timeline Chart.

### Dependency Order

```txt
TASK-1 ──► TASK-2 ──► TASK-3 ──► TASK-4
```

TASK-4 depends only on the existing price-history read path, but it edits the same `EtfRegistryTable` as TASK-3, so it is sequenced after it to avoid conflicts.

---

## TASK-1 — Price Schema Migration

**GitHub Issue:** [Automated Price Retrieval](https://github.com/Volscente/aerarium-saturni/issues/75)
**Effort estimate:** 1 FTE-days

### Scope

Alembic migration and ORM/schema updates for the `etfs` and `etf_price_history` tables: an explicit provider symbol and a per-day uniqueness guarantee on price rows.

### Goal

A database that can safely accept repeated, overlapping price updates without duplicate daily rows, and an ETF record that carries the symbol used for retrieval.

### Deliverables

- `backend/alembic/versions/006_*.py` — adds nullable `price_symbol` to `etfs`; collapses same-day `etf_price_history` rows per ETF (keeping the most recent); adds uniqueness on `(etf_id, trading day)`
- `src/backend/models.py` — `Etf.price_symbol` and the matching constraint on `EtfPriceHistory`
- `src/backend/schemas/etfs.py` — `price_symbol` added to `EtfCreate`, `EtfUpdate` and `EtfResponse`
- `src/backend/routers/etfs.py` — `POST /etfs/{id}/price` and `PUT /etfs/{id}/price/{price_id}` return 409 instead of 500 on a same-day collision
- `tests/` — schema tests for the new field and the 409 mapping

### Technical Overview

`price_symbol` defaults to `ticker` when empty. The migration must be reversible and must run from the host (the backend image does not ship `alembic/`). The exact same-day collapse rule is to be confirmed during implementation.

---

## TASK-2 — Provider Adapter and Refresh Endpoint

**GitHub Issue:** [Automated Price Retrieval](https://github.com/Volscente/aerarium-saturni/issues/75)
**Effort estimate:** 2.5 FTE-days

### Scope

A `PriceProvider` interface with a first free, keyless adapter built on `httpx`, and a `POST /etfs/prices/refresh` endpoint that fetches, validates and upserts prices per ETF.

### Goal

One backend call that updates all or selected ETFs, fetching full history on the first run and only the range after the latest stored date afterwards, and reporting per-ETF results without one failure aborting the rest.

### Deliverables

- `src/backend/providers/` — `PriceProvider` interface returning daily `(date, close, currency)` points, plus the first free-provider adapter (Yahoo Finance candidate, Stooq as fallback candidate)
- `src/backend/routers/etfs.py` — `POST /etfs/prices/refresh` accepting an optional ETF id list (absent or empty = all); 404 for unknown ids
- `src/backend/schemas/etfs.py` — refresh request and per-ETF result models (`updated` / `failed`, rows written, error message)
- `tests/providers/`, `tests/routers/test_etfs.py` — adapter parsing, upsert idempotency, incremental range, currency-mismatch failure, partial-failure, and 404 tests with a mocked HTTP client

### Technical Overview

Updates run with bounded concurrency in a single synchronous request. Writes use an upsert on `(etf_id, trading day)`, with retrieved data winning over an existing manual snapshot. A currency different from the ETF's own is reported as a failure for that ETF and not stored. Provider coverage of the registered ETFs (e.g. EUNL, VWCE, LYP6) must be verified before committing to the first adapter. The existing `POST /etfs/{id}/price` endpoint is left unchanged.

---

## TASK-3 — Update Prices Control and Manual Price Removal

**GitHub Issue:** [Registry UI and Timeline Chart](https://github.com/Volscente/aerarium-saturni/issues/76)
**Effort estimate:** 1.5 FTE-days

### Scope

Frontend trigger for the refresh, removal of manual price entry and the per-row history table from the ETF Registry, and exposure of `price_symbol` in the ETF form.

### Goal

The user can update all ETFs or a chosen subset from the ETF Registry tab, sees per-ETF results, and no longer has any manual price path in the UI.

### Deliverables

- `app/(tabularium)/tabularium/etf-actions.ts` — `refreshEtfPrices` Server Action (Zod-validated ETF id selection) calling the backend and revalidating `etfs`, `portfolio-overview` and `holdings-exposure`; removal of `addPriceSnapshot`, `updatePriceSnapshot` and `deletePriceSnapshot`
- `app/(tabularium)/tabularium/components/` — "Update prices" button with multi-select over the registry's ETFs (all selected by default), pending state and inline per-ETF result summary, mounted in the ETF Registry tab
- `app/(tabularium)/tabularium/components/EtfRegistryTable.tsx` — removal of the expandable history row and its `priceHistoryMap` state
- `app/(tabularium)/tabularium/components/PriceUpdateButton.tsx` — deleted
- `app/(tabularium)/tabularium/components/EtfForm.tsx`, `etf-schema.ts` — `price_symbol` field

### Technical Overview

No new Tabularium sub-route is introduced. `fetchPriceHistory` is retained because TASK-4 reuses it. The selection list is the registry's existing ETF list passed through props.

---

## TASK-4 — Timeline Chart

**GitHub Issue:** [Registry UI and Timeline Chart](https://github.com/Volscente/aerarium-saturni/issues/76)
**Effort estimate:** 2 FTE-days

### Scope

A `'use client'` SVG line chart in the ETF Registry tab that plots the price series of one or several selected ETFs.

### Goal

The user can select an ETF and see its price history, and overlay multiple ETFs for comparison, without regressing the Lighthouse performance budget.

### Deliverables

- `app/(tabularium)/tabularium/components/` — Timeline Chart component with ETF selection, multi-series overlay, legend, hover tooltip (date and value), rebased-to-100 default with an absolute-price toggle, and an empty state for ETFs without history
- `app/(tabularium)/tabularium/components/` — mounted above the registry table, loading series per ETF through the existing `fetchPriceHistory` Server Action with a client-side per-ETF cache
- `.lighthouserc.js` — Lighthouse run confirming `/tabularium/portfolio` stays ≥ 90

### Technical Overview

Hand-rolled SVG following the existing lightweight-chart precedent (`HoldingsBarChart`, `HoldingsTreemap`); `d3-scale` / `d3-shape` are the only acceptable additions, and no charting runtime. Uses the `roman-*` Tailwind tokens.

---

## GitHub Issues

### Milestone 1 — Automated Price Retrieval (Backend)

**Tasks:** TASK-1, TASK-2
**Effort:** 3.5 FTE-days

#### Scope

Schema changes, the provider adapter and the refresh endpoint that retrieve and store ETF prices and history idempotently.

#### Goal

A single backend call updates prices for all or selected ETFs from a free provider, safely repeatable, with per-ETF results.

#### Deliverables

- Alembic migration 006 with `price_symbol` and per-day uniqueness on price history
- Updated `Etf` model and ETF schemas
- `PriceProvider` interface and first free-provider adapter
- `POST /etfs/prices/refresh` endpoint with per-ETF results
- Unit tests for the adapter, upsert idempotency and failure handling

---

### Milestone 2 — Registry UI and Timeline Chart

**Tasks:** TASK-3, TASK-4
**Effort:** 3.5 FTE-days

#### Scope

Frontend changes in the ETF Registry tab: the update trigger, removal of manual price handling, and the Timeline Chart.

#### Goal

The user updates prices with one button and explores price evolution, for one or several ETFs, in a chart; no manual price path remains in the UI.

#### Deliverables

- `refreshEtfPrices` Server Action with cache-tag revalidation
- "Update prices" control with ETF multi-select and per-ETF result summary
- Removal of `PriceUpdateButton`, the history sub-table and the manual-price Server Actions
- `price_symbol` field in the ETF form
- Timeline Chart with multi-ETF overlay, rebased/absolute toggle and tooltip
- Lighthouse ≥ 90 check on `/tabularium/portfolio`
