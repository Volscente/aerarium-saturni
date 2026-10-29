# #76: Update Prices Control and Manual Price Removal

**GitHub Issue:** [76 — Registry UI and Timeline Chart](https://github.com/Volscente/aerarium-saturni/issues/76)
**GitHub Milestone:** [16-etf-price-history](https://github.com/Volscente/aerarium-saturni/milestone/12)
**Notion page:** [ETF Price History](https://app.notion.com/p/16-ETF-Price-History-3f65cc6c0f0780ac9bbfe316750fcac2)

---

## Technical Scope

**In scope:**

- `frontend/app/(tabularium)/tabularium/etf-actions.ts` — new `refreshEtfPrices` Server Action; remove `addPriceSnapshot`, `updatePriceSnapshot`, `deletePriceSnapshot`; keep `fetchPriceHistory` and `EtfPriceEntry` (TASK-4 reuses them)
- `frontend/app/(tabularium)/tabularium/etf-schema.ts` — `price_symbol` on `EtfFormSchema`; new `EtfPriceRefreshSchema`
- `frontend/app/(tabularium)/tabularium/components/UpdatePricesButton.tsx` — new client component: "Update prices" button, ETF selection (all by default), pending state, inline per-ETF result summary
- `frontend/app/(tabularium)/tabularium/etf-registry/page.tsx` — mount the control between the header and the table
- `frontend/app/(tabularium)/tabularium/components/EtfRegistryTable.tsx` — remove the expandable history row and every piece of state and import that only served it
- `frontend/app/(tabularium)/tabularium/components/PriceUpdateButton.tsx` — deleted
- `frontend/app/(tabularium)/tabularium/components/PriceHistoryRow.tsx` — deleted (not in the planning doc; its only consumer is the history sub-table and its only actions are the two removed Server Actions)
- `frontend/app/(tabularium)/tabularium/components/EtfForm.tsx` — `price_symbol` field and `EtfResponse.price_symbol`
- `frontend/app/(tabularium)/tabularium/components/TabulariumSubNav.tsx`, `AddEtfButton.tsx` — docstring corrections only (see Documentation updates)
- `frontend/README.md`, `README.md`, `CLAUDE.md` — repository documentation corrections for the ETF Registry route and this task's changes (see Documentation updates)

**Out of scope:**

- Any backend change (TASK-1 and TASK-2 are done: `POST /etfs/prices/refresh` and `price_symbol` already exist)
- The Timeline Chart and any use of `fetchPriceHistory` (TASK-4)
- Removing the manual `POST`/`PUT`/`DELETE /etfs/{id}/price…` backend endpoints (the RFC keeps them)
- Clearing a set `price_symbol` back to `NULL` through the form (see Open Questions)
- Adding a frontend test framework (none exists; see Testing Strategy)
- Adding `/tabularium/etf-registry` to `.lighthouserc.js` (the route is currently not audited; nothing documents that it should be)
- Editing previous initiatives' documents (`.claude/14-*`, the RFC and planning doc of this initiative): they are historical artifacts

---

## Architecture

```txt
/tabularium/etf-registry   (Server Component, force-dynamic, fetch GET /etfs  tag: etfs)
          │  etfs: EtfResponse[]
          ├────────────────────────────────────────────┐
          ▼                                            ▼
  <UpdatePricesButton etfs=…/>                 <EtfRegistryTable etfs=…/>
   'use client'                                 (no history sub-table any more)
   excluded: Set<string>   ← deselected ids; selected = etfs − excluded
   │  "Update prices"
   ▼
  refreshEtfPrices(selectedIds)                 Server Action  (etf-actions.ts)
   │  EtfPriceRefreshSchema.safeParse({ etf_ids })   → min(1), uuid[]
   │  POST ${BACKEND_URL}/etfs/prices/refresh  { etf_ids }
   │        └─ 200 → list[EtfPriceRefreshResult]
   │  revalidateTag × 5  (etfs, portfolio-overview, holdings-exposure,
   │                      holdings-geography, holdings-sectors)
   ▼
  { results } | { error }  →  inline summary under the button
```

### Track the deselected ETFs, not the selected ones

The selection is stored as a set of *excluded* ids and derived as `etfs.filter(e => !excluded.has(e.id))`. "All selected" is therefore the empty-set default, a newly added ETF is selected automatically after the page revalidates, and a deleted ETF silently drops out, with no effect syncing a stored selection to a changing `etfs` prop.

### An empty selection must never mean "everything"

The backend treats an omitted or empty `etf_ids` as *all ETFs*. The UI always sends the explicit selected ids and disables the button at zero selected; `EtfPriceRefreshSchema` also requires at least one id, so a deselect-all can never become a refresh-all, even if the UI guard regresses.

---

## Tech Stack

No new packages required. `zod` (already `^4.4.3`) validates the selection; `lucide-react` (already used by `AddEtfButton`) supplies the button icon.

---

## Implementation Details

### Modules / Files

| File                                                                            | Action | Description                                                                                       |
| ------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| `frontend/app/(tabularium)/tabularium/etf-actions.ts`                           | Modify | Add `refreshEtfPrices` and `EtfPriceRefreshResult`; delete the three manual-price actions         |
| `frontend/app/(tabularium)/tabularium/etf-schema.ts`                            | Modify | `price_symbol` in `EtfFormSchema`; `EtfPriceRefreshSchema`                                        |
| `frontend/app/(tabularium)/tabularium/components/UpdatePricesButton.tsx`        | Create | Trigger, selection, pending state, per-ETF results                                                |
| `frontend/app/(tabularium)/tabularium/etf-registry/page.tsx`                    | Modify | Render `<UpdatePricesButton>` when there is at least one ETF                                      |
| `frontend/app/(tabularium)/tabularium/components/EtfRegistryTable.tsx`          | Modify | Drop `expandedEtfId`, `priceHistoryMap`, `refreshPriceHistory`, `handleRowClick`, the history `<tr>`, the `▸`/`▾` marker, the row-click handler and `cursor-pointer`, and the imports `Fragment`, `fetchPriceHistory`, `EtfPriceEntry`, `PriceUpdateButton`, `PriceHistoryRow`; update the component docstring, which still lists `PriceUpdateButton` among the per-row actions |
| `frontend/app/(tabularium)/tabularium/components/PriceUpdateButton.tsx`         | Delete | Manual price entry                                                                                |
| `frontend/app/(tabularium)/tabularium/components/PriceHistoryRow.tsx`           | Delete | Manual price edit/delete row                                                                      |
| `frontend/app/(tabularium)/tabularium/components/EtfForm.tsx`                   | Modify | `price_symbol` input, state, initial value and empty-string handling                              |
| `frontend/app/(tabularium)/tabularium/components/TabulariumSubNav.tsx`          | Modify | Docstring only: three links / three sub-routes                                                    |
| `frontend/app/(tabularium)/tabularium/components/AddEtfButton.tsx`              | Modify | Docstring only: mounted in `etf-registry/page.tsx`, not `portfolio/page.tsx`                      |
| `frontend/README.md`                                                            | Modify | See Documentation updates                                                                         |
| `README.md`                                                                     | Modify | ETF Registry feature bullets                                                                      |
| `CLAUDE.md`                                                                     | Modify | Sub-route invariant                                                                               |

---

### Key Functions

```ts
// etf-schema.ts
export const EtfPriceRefreshSchema = z.object({
  etf_ids: z.array(z.uuid()).min(1, 'Select at least one ETF'),
})
```

```ts
// etf-actions.ts
export interface EtfPriceRefreshResult {
  etf_id: string
  ticker: string
  status: 'updated' | 'failed'
  rows_written: number
  error: string | null
}

export async function refreshEtfPrices(
  etfIds: string[]
): Promise<{ results: EtfPriceRefreshResult[] } | { error: string }>
  // Validate the selection, POST it to /etfs/prices/refresh, revalidate the ETF-derived cache tags, return per-ETF results.
```

- Notes: the five tags are the same set every other ETF write action revalidates (`etfs`, `portfolio-overview`, `holdings-exposure`, `holdings-geography`, `holdings-sectors`), and they are revalidated on any HTTP 200 — including when some ETFs failed, because the others were written. A 404 maps to `{ error: 'ETF not found' }`; any other non-200 to `{ error: 'Backend error <status>: <body>' }`; a thrown fetch to `{ error: <message> }`. The backend response is always 200 once ids resolve, so a failed ETF appears in `results`, not in `error`.

```tsx
// components/UpdatePricesButton.tsx
export interface UpdatePricesButtonProps {
  etfs: Pick<EtfResponse, 'id' | 'ticker' | 'name'>[]
}

export function UpdatePricesButton({ etfs }: UpdatePricesButtonProps): JSX.Element
  // Selection disclosure + "Update prices" button; calls refreshEtfPrices in a transition and renders the result summary.
```

- Notes: the button label shows the selection ("Update prices · All ETFs" / "· 2 of 3"), is disabled while pending or with nothing selected, and shows "Updating…" while pending (a first full-history fetch can take several seconds). Results render as one row per ETF — ticker, `Updated · N rows` or `Failed · <error>` (failed in `roman-terracotta`) — under a one-line count ("3 updated, 1 failed"), with a dismiss control. When at least one ETF failed, one static hint line follows the summary: "Failed updates usually mean the ETF's price symbol is missing or wrong — set it with Edit (e.g. VWCE.DE)." Component state survives the `revalidateTag` refresh because the component is not remounted.

```ts
// components/EtfForm.tsx — additions
//   EtfResponse.price_symbol: string | null
//   FormState.price_symbol: string   (initial: etf.price_symbol ?? "" )
//   handleSubmit: if (formState.price_symbol === "") delete rawData.price_symbol
```

- Notes: the input sits with the identification fields (ticker, ISIN), placeholder `e.g. VWCE.DE`, with a short hint: "Market-data symbol used for automatic price updates. Leave empty to use the ticker, or enter the ticker to go back to it." Empty strings are dropped before validation, matching the other optional fields.

---

### Data Models / Schemas

```ts
// etf-schema.ts — EtfFormSchema addition
price_symbol: z.string().max(30).optional(),
```

`max(30)` mirrors the backend's `String(30)` and `EtfCreate.price_symbol`. `EtfPriceRefreshResult` mirrors the backend's `EtfPriceRefreshResult` Pydantic model field for field (`ticker`, `status`, `rows_written`, `error`, plus `etf_id`).

---

### Documentation updates

The ETF Registry has been its own route (`/tabularium/etf-registry`) and sub-nav tab for some time; the code is right and the documentation lags. This task corrects it, in the same pass that documents its own changes.

**`frontend/README.md`**

- Key components, `TabulariumSubNav`: three nav links, adding `/tabularium/etf-registry`
- Key components, `AddEtfButton`: mounted in `etf-registry/page.tsx` (not in `PortfolioPageClient`'s tab body)
- Key components: add `etf-registry/page.tsx` (Server Component, `force-dynamic`, `GET /etfs` with the `etfs` tag; renders the header with `AddEtfButton`, `UpdatePricesButton`, and `EtfRegistryTable`) and the new `UpdatePricesButton`
- Key components, `EtfRegistryTable`: drop the history sub-table, `expandedEtfId`, `priceHistoryMap` and `PriceUpdateButton`; remove `PriceUpdateButton` and `PriceHistoryRow` entries if present
- Key components, `etf-actions.ts` and `etf-schema.ts`: add `refreshEtfPrices` / `EtfPriceRefreshSchema` / `price_symbol`; drop the three removed price Server Actions
- Public interfaces: add `GET /tabularium/etf-registry`
- Constraints / invariants: "exactly **two** sub-routes" becomes "exactly **three** sub-routes: `/tabularium/portfolio`, `/tabularium/transactions` and `/tabularium/etf-registry`", keeping the rule against adding another without first consolidating or splitting
- Changelog: new entry for this task; existing history entries stay untouched

**Docstrings**

- `TabulariumSubNav.tsx`: "Renders two links covering the two Tabularium sub-routes" becomes three links / three sub-routes
- `AddEtfButton.tsx`: "Mounted inside portfolio/page.tsx" becomes `etf-registry/page.tsx`

**`README.md` (root)**

- "ETF Registry" section: replace "Manual price snapshots" with automated price retrieval and history (Update prices button, per-ETF selection, Timeline Chart arriving in TASK-4), and "price update" in the registry-table bullet accordingly

**`CLAUDE.md`**

- Frontend key invariants (line 129): the same "exactly two sub-routes" rule, updated to three as above
- Frontend key files (line 103): `TabulariumSubNav` is described as having "two active-state links"; make it three, adding `/tabularium/etf-registry`
- Frontend public routes table: add `GET /tabularium/etf-registry` if it is missing

---

### Testing Strategy

The frontend has no unit-test framework; Playwright runs in CI only for Home/Codex visual regression, without a backend. This task adds no tests, so verification is static plus manual.

**Static checks** (from `frontend/`):

- `npx tsc --noEmit` — clean today (baseline checked); no references remain to the deleted actions/components, and the new types line up. There is no ESLint config or dependency, so `npm run lint` is not a usable check
- `npm run build` — the production build, as CI runs it; the ETF Registry route compiles
- `grep -rniE "two sub-route|two (nav )?links|inside portfolio/page|ETF Registry\" tab" README.md CLAUDE.md frontend/README.md frontend/app frontend/theme` — no stale statement remains outside the changelog history entries

**Manual verification** (`just run_services`, `just frontend-dev-watch`, `just seed_data` after migrations; `price_symbol` comes from the seed JSON):

- ETF Registry shows "Update prices" with "All ETFs" selected; rows no longer expand, there is no chevron and no "Price" button
- Update all → per-ETF `Updated · N rows`; `/tabularium/portfolio` then shows current values computed from the new prices (cache tags revalidated)
- Deselect some ETFs → label reads "N of M"; only those ETFs appear in the results; deselect all → button disabled
- Update a second time → small `rows_written` per ETF (incremental), no errors
- Edit an ETF, set `price_symbol` to an invalid value (e.g. `NOPE.XX`) → that ETF shows `Failed · Provider returned HTTP 404 …`, the others still update
- Add ETF and Edit ETF forms show the `price_symbol` field; value round-trips after save
- Stop the backend and press Update → an inline error, no crash

**Edge cases:**

- Zero ETFs registered → the control is not rendered (page already shows "No ETFs registered yet.")
- ETF added after the page loaded → included in "All ETFs" after revalidation
- ETF deleted while selected → drops out of the selection without error
- Double click while pending → ignored (button disabled)

---

### Open Questions / Risks

- [x] **ETF Registry route vs. documentation:** the registry is its own route and sub-nav tab; the stale statements were in the frontend README, two docstrings and `CLAUDE.md` (the RFC and planning doc also say "tab" / "two sub-routes" but are historical artifacts, left as they are). Resolved: this task fixes them (see Documentation updates) and mounts the control in `etf-registry/page.tsx`. **Answer:** repository documentation must be updated.
- [x] **`PriceHistoryRow.tsx` also deleted:** verified by grep: `PriceHistoryRow`, `PriceUpdateButton`, `addPriceSnapshot`, `updatePriceSnapshot` and `deletePriceSnapshot` are referenced only by `EtfRegistryTable.tsx`, each other and `etf-actions.ts`, so deleting them leaves no dangling import. **Decision:** delete `PriceHistoryRow.tsx` along with `PriceUpdateButton.tsx`.
- [x] **Five cache tags, not three:** verified: every ETF write path (`createEtf`, `updateEtf`, `deleteEtf` and the price actions) revalidates `etfs`, `portfolio-overview`, `holdings-exposure`, `holdings-geography` and `holdings-sectors`. **Decision:** `refreshEtfPrices` revalidates the same five, since new prices change what the portfolio, geography and sector views derive.
- [x] **`price_symbol` cannot be cleared from the form:** `PUT /etfs/{id}` ignores `null` fields, so emptying the input leaves the stored value. **Decision:** not clearable in this task; the form hint tells users to enter the ticker to get the fallback behaviour (a `price_symbol` equal to the ticker is equivalent to `NULL`). Revisit only if a real need appears.
- [x] **ETFs created before TASK-2 have no `price_symbol`:** a bare ticker like `VWCE` is not a valid Yahoo symbol, so those ETFs fail with `Provider returned HTTP 404`. **Decision:** when any ETF in a result set failed, `UpdatePricesButton` shows one static hint line under the summary: "Failed updates usually mean the ETF's price symbol is missing or wrong — set it with Edit (e.g. VWCE.DE)." No per-error parsing. The seed JSON already carries `price_symbol`, so a fresh `just seed_data` is unaffected.
- [x] **Long-running Server Action:** a first full-history refresh is one synchronous request (it took seconds for the three seed ETFs). The backend bounds each provider call at 15 s and runs at most 3 in parallel. **Decision:** accepted at the current registry size. One deployment caveat: `nginx/subdomain.conf` and `path-based.conf` set no `proxy_read_timeout`, so behind nginx the default of 60 s applies and a very long refresh would surface as a 504; direct `npm run dev` / `npm run start` has no such limit. Revisit (raise the timeout or move to a background job) if the registry grows.
- [x] **No frontend test coverage:** correction to the earlier wording — Playwright is installed and runs in CI, but only for visual/mobile regression of the Home and Codex pages (`tests/mobile-screenshot.spec.ts`), and the CI job has no backend or database, so it cannot exercise this feature. **Decision:** no test framework or e2e test is added in this task; verification is `tsc` + `build` + the manual checklist.
