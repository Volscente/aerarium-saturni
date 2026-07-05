# #49: Portfolio Tab Shell

**GitHub Issue:** [#49 — Portfolio Tab Shell](https://github.com/Volscente/aerarium-saturni/issues/49)
**GitHub Milestone:** [10-portfolio-overview-dashboard](https://github.com/Volscente/aerarium-saturni/milestone/8)
**Notion page:** [Portfolio Overview Dashboard](https://app.notion.com/p/10-Portfolio-Overview-Dashboard-3865cc6c0f078033920ad103c2d83d9a)

---

## Technical Scope

**In scope:**

- `app/(tabularium)/tabularium/portfolio/page.tsx` — refactor from single-purpose ETF Registry Server Component to a tab shell that parallel-fetches `GET /portfolio/overview` and `GET /etfs`, then renders `<PortfolioPageClient>`
- `app/(tabularium)/tabularium/portfolio/components/PortfolioPageClient.tsx` — new `'use client'` tab container owning `activeTab: 'portfolio' | 'etf-registry'` state; relocates `<AddEtfButton />` + `<EtfRegistryTable />` into the "ETF Registry" tab; renders a `PortfolioOverviewTable` placeholder in the "Portfolio" tab
- `app/(tabularium)/tabularium/actions.ts` — add `revalidateTag('portfolio-overview')` to `createTransaction`
- `app/(tabularium)/tabularium/etf-actions.ts` — add `revalidateTag('portfolio-overview')` to `createEtf`, `updateEtf`, `deleteEtf`, and `addPriceSnapshot`

**Out of scope:**

- `PortfolioOverviewTable` interactive implementation (TASK-3)
- Any changes to `TabulariumSubNav.tsx` — `usePathname()` prefix-match on `/tabularium/portfolio` remains valid regardless of active tab
- URL-based tab routing — tab switching is pure `useState`; no new Tabularium top-level sub-routes
- Backend endpoint — already delivered in TASK-1 (`GET /portfolio/overview` at `/portfolio/overview`)

---

## Architecture

```txt
portfolio/page.tsx  (Server Component — no directive needed)
          │
          ├── fetchPortfolioOverview()  →  GET /portfolio/overview
          │     { next: { tags: ['portfolio-overview'] } }
          │     → PortfolioOverviewResponse
          │
          ├── fetchEtfs()              →  GET /etfs
          │     { next: { tags: ['etfs'] } }
          │     → EtfResponse[]
          │
          └──► <PortfolioPageClient overviewData={...} etfs={...} />  ('use client')
                        │
                        │  activeTab === 'portfolio'     (default)
                        ├──► <PortfolioOverviewTable rows={overviewData.rows} />
                        │       (placeholder — full impl in TASK-3)
                        │
                        │  activeTab === 'etf-registry'
                        └──► <AddEtfButton />
                             <EtfRegistryTable etfs={etfs} />

Cache invalidation paths that gain revalidateTag('portfolio-overview'):
  actions.ts        createTransaction         (already had 'transactions')
  etf-actions.ts    createEtf
  etf-actions.ts    updateEtf
  etf-actions.ts    deleteEtf
  etf-actions.ts    addPriceSnapshot
```

### Why `AddEtfButton` moves into `PortfolioPageClient`

`AddEtfButton` is currently mounted directly in `portfolio/page.tsx` so it appears only on the portfolio route (not in the shared layout). After the refactor it must live inside `PortfolioPageClient`'s "ETF Registry" tab body — not in the "Portfolio" tab — so it does not render when the Portfolio tab is active. It must not be hoisted into the Tabularium layout.

---

## Tech Stack

No new packages required.

---

## Implementation Details

### Modules / Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `app/(tabularium)/tabularium/portfolio/page.tsx` | Modify | Replace single `GET /etfs` fetch with `Promise.all([fetchPortfolioOverview(), fetchEtfs()])` and render `<PortfolioPageClient>` |
| `app/(tabularium)/tabularium/portfolio/components/PortfolioPageClient.tsx` | Create | `'use client'` tab container; owns `activeTab` state; renders tab header + conditional tab body |
| `app/(tabularium)/tabularium/actions.ts` | Modify | Add `revalidateTag('portfolio-overview')` to `createTransaction` |
| `app/(tabularium)/tabularium/etf-actions.ts` | Modify | Add `revalidateTag('portfolio-overview')` to all four ETF mutation actions |

---

### Key Functions

```ts
// portfolio/page.tsx

async function fetchPortfolioOverview(): Promise<PortfolioOverviewResponse> {
  /**
   * Fetch aggregated portfolio data from the backend.
   *
   * Calls GET /portfolio/overview with a Next.js data cache tag so that
   * revalidateTag('portfolio-overview') in any server action instantly
   * stales this fetch for the next request.
   *
   * Returns:
   *   PortfolioOverviewResponse with a `rows` array of PortfolioRowResponse.
   *   Performance fields are null when price data is absent for any held ISIN.
   *
   * Throws:
   *   Error: if the fetch fails or the response is not ok.
   */
}
```

```tsx
// portfolio/components/PortfolioPageClient.tsx

export function PortfolioPageClient({
  overviewData,
  etfs,
}: {
  overviewData: PortfolioOverviewResponse
  etfs: EtfResponse[]
}): JSX.Element {
  /**
   * Tab container for the portfolio route.
   *
   * Owns activeTab state and renders the two-tab header ("Portfolio" | "ETF Registry")
   * plus the corresponding tab body. Tab switching is pure client-side state —
   * no URL changes, no server round-trips.
   *
   * The "Portfolio" tab is the default. It renders PortfolioOverviewTable (placeholder
   * until TASK-3). The "ETF Registry" tab renders AddEtfButton + EtfRegistryTable.
   *
   * Tab header styling uses roman-* Tailwind tokens to match the Tabularium design language.
   */
}
```

---

### Data Models / Schemas

```ts
// TypeScript interfaces mirroring the Pydantic backend schemas (no Zod validation needed
// for SSR-only fetch — types suffice here; Zod can be added in TASK-3 if the table fetch
// is moved to a client helper)

interface PortfolioRowResponse {
  owner: string
  broker_platform: string
  total_invested: number        // Decimal serialised as number in JSON
  current_value: number | null  // null when any held ISIN has no price record
  performance_abs: number | null
  performance_pct: number | null
}

interface PortfolioOverviewResponse {
  rows: PortfolioRowResponse[]
}
```

`EtfResponse` is already exported from `app/(tabularium)/tabularium/components/EtfForm.tsx` — import it from there; do not duplicate the type.

---

### Testing Strategy

No automated test files are added in this task. Verification is manual and via existing CI:

**Manual integration checks:**

1. Start the full stack (`just backend-dev` + `npm run dev`).
2. Navigate to `/tabularium/portfolio` — confirm the "Portfolio" tab is active by default and the page renders without errors.
3. Click "ETF Registry" — confirm `EtfRegistryTable` renders with existing ETF data and `AddEtfButton` is visible.
4. Click "Portfolio" — confirm the tab switches back without a page reload.
5. Add a transaction via `AddTransactionButton` — confirm no console errors (the new `revalidateTag('portfolio-overview')` call should be silent on success).
6. Add/edit/delete an ETF or add a price snapshot — same silent-success check.

**CI gate:** `lhci autorun` must pass with performance ≥ 90 at `/tabularium/portfolio` (already in `.lighthouserc.js`).

**Edge cases:**

- `overviewData.rows` is empty (no transactions) → `PortfolioOverviewTable` placeholder renders without crashing
- `etfs` is an empty array → `EtfRegistryTable` renders the existing empty-state message unchanged

---

### Open Questions / Risks

- [ ] **`PortfolioOverviewTable` placeholder shape:** TASK-3 will slot the real table into the "Portfolio" tab. The placeholder rendered here must accept `rows: PortfolioRowResponse[]` as a prop so TASK-3 is a drop-in replacement with no changes to `PortfolioPageClient`. Agree on the prop interface before closing this issue. **Target:** before TASK-3 begins.
- [ ] **`revalidateTag` coordination across five actions:** Missing any one of the five `revalidateTag('portfolio-overview')` calls leaves the Overview stale after a write. Verify all five are present before merging. **Target:** PR review checklist.
