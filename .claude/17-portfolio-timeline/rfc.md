# \[RFC\] Portfolio Timeline — Aerarium Saturni

| Author          | Simone Porreca                                                                                                                              |
| :-------------- | :------------------------------------------------------------------------------------------------------------------------------------------ |
| **Project**     | Aerarium Saturni                                                                                                                            |
| **RFC status**  | Draft (2026-11-03)                                                                                                                          |
| **Notion page** | [17 Portfolio Timeline](https://app.notion.com/p/17-Portfolio-Timeline-3f75cc6c0f078057b978ede9a2a0a52f)                                    |
| **Milestone**   | [17-portfolio-timeline](https://github.com/Volscente/aerarium-saturni/milestone/13)                                                         |

### Table of contents

[Motivation](#motivation)

[Objectives](#objectives)

[Scope](#scope)

[Portfolio Timeline](#portfolio-timeline)

[Tech Stack](#tech-stack)

[FAQs](#faqs)

[Risks & Open Questions](#risks--open-questions)

[References](#references)

---

## Motivation {#motivation}

The Portfolio page only shows current-state snapshots (Overview, Holdings, Geography, Sectors), all driven by the latest prices and holdings, so there is no way to see how the value of what an owner actually holds has evolved, or to compare owners, brokers and ETFs historically. The goal is the value of the holdings, not the ETF's market price: for example, 10,000 € of EUNL bought in 2025 plus a 100 € monthly purchase should appear as one line that grows with both the market and each contribution. Daily ETF prices are now stored, but nothing combines them with transaction history into holdings value over time. The solution must keep historical charts separate from the snapshot tabs (the Global Scope Filter must not appear to govern them), stay inside `/tabularium/portfolio` (the Tabularium is limited to three sub-routes), and preserve the Lighthouse performance score ≥ 90. For full context, see the [Notion initiative page](https://app.notion.com/p/17-Portfolio-Timeline-3f75cc6c0f078057b978ede9a2a0a52f).

## Objectives {#objectives}

- **Derive historical value**: A new backend endpoint returns daily EUR value series per owner, per `(owner, broker)` and per `(owner, broker, ETF)`, computed from transactions and `etf_price_history`.
- **Add a Timeline tab**: The Portfolio tab bar gains a visually separated "Timeline" tab whose state is independent of the Global Scope Filter.
- **Render macro and micro charts**: Each chart has a tree selector (Owner > Broker for the top chart, Owner > Broker > ETF for the bottom chart); every checked node plots one line showing the value of what that owner actually holds at that scope.
- **Support fair comparison**: The X-axis shows one point per calendar day (ISO dates such as `2026-01-01`, including weekends), and the Y-axis switches between Absolute Value and Normalized Growth (%) without refetching.
- **Stay fresh and fast**: The new data is invalidated by every write path and the page keeps Lighthouse performance ≥ 90.

## Scope {#scope}

**In-Scope:**

- New Timeline tab on Tabularium > Portfolio, visually separated from the snapshot tabs
- Macro chart: owner total and owner-at-broker portfolio value lines, selected through an Owner > Broker tree
- Micro chart: per-ETF position value lines, selected through an Owner > Broker > ETF tree
- Selection controls independent of the Global Scope Filter
- Daily X-axis granularity
- Y-axis toggle between Absolute Value and Normalized Growth (%)

**Out-of-Scope:**

- **Full portfolio metrics such as TWR/MWR reporting**: deferred to a future analytics initiative (backend README)
- **Non-EUR price series and transactions**: price refresh is EUR-only (backend README); non-EUR and price-less transactions are skipped
- **Dividends**: ignored in this iteration; they are neither value nor cash flow
- **Stock splits**: ignored in this iteration; no held ETF has split, and split rows are not applied
- **New Tabularium sub-route**: Timeline must live as a tab inside /tabularium/portfolio (frontend README invariant)

**Constraints:**

- Timeline lives inside `/tabularium/portfolio`; no fourth Tabularium sub-route.
- Lighthouse performance score stays ≥ 90 on `/tabularium/portfolio`.
- Every write path (transactions, ETFs, prices, holdings uploads) must revalidate any new cache tag.
- Any schema change must go through Alembic.
- Values are in EUR, as prices are EUR-only.

---

# **Portfolio Timeline** {#portfolio-timeline}

## Approach Overview {#approach-overview}

The backend gains a read-only `GET /portfolio/timeline` endpoint. It loads all buy/sell transactions and all `etf_price_history` rows for the held ISINs, then replays them day by day from the first transaction date to today. For each day it tracks net quantity per `(owner, broker, ISIN)` and values each position at the latest price on or before that day (carry-forward over weekends, holidays and gaps). It aggregates these into three series families, one per tree level: `owner`, `(owner, broker)` and `(owner, broker, ETF)`. Transactions with a non-EUR currency or without a price are skipped. Since every transaction (2025 onwards) post-dates the first stored price (2024), every held ETF is priced on every day it is held, and carry-forward is only needed for weekends, holidays and gaps. Each point carries the day's value and that day's net cash flow (buys minus sells at transaction price, with fees counted as part of the flow), so that growth can be normalized without distorting for contributions. The computation is done in plain Python with `Decimal` arithmetic (no new dependency), not in SQL, as split handling and carry-forward are simpler to express and test there.

The frontend adds a `'timeline'` value to `PortfolioPageClient`'s `activeTab`, rendered conditionally like the other tabs so its chart code is never mounted unless opened. The tab button is separated from the four snapshot tabs by a divider and a chart icon. The Server Component `page.tsx` is not changed to fetch eagerly; instead the Timeline tab is fed by a Server Action (same pattern as `fetchPriceHistory` in `etf-actions.ts`) invoked on first open and cached in component state, so the other tabs' payload and Lighthouse score are unaffected. Selection state (checked tree nodes, Y-axis mode) lives inside the Timeline component and never reads the Global Scope Filter. Switching between Absolute and Normalized is computed client-side from the already-fetched series.

No approach direction was stated in the proposal beyond "two stacked charts with independent selection menus"; the design adopts that as given.

### Integration {#integration}

The endpoint lives in `routers/portfolio.py` next to `/portfolio/overview` and `/portfolio/holdings/*`, with response schemas added to `schemas/portfolio.py`. It reuses the same net-holdings logic as the overview query for consistency. On the frontend, the Timeline chart follows the hand-rolled SVG approach of `TimelineChart` (no charting library) but is a new, separate component. The existing `TimelineChart` is used only by `RegistryPriceSection` on `/tabularium/etf-registry` and is tightly coupled to ETF ids and `fetchPriceHistory`, so it is left untouched; the minimal chart geometry needed is duplicated rather than refactoring a working feature. Extracting shared primitives is a possible later cleanup. A new cache tag `portfolio-timeline` is added to `revalidateTag` calls in `actions.ts`, `etf-actions.ts` and the holdings upload route handler.

## Timeline Data Endpoint {#timeline-data-endpoint}

Response shape (illustrative):

- `owners`: `[{ owner, points: Point[], brokers: [{ broker_platform, points: Point[], etfs: [{ etf_ticker, etf_name, points: Point[] }] }] }]`, mirroring the Owner > Broker > ETF selection tree.
- `Point`: `{ date, value, net_flow }`; each series starts on the first day its node holds a non-zero position, so lines start where data is real. An owner's line aggregates all its brokers; a broker's line aggregates its ETFs. The same ETF held at two brokers appears as two separate lines.

Rules: dividends and splits are ignored; positions with zero quantity on a day contribute zero; dates are UTC days matching the `etf_price_history` unique daily index; the range runs from the earliest transaction to the latest price date. The first iteration computes on request; with an expected volume of under ~100 transactions per year across all owners the replay is small, so precomputation or a materialized table is not planned.

## Timeline UI {#timeline-ui}

Two stacked SVG line charts, each with a left-side collapsible tree selector. The macro tree has two levels (Owner > Broker); the micro tree has three (Owner > Broker > ETF). Every node has its own checkbox and each checked node plots one line equal to the value of its subtree: checking "Thomas" shows Thomas's total portfolio, checking "Thomas > N26" shows only what Thomas holds at N26, and checking an ETF leaf shows the value of that position. Checking a parent does not check its children, so any combination of lines can be compared. Expanding or collapsing a node is separate from checking it. A shared Y-axis toggle (Absolute € / Normalized %) applies to both charts. Normalized mode indexes each line to its own first valid day within the plotted range and chains daily returns adjusted for that day's `net_flow`, so buying more shares does not appear as growth. This applies to both charts, including ETF position lines. Tooltip shows the date and each line's value. Empty and loading states follow the notices already used by `TimelineChart`.

## Tech Stack {#tech-stack}

- **Next.js 15 / Server Actions**: lazy loading of the timeline payload on first tab open keeps the other tabs' initial payload unchanged and mirrors the existing `fetchPriceHistory` pattern.
- **Nextra 4**: unchanged; the Tabularium route group has no Nextra chrome, so no work is needed here.
- **Tailwind CSS**: `roman-*` tokens for the tab divider, menus and line colors, consistent with other Portfolio components.
- **Zod**: validates the Server Action response/params where the existing actions do.
- **Python / FastAPI**: hosts the new `GET /portfolio/timeline` endpoint beside the other portfolio routes.
- **SQLAlchemy (async)**: loads transactions and price history; the replay itself runs in Python.
- **Pydantic v2**: typed response models mirrored by TypeScript interfaces in `PortfolioPageClient.tsx`.
- **PostgreSQL**: existing `transactions` and `etf_price_history` tables; no schema change is planned.

**Desired / experimental:**

- No new technologies were requested. The existing SVG, no-charting-library approach is the baseline because it protects the Lighthouse budget.

---

# **FAQs** {#faqs}

**Q: Why compute the history in the backend rather than the browser?**

A: The backend owns all financial data access and already has the netting logic. Shipping all transactions and all price histories to the browser would expose more data than needed and duplicate the carry-forward logic.

**Q: Why not add the charts to the Overview tab?**

A: The Global Scope Filter would be expected to govern them, and multi-line comparison needs independent toggles; the dedicated tab also avoids large charts pushing current holdings off-screen.

**Q: Why a Server Action on first open instead of fetching in `page.tsx`?**

A: Fetching in the page would add the full daily series to every Portfolio load and risk the Lighthouse ≥ 90 budget for users who never open the Timeline.

**Q: Why return `net_flow` with each point?**

A: Without it, "Normalized Growth (%)" would treat buying more shares as performance. It lets the client chain flow-adjusted daily returns without a second request.

**Q: Terminology?**

A:

- TWR → Time-Weighted Return; MWR → Money-Weighted Return (both out of scope)
- ETF → Exchange-Traded Fund
- Global Scope Filter → the owner/broker filter used on the Overview tab

---

## Risks & Open Questions {#risks--open-questions}

| Risk / Question | Likelihood | Mitigation / Answer |
| :-- | :-- | :-- |
| Daily replay makes the endpoint slow | Low | Expected volume is small (<~100 transactions per year); compute on request and measure on real data |
| A purchase is valued at the day's close, not at its transaction price, so value can jump slightly on a buy day | Low | Accepted; weekends, holidays and gaps carry the last close forward (value stays flat), and transactions never pre-date price history, so no ETF is unpriced while held |
| Flow-adjusted chaining overlaps conceptually with the TWR metric deferred as out-of-scope | Low | Decided: use the minimal flow-adjusted daily chain for normalization; scope-out is reworded to full TWR/MWR reporting |
| Transaction-price flows may not match brokers' real cash flows, and dividends are ignored | Medium | Document the assumption; fees are counted, dividends and non-EUR/price-less transactions are skipped |
| Hand-rolled SVG with many daily points and checked nodes degrades interactivity | Low | Lazy tab mount; downsample rendered points if needed |
| Skipped non-EUR or price-less transactions silently understate values | Low | Return the count of skipped transactions and show it as a notice in the Timeline tab |
| A write path misses the new cache tag and the Timeline goes stale | Medium | Add the tag to every existing `revalidateTag` group and cover it in the checklist |

## References {#references}

- [Notion initiative page](https://app.notion.com/p/17-Portfolio-Timeline-3f75cc6c0f078057b978ede9a2a0a52f)
