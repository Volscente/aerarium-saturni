# #41: Administrative Management UI

**GitHub Issue:** [#41 — Administrative Management UI](https://github.com/Volscente/aerarium-saturni/issues/41)
**GitHub Milestone:** [Milestone: 9-etf-asset-registry](https://github.com/Volscente/aerarium-saturni/milestone/7)
**Notion page:** [9 — ETF Asset Registry](https://app.notion.com/p/9-ETF-Asset-Registry-37f5cc6c0f07805eb578f4c9a6bfbab6)

---

## Technical Scope

**In scope:**

- `frontend/app/(tabularium)/tabularium/portfolio/page.tsx` — Promote from `return null` placeholder to Server Component; fetch `GET /etfs` with `etfs` cache tag; render right-aligned `AddEtfButton` bar and `EtfRegistryTable`
- `frontend/app/(tabularium)/tabularium/etf-schema.ts` — Zod `EtfFormSchema` and `EtfFormValues` type; no directive; importable by server and client; mirrors `transaction-schema.ts`
- `frontend/app/(tabularium)/tabularium/etf-actions.ts` — `'use server'` — `createEtf`, `updateEtf`, `deleteEtf`, `addPriceSnapshot`; each calls `revalidateTag('etfs')` after a successful backend write
- `frontend/app/(tabularium)/tabularium/components/EtfRegistryTable.tsx` — `'use client'`; owns filter state (ticker prefix, asset class dropdown, issuer prefix) and edit-drawer state; renders filtered rows with per-row actions
- `frontend/app/(tabularium)/tabularium/components/AddEtfButton.tsx` — `'use client'`; trigger button; owns `isDrawerOpen` state; mounts `EtfDrawer` in create mode
- `frontend/app/(tabularium)/tabularium/components/EtfDrawer.tsx` — `'use client'`; fixed right-side slide-in panel; mirrors `TransactionDrawer`
- `frontend/app/(tabularium)/tabularium/components/EtfForm.tsx` — `'use client'`; create/edit form with asset-class-conditional field visibility; Zod validation on submit
- `frontend/app/(tabularium)/tabularium/components/PriceUpdateButton.tsx` — `'use client'`; per-row inline price snapshot form; calls `addPriceSnapshot` Server Action
- `frontend/app/(tabularium)/tabularium/components/HoldingsUpload.tsx` — `'use client'`; `<input type="file" accept=".csv">`; direct `fetch` to `POST /etfs/{id}/holdings/upload`; renders row-count confirmation or row-level error

**Out of scope:**

- `frontend/app/(tabularium)/tabularium/layout.tsx` — not modified; `AddEtfButton` is mounted inside `portfolio/page.tsx`, not in the shared layout shell
- Any new Tabularium sub-route; the ETF registry lives entirely within `/tabularium/portfolio`
- Backend files (`src/backend/schemas/etfs.py`, `src/backend/routers/etfs.py`, `src/backend/models.py`) — completed in TASK-1 and TASK-2; do not modify
- Portfolio analytics, P&L charts, or performance visualizations — deferred to a future initiative

---

## Architecture

```txt
Browser: GET /tabularium/portfolio
              │
              ▼
  portfolio/page.tsx  (Server Component — no directive)
    │  export const dynamic = 'force-dynamic'
    │  fetchEtfs() → fetch ${BACKEND_URL}/etfs
    │                     { next: { tags: ['etfs'] } }
    │
    ├── <div class="flex justify-end ...">   ← right-aligned bar inside page (not layout)
    │     <AddEtfButton />                   ← 'use client'; owns isDrawerOpen
    │           └── <EtfDrawer isOpen onClose>
    │                 └── <EtfForm mode="create" onSuccess />
    │                       │  EtfFormSchema.safeParse → createEtf(payload)
    │                       └── etf-actions.ts: POST /etfs → revalidateTag('etfs')
    │
    └── <EtfRegistryTable etfs={etfs} />    ← 'use client'; filter + edit-drawer state
          │  ticker / asset_class / issuer inputs → client-side filtered rows
          │
          ├── [row] Edit button
          │     └── <EtfDrawer isOpen onClose>
          │           └── <EtfForm mode="edit" etf={row} onSuccess />
          │                 └── etf-actions.ts: PUT /etfs/{id} → revalidateTag('etfs')
          │
          ├── [row] Delete button
          │     └── etf-actions.ts: DELETE /etfs/{id} → revalidateTag('etfs')
          │
          ├── [row] <PriceUpdateButton etfId={row.id} />
          │     └── inline price/currency/timestamp form
          │           └── etf-actions.ts: POST /etfs/{id}/price → revalidateTag('etfs')
          │
          └── [row] <HoldingsUpload etfId={row.id} />
                └── <input type="file" accept=".csv">
                      └── fetch POST /etfs/{id}/holdings/upload   (direct — not Server Action)
                            ← { inserted_rows: n } or 422 { row, field, error }
```

### Why `AddEtfButton` is mounted in `portfolio/page.tsx`, not in the layout

`AddTransactionButton` sits in the Tabularium layout because it must be visible on every sub-route. `AddEtfButton` is semantically scoped to the ETF registry — it must not appear on the transactions ledger. Placing it inside `portfolio/page.tsx` as a right-aligned bar (same visual pattern as the layout bar, different mount point) satisfies both the UX requirement and the layout invariant.

### Why `HoldingsUpload` does not use a Server Action

Server Actions receive form data through Next.js's internal serialization layer, which does not support streaming `multipart/form-data` file uploads. The backend's `POST /etfs/{id}/holdings/upload` endpoint expects a FastAPI `UploadFile`. `HoldingsUpload` sends the file directly via `fetch` with a `FormData` body, bypassing Server Actions entirely for this operation only.

---

## Tech Stack

No new packages required. Zod (`^4.4.3`), Tailwind CSS, Lucide React, and Next.js 15 are already present.

---

## Implementation Details

### Modules / Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `app/(tabularium)/tabularium/portfolio/page.tsx` | Modify | Promote to Server Component; `fetchEtfs()` with `etfs` cache tag; render `AddEtfButton` + `EtfRegistryTable`; empty-state message when list is empty |
| `app/(tabularium)/tabularium/etf-schema.ts` | Create | Zod `EtfFormSchema` and `EtfFormValues` type; no directive; ISIN regex; JSONB fields as JSON strings in form |
| `app/(tabularium)/tabularium/etf-actions.ts` | Create | `'use server'` — `createEtf`, `updateEtf`, `deleteEtf`, `addPriceSnapshot`; return `{ success: true } \| { error: string }` |
| `app/(tabularium)/tabularium/components/EtfRegistryTable.tsx` | Create | `'use client'` — filter inputs, filtered row rendering, per-row edit/delete/price/upload actions |
| `app/(tabularium)/tabularium/components/AddEtfButton.tsx` | Create | `'use client'` — trigger button (Lucide `Plus`, roman-* tokens); owns `isDrawerOpen`; mounts `EtfDrawer` |
| `app/(tabularium)/tabularium/components/EtfDrawer.tsx` | Create | `'use client'` — fixed right-side slide-in; `translate-x-full` / `translate-x-0`; backdrop; mirrors `TransactionDrawer` |
| `app/(tabularium)/tabularium/components/EtfForm.tsx` | Create | `'use client'` — create/edit form; `assetClass` state drives field visibility; Zod validation on submit |
| `app/(tabularium)/tabularium/components/PriceUpdateButton.tsx` | Create | `'use client'` — toggle inline form; price, currency, timestamp inputs; calls `addPriceSnapshot` |
| `app/(tabularium)/tabularium/components/HoldingsUpload.tsx` | Create | `'use client'` — file input; `fetch FormData` to backend; renders inserted row count or structured error |
| `app/(tabularium)/tabularium/components/TransactionDrawer.tsx` | Reuse | Pattern reference — do not modify |
| `app/(tabularium)/tabularium/components/TransactionForm.tsx` | Reuse | Pattern reference — do not modify |
| `app/(tabularium)/tabularium/actions.ts` | Reuse | `createTransaction` — do not modify |

---

### Key Functions

```typescript
async function fetchEtfs(): Promise<EtfResponse[]> {
  /**
   * Fetch all ETFs from the backend with the Next.js on-demand cache tag.
   *
   * Calls GET ${process.env.BACKEND_URL}/etfs with { next: { tags: ['etfs'] } }
   * so that revalidateTag('etfs') in any Server Action immediately expires this
   * cached fetch result. Follows the same error-suppression pattern as
   * fetchTransactions in transactions/page.tsx — returns [] on any network
   * error or non-2xx response so the page renders the empty-state UI.
   *
   * Returns:
   *   Array of EtfResponse objects; empty array on any fetch or HTTP error.
   */
}
```

```typescript
export async function createEtf(
  payload: EtfFormValues
): Promise<{ success: true } | { error: string }> {
  /**
   * Server Action: validate, persist, and invalidate the ETF registry cache.
   *
   * Parses payload with EtfFormSchema. On success, transforms the JSONB string
   * fields back to Record<string, number> by JSON.parse before POSTing to
   * ${BACKEND_URL}/etfs. On HTTP 201, calls revalidateTag('etfs') and returns
   * { success: true }. Mirrors createTransaction in actions.ts.
   *
   * Args:
   *   payload: EtfFormValues from EtfForm; validated client-side, re-validated
   *            here before the backend call.
   *
   * Returns:
   *   { success: true } on HTTP 201, or { error: string } on Zod or HTTP failure.
   */
}
```

```typescript
export async function updateEtf(
  id: string,
  payload: Partial<EtfFormValues>
): Promise<{ success: true } | { error: string }> {
  /**
   * Server Action: partially update an ETF and invalidate the registry cache.
   *
   * PUTs to ${BACKEND_URL}/etfs/{id} sending only non-undefined fields. On
   * HTTP 200, calls revalidateTag('etfs'). On 404, returns a descriptive error.
   *
   * Args:
   *   id: UUID string of the ETF to update.
   *   payload: Partial EtfFormValues; undefined-value keys are omitted from the
   *            JSON body to match the backend's EtfUpdate partial-update semantics.
   *
   * Returns:
   *   { success: true } on HTTP 200, or { error: string } on any failure.
   */
}
```

```typescript
export async function deleteEtf(
  id: string
): Promise<{ success: true } | { error: string }> {
  /**
   * Server Action: delete an ETF and its cascaded holdings and price history.
   *
   * DELETEs ${BACKEND_URL}/etfs/{id}. On HTTP 204, calls revalidateTag('etfs').
   * Cascade deletion of etf_holdings and etf_price_history rows is handled by
   * the database ON DELETE CASCADE constraint established in TASK-1.
   *
   * Args:
   *   id: UUID string of the ETF to delete.
   *
   * Returns:
   *   { success: true } on HTTP 204, or { error: string } on 404 or network failure.
   */
}
```

```typescript
export async function addPriceSnapshot(
  id: string,
  price: number,
  currency: string,
  timestamp: string
): Promise<{ success: true } | { error: string }> {
  /**
   * Server Action: append a manual price snapshot to etf_price_history.
   *
   * POSTs to ${BACKEND_URL}/etfs/{id}/price with { price, currency, timestamp }.
   * On HTTP 201, calls revalidateTag('etfs'). On 404, returns { error: 'ETF not found' }.
   *
   * Args:
   *   id: UUID string of the parent ETF.
   *   price: Positive numeric price in the given currency.
   *   currency: ISO 4217 3-character code (e.g. "EUR").
   *   timestamp: ISO 8601 datetime string for the observation point.
   *
   * Returns:
   *   { success: true } on HTTP 201, or { error: string } on any failure.
   */
}
```

---

### Data Models / Schemas

```typescript
// TypeScript interface matching EtfResponse from src/backend/schemas/etfs.py
// Decimal fields arrive as strings from FastAPI JSON serialization (matching
// the existing pattern in transactions/page.tsx: quantity: string, fees: string)
interface EtfResponse {
  id: string
  ticker: string
  isin: string
  name: string
  issuer: string
  asset_class: string
  tracked_index: string
  ter: string
  domicile: string
  currency_hedged: boolean
  fiscal_year_end: string
  german_tax_classification: string
  replication_strategy: string
  dividend_policy: string
  dividend_frequency: string | null
  fund_size: string | null
  monthly_volume: string | null
  volatility_1y: string | null
  volatility_3y: string | null
  holdings_overview: string | null
  geographical_distribution: Record<string, number>
  sector_distribution: Record<string, number>
  bond_maturities: Record<string, number> | null
  bond_credit_scores: Record<string, number> | null
  created_at: string
}
```

```typescript
// etf-schema.ts (no directive — importable by server and client)
// JSONB distribution fields are captured as JSON strings in the form textarea.
// The Server Action parses them to Record<string, number> before sending to the backend.
const ISIN_REGEX = /^[A-Z0-9]{12}$/

export const EtfFormSchema = z.object({
  ticker: z.string().min(1).max(20),
  isin: z.string().regex(ISIN_REGEX, 'ISIN must be 12 alphanumeric characters'),
  name: z.string().min(1).max(200),
  issuer: z.string().min(1).max(100),
  asset_class: z.string().min(1).max(50),
  tracked_index: z.string().min(1).max(200),
  ter: z.coerce.number().positive('TER must be positive'),
  domicile: z.string().min(1).max(50),
  currency_hedged: z.boolean().default(false),
  fiscal_year_end: z.string().min(1).max(10),
  german_tax_classification: z.string().min(1).max(50),
  replication_strategy: z.string().min(1).max(50),
  dividend_policy: z.string().min(1).max(50),
  dividend_frequency: z.string().max(20).optional(),
  fund_size: z.coerce.number().positive().optional(),
  monthly_volume: z.coerce.number().positive().optional(),
  volatility_1y: z.coerce.number().min(0).optional(),
  volatility_3y: z.coerce.number().min(0).optional(),
  holdings_overview: z.string().optional(),
  // Raw JSON string from textarea; parsed to Record<string, number> in the Server Action
  geographical_distribution: z.string().min(1, 'Geographical distribution is required'),
  sector_distribution: z.string().min(1, 'Sector distribution is required'),
  // Bonds-only fields — rendered only when asset_class === 'Bonds'
  bond_maturities: z.string().optional(),
  bond_credit_scores: z.string().optional(),
})

export type EtfFormValues = z.infer<typeof EtfFormSchema>
```

**`EtfForm` field visibility matrix:**

| Field group | Shown when |
| --- | --- |
| All scalar fields (ticker, isin, name, issuer, etc.) | Always |
| `bond_maturities`, `bond_credit_scores` | `assetClass === 'Bonds'` |
| `fund_size`, `monthly_volume`, `volatility_1y`, `volatility_3y` | `assetClass === 'Equities'` |

**`EtfForm` edit mode:** Accepts an optional `etf?: EtfResponse` prop. When present, form fields are pre-populated from `etf`. JSONB fields (`geographical_distribution`, `sector_distribution`, `bond_maturities`, `bond_credit_scores`) are serialized back to JSON strings via `JSON.stringify(etf.geographical_distribution, null, 2)` for the textarea initial value.

---

### Testing Strategy

No automated unit tests for this task — the existing test stack is backend-only (pytest). The frontend has no Jest or Vitest setup.

**Integration test (manual):**

```bash
# Start full stack
just backend-dev       # → http://localhost:8000
cd frontend && npm run dev   # → http://localhost:3000

open http://localhost:3000/tabularium/portfolio
```

Golden path checklist:

1. Page loads empty-state message ("No ETFs registered yet.") when the backend returns `[]`.
2. Click "Add ETF" → drawer slides in from the right.
3. Fill all required fields; set `asset_class` to "Bonds" → `bond_maturities` and `bond_credit_scores` textareas appear.
4. Enter valid JSON in the JSONB textareas (e.g. `{"IE": 30.0, "US": 70.0}`).
5. Submit → drawer closes → ETF row appears in the table; "Add ETF" button is visible only on this page (not on `/tabularium/transactions`).
6. Filter by ticker prefix → rows filter client-side instantly.
7. Click "Edit" on a row → drawer pre-fills with existing values → modify one field → Save → row updates.
8. Click "Delete" on a row → row disappears from table.
9. Click price button → inline form appears → submit price, currency, timestamp → confirmation closes form.
10. Upload a well-formed CSV on a row → "Inserted 42 rows" confirmation message.
11. Upload a malformed CSV → "Row 3: company_name — field required" error message.
12. Run `lhci autorun` → `/tabularium/portfolio` performance score ≥ 0.9.

**Edge cases:**

- `EtfForm` with invalid JSON in `geographical_distribution` → client-side parse error shown before Server Action is called
- `EtfForm` `asset_class` toggled Bonds → other → bond fields disappear; their values are not submitted
- `HoldingsUpload` with zero-row CSV → `{"inserted_rows": 0}` returned; existing holdings deleted
- `deleteEtf` on a UUID that no longer exists → backend returns 404 → `{ error: 'ETF not found' }` shown in UI
- `EtfRegistryTable` with a large ETF list → all filtering is client-side; no additional fetch calls triggered

---

### Open Questions / Risks

- [ ] **JSONB distribution map UX**: Raw JSON textarea is the MVP approach — functional but brittle for non-technical users. A future follow-up can replace it with a dynamic key-value row builder. **Target:** post-#41 polish
- [ ] **Edit mode JSONB round-trip**: `JSON.stringify` of a `Record<string, number>` that arrived from the backend must produce valid input for the textarea. Verify that `JSON.parse(JSON.stringify(etf.geographical_distribution))` round-trips without loss. **Target:** before merging #41
- [ ] **Lighthouse on `/tabularium/portfolio`**: Add `http://localhost:3000/tabularium/portfolio` to the URL list in `.lighthouserc.js` and verify performance score ≥ 0.9 before the PR is merged. The `EtfRegistryTable` `'use client'` bundle must not introduce heavy third-party imports. **Target:** before merging #41
- [ ] **`PriceUpdateButton` inline vs. modal UX**: An inline toggle form inside a table row may overflow narrow columns. Confirm whether an inline row expansion or a small modal is preferred before implementation. **Target:** before implementation begins
