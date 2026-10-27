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

**Out of scope:**

- Any backend change (TASK-1 and TASK-2 are done: `POST /etfs/prices/refresh` and `price_symbol` already exist)
- The Timeline Chart and any use of `fetchPriceHistory` (TASK-4)
- Removing the manual `POST`/`PUT`/`DELETE /etfs/{id}/price…` backend endpoints (the RFC keeps them)
- Clearing a set `price_symbol` back to `NULL` through the form (see Open Questions)
- Adding a frontend test framework (none exists; see Testing Strategy)

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
| `frontend/app/(tabularium)/tabularium/components/EtfRegistryTable.tsx`          | Modify | Drop `expandedEtfId`, `priceHistoryMap`, `refreshPriceHistory`, `handleRowClick`, the history `<tr>`, the `▸`/`▾` marker, the row-click handler and `cursor-pointer`, and the imports `Fragment`, `fetchPriceHistory`, `EtfPriceEntry`, `PriceUpdateButton`, `PriceHistoryRow` |
| `frontend/app/(tabularium)/tabularium/components/PriceUpdateButton.tsx`         | Delete | Manual price entry                                                                                |
| `frontend/app/(tabularium)/tabularium/components/PriceHistoryRow.tsx`           | Delete | Manual price edit/delete row                                                                      |
| `frontend/app/(tabularium)/tabularium/components/EtfForm.tsx`                   | Modify | `price_symbol` input, state, initial value and empty-string handling                              |

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

- Notes: the button label shows the selection ("Update prices · All ETFs" / "· 2 of 3"), is disabled while pending or with nothing selected, and shows "Updating…" while pending (a first full-history fetch can take several seconds). Results render as one row per ETF — ticker, `Updated · N rows` or `Failed · <error>` (failed in `roman-terracotta`) — under a one-line count ("3 updated, 1 failed"), with a dismiss control. Component state survives the `revalidateTag` refresh because the component is not remounted.

```ts
// components/EtfForm.tsx — additions
//   EtfResponse.price_symbol: string | null
//   FormState.price_symbol: string   (initial: etf.price_symbol ?? "" )
//   handleSubmit: if (formState.price_symbol === "") delete rawData.price_symbol
```

- Notes: the input sits with the identification fields (ticker, ISIN), placeholder `e.g. VWCE.DE`, with a short hint: "Market-data symbol used for automatic price updates. Leave empty to use the ticker." Empty strings are dropped before validation, matching the other optional fields.

---

### Data Models / Schemas

```ts
// etf-schema.ts — EtfFormSchema addition
price_symbol: z.string().max(30).optional(),
```

`max(30)` mirrors the backend's `String(30)` and `EtfCreate.price_symbol`. `EtfPriceRefreshResult` mirrors the backend's `EtfPriceRefreshResult` Pydantic model field for field (`ticker`, `status`, `rows_written`, `error`, plus `etf_id`).

---

### Testing Strategy

The frontend has no unit-test framework (only a Playwright screenshot spec) and this task does not add one, so verification is static plus manual.

**Static checks** (from `frontend/`):

- `npx tsc --noEmit` — no references remain to the deleted actions/components, and the new types line up
- `npm run lint` — if the project's lint is configured (confirm it does not prompt for interactive setup)
- `npm run build` — the production build, as CI runs it; the ETF Registry route compiles

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

- [ ] **The registry is no longer a Portfolio tab:** the RFC, planning doc and frontend README describe the ETF Registry as a tab inside `/tabularium/portfolio` and the Tabularium as having exactly two sub-routes, but the code already serves it at `/tabularium/etf-registry` (with `TabulariumSubNav` listing three links). This spec mounts the control in `etf-registry/page.tsx`. The README invariant and the RFC wording are stale; the README gets corrected when this task lands. **Target:** confirm at implementation start
- [ ] **`PriceHistoryRow.tsx` also deleted:** it is not in the planning doc, but it is only used by the history sub-table being removed and is the sole caller of `updatePriceSnapshot`/`deletePriceSnapshot`. **Target:** confirm at implementation start
- [ ] **Five cache tags, not three:** the RFC and planning doc name `etfs`, `portfolio-overview` and `holdings-exposure`; every existing ETF write action also revalidates `holdings-geography` and `holdings-sectors`. `refreshEtfPrices` follows the code (five), since price changes alter the values those views derive. **Target:** none unless you object
- [ ] **`price_symbol` cannot be cleared from the form:** `PUT /etfs/{id}` ignores `null` fields, so emptying the input leaves the stored value. Decision for this task: not clearable; setting it equal to the ticker is behaviourally the same as `NULL` (fallback is the ticker). **Target:** revisit only if a real need appears
- [ ] **ETFs created before TASK-2 have no `price_symbol`:** a bare ticker like `VWCE` is not a valid Yahoo symbol, so those ETFs show `Failed · Provider returned HTTP 404`. The user sets the symbol via Edit (the seed JSON already carries it). Consider a friendlier hint in the failure row if this proves confusing. **Target:** after first real use
- [ ] **Long-running Server Action:** a first full-history refresh for several ETFs is one synchronous request; the UI only shows "Updating…". Acceptable at the current registry size (RFC FAQ). **Target:** revisit if the registry grows
- [ ] **No frontend test coverage:** the Server Action, the empty-selection guard and the component are verified manually only. **Target:** decide separately whether to introduce a test framework
