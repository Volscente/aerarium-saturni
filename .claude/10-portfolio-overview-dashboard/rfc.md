# [RFC] Portfolio Overview Dashboard — Aerarium Saturni

| Author          | Simone Porreca                                                                                          |
| :-------------- | :------------------------------------------------------------------------------------------------------ |
| **Project**     | Aerarium Saturni                                                                                        |
| **RFC status**  | Draft                                                                                                   |
| **Review deadline** | 2026-06-30                                                                                          |
| **Notion page** | [Portfolio Overview Dashboard](https://app.notion.com/p/10-Portfolio-Overview-Dashboard-3865cc6c0f078033920ad103c2d83d9a) |
| **GitHub repo** | [Volscente/aerarium-saturni](https://github.com/Volscente/aerarium-saturni)                             |
| **Milestone**   | [10-portfolio-overview-dashboard](https://github.com/Volscente/aerarium-saturni/milestone/8)            |

### Timeline

| Date       | Status | Note  |
| :--------- | :----- | :---- |
| 2026-06-30 | Draft  |       |

### Table of contents

[Motivation](#motivation)

[Objectives](#objectives)

[Scope](#scope)

[Portfolio Overview Dashboard](#portfolio-overview-dashboard)

[Tech Stack](#tech-stack)

[Effort Estimations](#effort-estimations)

[FAQs](#faqs)

[Risks & Open Questions](#risks--open-questions)

[References](#references)

---

## Motivation {#motivation}

The `/tabularium/portfolio` route exists as a live, Lighthouse-audited page but currently renders only the ETF Registry — a flat list of individually registered ETFs with no aggregation across owners or broker platforms. Multi-portfolio investors have no way to get a consolidated, high-level snapshot of their net worth distribution: how much is invested where, by whom, and at what return. Without this aggregated macro view, users cannot isolate or combine sub-portfolios (e.g., a personal account vs. a partner's account) before drilling into asset details or performance metrics, leaving the portfolio pillar's primary value proposition unrealized. For full context, see the [Notion initiative page](https://app.notion.com/p/10-Portfolio-Overview-Dashboard-3865cc6c0f078033920ad103c2d83d9a).

---

## Objectives {#objectives}

- **Build the Overview visualisation**: Deliver a new interactive aggregation table at `/tabularium/portfolio` (under a "Portfolio" tab) that breaks down invested capital and performance by Owner × Broker Platform — giving multi-portfolio investors their first consolidated macro view.
- **Relocate the ETF Registry**: Move the existing ETF Registry content to a dedicated "ETF Registry" tab within the same route, preserving all current functionality without disruption.
- **Expose a backend aggregation endpoint**: Implement `GET /portfolio/overview` in FastAPI, computing total invested, current value (where price data is available), and performance metrics per owner/broker group from the existing `transactions` and `etf_price_history` tables.
- **Enable dynamic sub-portfolio isolation**: Support per-row checkbox selection so users can instantly isolate or combine portfolios; the "Total" footer row and "Share" column must recalculate client-side without page reloads.
- **Preserve Lighthouse performance**: Keep the CI-gated performance score ≥ 90 at `/tabularium/portfolio` after introducing the tab shell and new client components.

---

## Scope {#scope}

**In-Scope:**

- Tab navigation within `/tabularium/portfolio`: "Portfolio" tab (hosts the new Overview visualisation, default) and "ETF Registry" tab (existing content, relocated)
- New `GET /portfolio/overview` FastAPI endpoint — aggregates `transactions` by `(owner, broker_platform)`; joins `etfs` + `etf_price_history` to compute current value where price data exists
- `PortfolioOverviewTable` `'use client'` component: checkbox selection, master toggle, dynamic "Total" footer, "Share" column, column sorting, visual performance indicators, broker logo with fallback icon
- Weighted "Total %" metric computed from selected rows' actual invested sums (not a simple average)
- Dash (`—`) fallback for missing/null data fields; localized financial formatting
- `revalidateTag('portfolio-overview')` added to `createTransaction` in `actions.ts` (and to ETF mutation actions if ETF price history feeds current value)
- New `PortfolioOverviewResponse` and `PortfolioRowResponse` Pydantic v2 schemas in the backend

**Out-of-Scope:**

- **User authentication**: Platform is unauthenticated at this stage.
- **Real-time market data**: Only static and calculated values are supported; no live price feed.
- **Portfolio metric calculations (TWR, MWR, cost basis)**: Deferred to a future analytics initiative.
- **Deep-dive asset characteristics and X-Ray metrics**: Gateway view only; detail views are future work.
- **ML simulations**: Deferred to a dedicated future initiative.
- **New Tabularium top-level sub-routes**: The tab structure is contained within `/tabularium/portfolio`; no third top-level Tabularium route is introduced.
- **CSV bulk transaction import**: Only single-record creation via `POST /transactions` is supported.

**Constraints:**

- Lighthouse performance score must remain ≥ 90 at `/tabularium/portfolio`; enforced by `lhci autorun` in CI.
- No new Tabularium top-level sub-routes — tab switching is in-page state only (`useState`); no URL changes.
- `CustomNavbar` must remain free of Nextra-specific imports.
- Any new backend tables or schema changes must use Alembic migrations, not `Base.metadata.create_all()`.
- `createTransaction` in `actions.ts` must call `revalidateTag('portfolio-overview')` once the endpoint is cached.

---

# **Portfolio Overview Dashboard** {#portfolio-overview-dashboard}

## Approach Overview {#approach-overview}

The portfolio page at `app/(tabularium)/tabularium/portfolio/page.tsx` is refactored from a single-purpose ETF Registry Server Component into a **tab shell**. The Server Component fetches both data sources in parallel — `GET /portfolio/overview` (new, for the Overview tab) and `GET /etfs` (existing, for the ETF Registry tab) — then passes both result sets as props to a single `'use client'` tab container component. This keeps both tabs server-rendered at the data-fetch layer while all interactivity (tab switching, checkbox state, sorting) stays in the browser without additional round-trips.

The tab container renders a two-tab header ("Portfolio" | "ETF Registry"). The "Portfolio" tab is active by default and hosts `PortfolioOverviewTable`, a new `'use client'` component that owns all interactive state for the Overview. The "ETF Registry" tab renders the existing `EtfRegistryTable` and `AddEtfButton` unchanged — only their mount site moves from the page root into the tab body.

The proposal's approach direction (Server Component + `'use client'` table, mirroring the Transaction Ledger pattern) is adopted without modification. The only structural addition is the tab container wrapping both views within the same route.

### Integration {#integration}

**Frontend — `portfolio/page.tsx`:**
The page currently calls `GET /etfs` with `{ next: { tags: ['etfs'] } }` and renders `AddEtfButton` + `EtfRegistryTable`. After this RFC it becomes:

```ts
const [overviewData, etfs] = await Promise.all([
  fetchPortfolioOverview(), // GET /portfolio/overview, cache tag 'portfolio-overview'
  fetchEtfs(),              // GET /etfs, cache tag 'etfs' (unchanged)
])
return <PortfolioPageClient overviewData={overviewData} etfs={etfs} />
```

`PortfolioPageClient` is a new `'use client'` tab container. It owns `activeTab: 'portfolio' | 'etf-registry'` state and renders the appropriate child.

**Frontend — `actions.ts` and `etf-actions.ts`:**
`createTransaction` must gain `revalidateTag('portfolio-overview')` alongside the existing `revalidateTag('transactions')`. The ETF mutation actions (`createEtf`, `updateEtf`, `deleteEtf`, `addPriceSnapshot`) must also call `revalidateTag('portfolio-overview')` because the Overview's current-value computation draws from `etf_price_history`.

**Frontend — `TabulariumSubNav.tsx`:**
No changes required; the active-state logic uses `usePathname()` prefix-matching on `/tabularium/portfolio`, which remains correct regardless of which tab is active.

**Backend — new `portfolio` router:**
A new file `src/backend/routers/portfolio.py` with a single `GET /portfolio/overview` handler is added and registered in `main.py` at prefix `/portfolio`. It uses `Depends(get_session)` and executes a SQLAlchemy async query over the existing `transactions`, `etfs`, and `etf_price_history` tables — no new migrations required.

## M1 — Backend Aggregation Endpoint {#m1-backend-aggregation-endpoint}

A new FastAPI route handler `GET /portfolio/overview` returns a list of `PortfolioRowResponse` objects, one per `(owner, broker_platform)` group.

**Pydantic schemas** (`src/backend/schemas/portfolio.py`):

```python
class PortfolioRowResponse(BaseModel):
    owner: str
    broker_platform: str
    total_invested: Decimal
    current_value: Decimal | None   # None when no price data exists for any holding
    performance_abs: Decimal | None # current_value - total_invested; None if current_value is None
    performance_pct: Decimal | None # performance_abs / total_invested * 100; None if no value

    model_config = ConfigDict(from_attributes=True)

class PortfolioOverviewResponse(BaseModel):
    rows: list[PortfolioRowResponse]
```

`share` is intentionally absent from the schema — it is a dynamic UI concept that depends on which rows are currently selected, so it is computed client-side.

**Aggregation query (two-phase):**

Phase 1 — compute net holdings per `(owner, broker_platform, isin)`:

```sql
SELECT
  owner,
  broker_platform,
  isin,
  SUM(CASE WHEN transaction_type = 'Buy'  THEN quantity ELSE 0 END) -
  SUM(CASE WHEN transaction_type = 'Sell' THEN quantity ELSE 0 END) AS net_quantity,
  SUM(CASE WHEN transaction_type = 'Buy'  THEN quantity * price ELSE 0 END) -
  SUM(CASE WHEN transaction_type = 'Sell' THEN quantity * price ELSE 0 END) AS total_invested
FROM transactions
WHERE transaction_type IN ('Buy', 'Sell')
GROUP BY owner, broker_platform, isin
```

Phase 2 — join to `etfs` and the latest price from `etf_price_history` per ISIN, then aggregate up to `(owner, broker_platform)`:

```sql
SELECT
  h.owner,
  h.broker_platform,
  SUM(h.total_invested)                              AS total_invested,
  SUM(h.net_quantity * latest.price)                 AS current_value
FROM holdings h
LEFT JOIN etfs e ON e.isin = h.isin
LEFT JOIN LATERAL (
  SELECT price FROM etf_price_history
  WHERE etf_id = e.id ORDER BY timestamp DESC LIMIT 1
) latest ON true
GROUP BY h.owner, h.broker_platform
```

`current_value` is `NULL` for any group where at least one holding has no price record; `performance_abs` and `performance_pct` are `NULL` in that case. The router is implemented as a SQLAlchemy async query using `select()`, `func`, and a correlated subquery (or CTE) to avoid raw SQL strings.

**Registration:** Add `from src.backend.routers import portfolio` and `app.include_router(portfolio.router, prefix="/portfolio")` to `main.py`.

## M2 — Portfolio Tab Shell {#m2-portfolio-tab-shell}

`app/(tabularium)/tabularium/portfolio/page.tsx` is refactored into a tab shell Server Component. The page fetches both data sources in parallel and passes them to `PortfolioPageClient`:

```tsx
// 'use server' (implicit — no directive needed for Server Components)
export default async function PortfolioPage() {
  const [overviewData, etfs] = await Promise.all([
    fetchPortfolioOverview(), // wraps fetch with { next: { tags: ['portfolio-overview'] } }
    fetchEtfs(),              // existing helper, cache tag 'etfs'
  ])
  return <PortfolioPageClient overviewData={overviewData} etfs={etfs} />
}
```

`PortfolioPageClient` (`'use client'`) owns `activeTab` state and renders:

- **"Portfolio" tab** (default): `<PortfolioOverviewTable rows={overviewData.rows} />`
- **"ETF Registry" tab**: `<AddEtfButton />` + `<EtfRegistryTable etfs={etfs} />`

Tab header styling follows existing `roman-*` Tailwind tokens to match the Tabularium design language. No new CSS variables or design tokens are introduced.

## M3 — Overview Table {#m3-overview-table}

`PortfolioOverviewTable` is a `'use client'` component responsible for all interactive behaviour. It receives `rows: PortfolioRowResponse[]` as a prop and owns the following state:

| State variable | Type | Purpose |
| :--- | :--- | :--- |
| `selected` | `Set<string>` | Row keys (`${owner}::${broker_platform}`) of checked rows; initialised to all rows |
| `sortColumn` | `keyof PortfolioRowResponse \| null` | Active sort column |
| `sortDirection` | `'asc' \| 'desc'` | Sort direction |

**Columns rendered (left to right):**

| Column | Source | Notes |
| :--- | :--- | :--- |
| ☑ | `selected` state | Master toggle in `<thead>`; per-row toggle in `<tbody>` |
| Owner | `row.owner` | Alphabetical sort |
| Broker | `row.broker_platform` | Displays brand logo (static asset); generic fallback icon via `<Image>` `onError` |
| Invested | `row.total_invested` | Localized, e.g., `10.000,00 €` |
| Value | `row.current_value` | Dash (`—`) if `null` |
| Performance | `row.performance_abs` + `row.performance_pct` | Side-by-side; green / red / neutral CSS class based on sign; dash if `null` |
| Share | Computed | `row.total_invested / selectedTotal * 100`; recalculates on every selection change |

**"Total" footer row** (`<tfoot>`): sums `total_invested`, `current_value`, `performance_abs` across selected rows. `performance_pct` uses **weighted return**: `Σ(performance_abs) / Σ(total_invested) * 100` — not a simple average. Share for the Total row is always `100%`.

**Sorting**: clicking a column header sets `sortColumn`; clicking again toggles `sortDirection`. Rows are sorted by a derived key that handles `null` values (nulls sort last).

**Visual indicators**: a utility `perfClass(value: Decimal | null): string` returns `'text-green-600'`, `'text-red-600'`, or `'text-neutral-500'`.

**Broker logos**: static assets placed under `public/brokers/{slug}.svg` (e.g., `n26.svg`, `ibkr.svg`). A `brokerLogoPath(platform: string): string | null` helper maps known platform names to paths; `null` triggers the generic fallback icon.

---

## Tech Stack {#tech-stack}

- **Next.js 15 (App Router)**: Server Component data-fetching shell with parallel `Promise.all` calls; `revalidateTag` cache invalidation pattern already established by Transaction Ledger and ETF Registry.
- **React (`'use client'`)**: Checkbox state, tab switching, sorting, and dynamic total computation are in-browser interactions with no additional server round-trips.
- **TypeScript**: `PortfolioRowResponse` interface derived from the Pydantic schema; `Set<string>` for selection state; strict null checks enforce the `null` handling for missing price data.
- **Tailwind CSS**: `roman-*` token styling for tab headers and performance colour classes; no new design tokens.
- **Zod**: Response validation for `GET /portfolio/overview` on the frontend fetch helper, consistent with ETF and Transaction fetch helpers.
- **FastAPI**: New `portfolio` router follows the existing pattern (`Depends(get_session)`, Pydantic v2 response model, async handler).
- **SQLAlchemy (async)**: Multi-table aggregation query using `select()`, `func.sum`, lateral correlated subquery for latest price lookup per ISIN.
- **Pydantic v2**: `PortfolioRowResponse` and `PortfolioOverviewResponse` schemas; `Decimal` fields with `from_attributes=True` for ORM-mode serialisation.
- **PostgreSQL**: Aggregation and lateral join over existing `transactions`, `etfs`, and `etf_price_history` tables; no schema changes required.

---

## Effort Estimations {#effort-estimations}

Total estimated effort: **6 sessions**.

| Milestone | Description | Est. effort | GitHub Issue |
| :--- | :--- | :--- | :--- |
| M1 — Backend Aggregation Endpoint | New `portfolio` router + `GET /portfolio/overview`; `PortfolioRowResponse` schema; two-phase SQLAlchemy async aggregation query; unit tests; register in `main.py` | 2 sessions | #{issue} |
| M2 — Portfolio Tab Shell | Refactor `portfolio/page.tsx` to tab shell; new `PortfolioPageClient` `'use client'` tab container; relocate `AddEtfButton` + `EtfRegistryTable` into ETF Registry tab; add `revalidateTag('portfolio-overview')` to `actions.ts` and `etf-actions.ts` | 2 sessions | #{issue} |
| M3 — Overview Table | `PortfolioOverviewTable` component: checkbox selection, master toggle, dynamic Total footer, Share column, sorting, performance colour classes, broker logo with fallback; localized formatting | 2 sessions | #{issue} |

### Recommended Order

1. M1 — Backend Aggregation Endpoint (prerequisite: Overview table cannot be built without real data shape)
2. M2 — Portfolio Tab Shell (prerequisite: confirm route constraint holds; ETF Registry relocation unblocks M3 from sharing the page)
3. M3 — Overview Table (can begin in parallel with M2 once M1 data shape is finalised)

---

# **FAQs** {#faqs}

**Q: Why is the Overview placed in a "Portfolio" tab rather than a new named "Overview" tab?**

A: The `/tabularium/portfolio` route represents the portfolio pillar. The macro-level aggregation table *is* the primary portfolio view — it is what this route was always intended to show. Naming the tab "Overview" would imply it is one of several portfolio sub-views. Naming it "Portfolio" preserves the information architecture: you land on the portfolio view by default; the ETF Registry is a supporting data management tool reachable within the same route without disrupting the top-level navigation.

**Q: Why not introduce a URL-based tab route (e.g., `/tabularium/portfolio/etf-registry`)?**

A: The CLAUDE.md invariant explicitly states the Tabularium has exactly two top-level sub-routes (`/tabularium/portfolio` and `/tabularium/transactions`). Adding a third route requires either splitting or consolidating an existing page. The ETF Registry is a supporting view, not a peer pillar, so in-page tab state (`useState`) is the correct boundary. URL-based tab routing is not ruled out for a future initiative if the ETF Registry grows into a full pillar.

**Q: What happens to the Overview table when price data is unavailable for some holdings?**

A: `current_value`, `performance_abs`, and `performance_pct` are nullable in the schema. The frontend renders a dash (`—`) in those cells. The "Total %" weighted return excludes rows where `performance_abs` is `null` from both the numerator and denominator, so partial price coverage does not silently distort the aggregate.

**Q: How are broker logos sourced and handled?**

A: SVG logos are placed as static assets under `public/brokers/{slug}.svg`. A lookup helper maps known broker platform names (case-insensitive, normalised) to paths. Any broker not in the map — or any failed image load — renders a generic financial institution icon (e.g., a Lucide `Building2` icon). Logo licensing must be verified before adding each asset; only logos with confirmed permissive or brand-kit licences are included.

**Q: Terminology?**

A:

- **TWR** → Time-Weighted Return — performance metric that eliminates the effect of external cash flows; out of scope for this RFC.
- **MWR** → Money-Weighted Return (IRR) — accounts for timing and size of cash flows; out of scope for this RFC.
- **Weighted return** → In this RFC, refers specifically to `Σ(performance_abs) / Σ(total_invested) * 100` across selected rows — not TWR or MWR.
- **ISIN** → International Securities Identification Number — 12-character alphanumeric code uniquely identifying a security; used as the join key between `transactions` and `etfs`.

---

## Risks & Open Questions {#risks--open-questions}

| Risk / Question | Likelihood | Mitigation / Answer |
| :--- | :--- | :--- |
| **Price data gap**: many ISINs in `transactions` may have no corresponding `etf_price_history` rows, causing `current_value` and performance to be `null` for most rows at launch | High | Render `null` fields as `—` gracefully; document that performance metrics populate as price snapshots are added via `POST /etfs/{id}/price`. No silent fallback to `total_invested` as "current value" — that would imply 0% return misleadingly. |
| **Aggregation query complexity**: the lateral join over `etf_price_history` to find the latest price per ISIN may be slow on large transaction histories | Medium | Add a composite index on `(etf_id, timestamp DESC)` in `etf_price_history` — already present from migration `001`. Profile the query with `EXPLAIN ANALYZE` before shipping M1. |
| **`transactions` table managed by `create_all()`**: any schema extension needed for the aggregation (e.g., new columns) cannot use Alembic without a baseline migration for `transactions` first | Low | The aggregation endpoint reads only existing columns (`owner`, `broker_platform`, `transaction_type`, `quantity`, `price`, `isin`) — no schema change is required. If a future extension is needed, the baseline Alembic migration for `transactions` must be completed first. |
| **`revalidateTag` coordination**: three server actions (`createTransaction`, `createEtf`/`updateEtf`/`deleteEtf`, `addPriceSnapshot`) must all invalidate `'portfolio-overview'`; missing any one leaves the Overview stale | Medium | Add `revalidateTag('portfolio-overview')` explicitly to all five actions in M2. Add a comment in each action referencing the portfolio cache tag so future actions follow the same pattern. |
| **Broker logo sourcing and licensing**: brand logos for N26, IBKR, and other brokers must be obtained with a confirmed permissive licence before being committed to `public/` | Medium | Source logos from official brand kits only. For any broker without a confirmed brand kit, use the generic fallback from day one — do not block the table on logo availability. |

---

## References {#references}

- [Notion Initiative Page — Portfolio Overview Dashboard](https://app.notion.com/p/10-Portfolio-Overview-Dashboard-3865cc6c0f078033920ad103c2d83d9a)
- [GitHub Milestone — 10-portfolio-overview-dashboard](https://github.com/Volscente/aerarium-saturni/milestone/8)
- [Frontend README](frontend/README.md)
- [Backend README](backend/README.md)
