# #83: Timeline Tab Shell and Data Plumbing

**GitHub Issue:** [83 — Timeline Tab Shell and Data Plumbing](https://github.com/Volscente/aerarium-saturni/issues/83)
**GitHub Milestone:** [17-portfolio-timeline](https://github.com/Volscente/aerarium-saturni/milestone/13)
**Notion page:** [17 Portfolio Timeline](https://app.notion.com/p/17-Portfolio-Timeline-3f75cc6c0f078057b978ede9a2a0a52f)

---

## Technical Scope

**In scope:**

- `frontend/app/(tabularium)/tabularium/portfolio/components/PortfolioPageClient.tsx` — add `'timeline'` to `PortfolioTab`, a visually separated tab button (divider + chart icon), conditional mount, lazy load on first open, state held in the component, and the mirrored TypeScript interfaces for `GET /portfolio/timeline`
- `frontend/app/(tabularium)/tabularium/portfolio/timeline-actions.ts` — new Server Action `fetchPortfolioTimeline` calling `GET /portfolio/timeline` with the `portfolio-timeline` cache tag
- `frontend/app/(tabularium)/tabularium/actions.ts` — `revalidateTag('portfolio-timeline')` in `createTransaction`, `updateTransaction`, `deleteTransaction`
- `frontend/app/(tabularium)/tabularium/etf-actions.ts` — `revalidateTag('portfolio-timeline')` in `createEtf`, `updateEtf`, `deleteEtf`, `refreshEtfPrices`
- `frontend/app/api/etfs/[id]/holdings/upload/route.ts` — `revalidateTag('portfolio-timeline')` on a successful upload
- `frontend/README.md` — Key components, Public interfaces (cache tag) and Changelog

The tab body in this task is a shell: loading, error, empty and skipped-transactions notices plus a placeholder where TASK-4 mounts the charts.

**Out of scope:**

- Tree selectors, SVG chart, normalization logic and the Y-axis toggle (TASK-4, TASK-5)
- Fetching the timeline in `portfolio/page.tsx` (it must stay lazy so the other tabs' payload and Lighthouse score are unaffected)
- Changing the existing `TimelineChart` or `RegistryPriceSection`
- Any backend change (endpoint delivered in TASK-2)
- A fourth Tabularium sub-route
- Zod validation of the response (see Notes on `fetchPortfolioTimeline`)

---

## Architecture

```txt
PortfolioPage (page.tsx, Server Component)           ── unchanged: 4 eager fetches only
          │  overviewData, exposureData, geographyData, sectorsData
          ▼
PortfolioPageClient  ('use client')
          │  activeTab: 'overview' | 'holdings' | 'geography' | 'sectors' | 'timeline'
          │  timeline: { status: 'idle' | 'loading' | 'ready' | 'error', data?, error? }
          │
          │  user opens "Timeline" for the first time
          ▼
    loadTimeline()
          │
          ▼
    fetchPortfolioTimeline()                         ('use server', timeline-actions.ts)
          │  fetch(`${BACKEND_URL}/portfolio/timeline`, { next: { tags: ['portfolio-timeline'] } })
          ▼
    GET /portfolio/timeline  (FastAPI, TASK-2)
          │  → PortfolioTimelineResponse | { error }
          ▼
    timeline state ── cached for later tab switches
          │
          ▼
    {activeTab === 'timeline' && <TimelineShell/>}   loading | error | empty | skipped notice
                                                      └── chart mount point (TASK-4)

Write paths ── revalidateTag('portfolio-timeline'):
    actions.ts      createTransaction, updateTransaction, deleteTransaction
    etf-actions.ts  createEtf, updateEtf, deleteEtf, refreshEtfPrices
    holdings upload route handler (POST)
```

### State lives in `PortfolioPageClient`, not in the tab body

The tab body is mounted only while the tab is active, so state kept inside it would be lost on every tab switch and trigger a refetch. The fetch state therefore sits one level up and is passed down as props. Selection state (checked nodes, Y-axis mode) still belongs to the Timeline components of TASK-4 and will reset when the user leaves the tab; that is accepted for this iteration.

### Cache invalidation also has to reach component state

`revalidateTag` clears the server-side data cache, but the loaded payload sits in client state. `AddTransactionButton` is mounted in the Tabularium layout, so a user can add a transaction while the Timeline tab is already loaded; the server action's revalidation triggers a router refresh, `PortfolioPageClient` stays mounted and would keep the stale series. To close that gap the component resets `timeline` to `idle` whenever its server-provided props change identity (the refresh re-renders the Server Component with new `overviewData`), and refetches if the Timeline tab is open. Navigating away from `/tabularium/portfolio` unmounts the component, so state resets naturally.

---

## Tech Stack

No new packages required. The chart icon uses `lucide-react` (already a dependency).

---

## Implementation Details

### Modules / Files

| File                                                                                         | Action | Description                                                                                                  |
| -------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| `frontend/app/(tabularium)/tabularium/portfolio/components/PortfolioPageClient.tsx`          | Modify | `'timeline'` tab, divider + icon, lazy load, timeline state, stale-state reset, exported timeline interfaces |
| `frontend/app/(tabularium)/tabularium/portfolio/timeline-actions.ts`                         | Create | `fetchPortfolioTimeline` Server Action                                                                       |
| `frontend/app/(tabularium)/tabularium/actions.ts`                                            | Modify | Add `revalidateTag('portfolio-timeline')` to the three write actions                                         |
| `frontend/app/(tabularium)/tabularium/etf-actions.ts`                                        | Modify | Add `revalidateTag('portfolio-timeline')` to the four write actions                                          |
| `frontend/app/api/etfs/[id]/holdings/upload/route.ts`                                        | Modify | Add `revalidateTag('portfolio-timeline')` inside the `res.ok` branch                                         |
| `frontend/app/(tabularium)/tabularium/portfolio/page.tsx`                                    | Reuse  | Not modified                                                                                                 |
| `frontend/README.md`                                                                         | Modify | Key components, Public interfaces, Changelog                                                                 |

`createTransaction`, `updateTransaction` and `deleteTransaction` each already carry the same five-tag block (`transactions`, `portfolio-overview`, `holdings-exposure`, `holdings-geography`, `holdings-sectors`); the new tag is appended to each. The docstrings that enumerate the revalidated tags are updated in the same edit. `etf-actions.ts` follows the same pattern. `refreshEtfPrices` is included because daily prices are an input of the timeline.

---

### Key Functions

```ts
export async function fetchPortfolioTimeline(): Promise<PortfolioTimelineResponse | { error: string }>
// GET ${BACKEND_URL}/portfolio/timeline tagged 'portfolio-timeline'; returns the parsed body or { error }.
```

- Notes: Mirrors `fetchPriceHistory` (`try/catch`, `!res.ok` → `Backend error <status>`, network failure → message). Returns `{ error }` rather than an empty tree on failure, so the UI can tell "no data" from "request failed" (unlike the page-level fetchers, which swallow errors into empty payloads). The RFC lists Zod "where the existing actions do"; `fetchPriceHistory` does not validate its response, so none is added here. The backend's Pydantic model is the contract, mirrored by the interfaces below.

```ts
function loadTimeline(): void
// Inside PortfolioPageClient: set status 'loading', call fetchPortfolioTimeline, store 'ready' or 'error'.
```

- Notes: Guards against double invocation (no call while `status === 'loading'`) and against late responses after a reset: the result is applied only if the request token still matches the latest one (a ref counter), so a refetch triggered by invalidation cannot be overwritten by an older response.

```tsx
useEffect(() => { /* if activeTab === 'timeline' && status === 'idle' → loadTimeline() */ }, [activeTab, timeline.status])
useEffect(() => { /* on server-prop identity change → reset timeline to idle */ }, [overviewData])
```

- Notes: The first effect makes the fetch happen on first open and again after an invalidation reset. The second skips the initial mount, so nothing is fetched until the tab is opened. A failed load stays in `'error'` until the user clicks a "Retry" button, to avoid a retry loop against a failing backend.

```tsx
const TABS: { id: PortfolioTab; label: string }[]   // four snapshot tabs unchanged
// 'timeline' is rendered separately after a divider, not as part of TABS.
```

- Notes: Keeping `TABS` for the snapshot tabs only makes the visual separation structural. The Timeline button reuses the same active/inactive classes. The divider is a `<span aria-hidden>` vertical rule (`border-l border-roman-stone/20`), and the icon is lucide `LineChart` (the installed `lucide-react` 0.400 has no `ChartLine`). The icon is `aria-hidden`; the button keeps the text label.

---

### Data Models / Schemas

TypeScript interfaces added to and exported from `PortfolioPageClient.tsx`, mirroring the TASK-2 Pydantic models field for field (money as `number`, `date` as ISO `YYYY-MM-DD` string):

```ts
export interface TimelinePoint {
  date: string
  value: number
  net_flow: number
}

export interface TimelineEtfSeries {
  isin: string
  etf_ticker: string
  etf_name: string
  points: TimelinePoint[]
}

export interface TimelineBrokerSeries {
  broker_platform: string
  points: TimelinePoint[]
  etfs: TimelineEtfSeries[]
}

export interface TimelineOwnerSeries {
  owner: string
  points: TimelinePoint[]
  brokers: TimelineBrokerSeries[]
}

export interface PortfolioTimelineResponse {
  owners: TimelineOwnerSeries[]
  skipped_transactions: number
}

type TimelineState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: PortfolioTimelineResponse }
  | { status: 'error'; message: string }
```

Tab body states (shell):

| State                                      | Rendered                                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `idle` / `loading`                         | "Loading timeline…" notice (wording and style follow `TimelineChart`)                       |
| `error`                                    | Error notice with the message and a Retry button                                             |
| `ready`, `owners.length === 0`             | Empty notice ("No priced transactions to plot yet.")                                         |
| `ready`, `skipped_transactions > 0`        | Notice above the body: "N transaction(s) skipped (non-EUR, missing price or invalid)."       |
| `ready`, owners present                    | Placeholder block marking the TASK-4 chart mount point; shows owner/broker counts            |

---

### Testing Strategy

The frontend has no unit-test runner (only a Playwright screenshot spec), and this task adds none. Verification is lint, type check and a manual run against the real backend.

**Static checks:**

```bash
cd frontend && npm run lint && npx tsc --noEmit
```

**Integration test** (manual, backend from TASK-2 running with seeded data):

```bash
just run_backend   # or the project's equivalent
cd frontend && npm run dev
```

Verify in the browser at `/tabularium/portfolio`:

- Network tab on first load: no request to `/portfolio/timeline`, and the four snapshot tabs behave as before.
- Click **Timeline** (visually separated from the four snapshot tabs, with a chart icon): one request fires, the shell shows the owner/broker counts.
- Switch to another tab and back: no second request.
- Add a transaction via the drawer while Timeline has been loaded: the Timeline state resets and refetches when the tab is open.
- Stop the backend and open the tab on a fresh load: error notice with Retry; restart the backend, click Retry: data loads.
- `grep -rn "revalidateTag('portfolio-timeline')" frontend/app` returns 8 call sites: 3 in `actions.ts`, 4 in `etf-actions.ts`, 1 in the upload route.

**Edge cases:**

- Backend returns `{ owners: [], skipped_transactions: 0 }` → empty notice, no error.
- Backend returns owners with `skipped_transactions > 0` → skipped notice shown above the body.
- Backend returns HTTP 500 → `{ error: 'Backend error 500' }`, error notice with Retry.
- Rapid tab switching during loading → single request, no duplicate state update.
- `updateTransaction` / `deleteTransaction` on the Transactions page → tag revalidated; the next Portfolio visit mounts fresh and loads current data.

---

### Open Questions / Risks

- [x] **Stale client state after writes:** `revalidateTag` alone does not refresh the payload already held in `PortfolioPageClient` state. **Answer:** use the prop-identity reset, no new mechanism. The code base never calls `router.refresh()`; a Server Action that calls `revalidateTag` makes Next re-render the current route, and `page.tsx` is `force-dynamic`, so `PortfolioPageClient` receives freshly deserialized `overviewData` (a new object) after every transaction and ETF write action. Watching `overviewData` is enough because every action that changes timeline inputs (transactions, ETFs, price refresh) also changes the overview. Two limits, both accepted: (1) the holdings upload is a Route Handler, which does not refresh the client route, so no reset happens there. Holdings do not feed the timeline anyway; the tag is added only to keep the RFC's "every write path" rule. (2) The reset relies on prop identity, so it breaks if the props are ever memoized; the effect carries a comment saying so. **Target:** resolved.
- [x] **Server Action fetch caching:** **Answer:** leave the tag as a marker and add no `revalidate` window. Next 15 does not cache `fetch` by default and the page is `force-dynamic`, so the tagged fetch is always fresh, which is the right behaviour for a series computed on request. A `revalidate` window or `force-cache` would make freshness depend on every write path remembering the tag (the RFC's own "Medium" risk) for no gain at this volume. The tag stays so that a later caching change only needs the fetch option, not a sweep of the write paths. **Target:** resolved.
- [x] **Selection state resets on tab switch:** **Answer:** accepted for this task, since the shell has no selection state. It is a TASK-4 design point: the invalidation reset also unmounts the body while data reloads, so TASK-4 should keep checked nodes in `PortfolioPageClient` (keyed by `owner`/`broker_platform`/`isin`, dropping keys that disappear from new data) rather than inside the chart components. Recorded here so TASK-4's spec picks it up. **Target:** TASK-4.
- [x] **File location of the Server Action:** **Answer:** keep `portfolio/timeline-actions.ts`. `etf-actions.ts` is the ETF registry's module and imports `etf-schema`; the timeline is a Portfolio concern and the portfolio folder already holds its own `utils/`. **Target:** resolved.
- [ ] **Payload size:** measure the real `/portfolio/timeline` response size once the tab loads (threshold from TASK-2: act above ~2 MB raw). Nothing to decide in this task; the shell is where it first becomes observable (Network tab). **Target:** TASK-5 Lighthouse check.
