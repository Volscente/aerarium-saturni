# #27: Transaction Input Flyout

**GitHub Issue:** [#27 — Transaction Input Flyout](https://github.com/Volscente/aerarium-saturni/issues/27)
**GitHub Milestone:** [6-tabularium-transaction-ledger](https://github.com/Volscente/aerarium-saturni/milestone/4)
**Notion page:** [6-Tabularium-Transaction-Ledger-Input-Engine](https://app.notion.com/p/6-Tabularium-Transaction-Ledger-Input-Engine-37a5cc6c0f0780a8a9d7cb0bd6ef5119)

---

## Technical Scope

**In scope:**

- `app/(tabularium)/tabularium/components/AddTransactionButton.tsx` — Create: `'use client'` component; owns `isDrawerOpen` boolean state; renders the `+ Add Transaction` trigger and `TransactionDrawer`
- `app/(tabularium)/tabularium/components/TransactionDrawer.tsx` — Create: fixed right-side slide-in panel (`fixed inset-y-0 right-0 z-50 w-96`) with Tailwind `translate-x-full` / `translate-x-0` transition and semi-transparent backdrop
- `app/(tabularium)/tabularium/components/TransactionForm.tsx` — Create: controlled `'use client'` form; field visibility driven by `transactionType` and `assetClass` state; Zod schema mirroring Pydantic `TransactionCreate` rules
- `app/(tabularium)/tabularium/actions.ts` — Create: `'use server'` `createTransaction` Server Action; Zod-parses payload, POSTs to `POST /transactions`, calls `revalidateTag('transactions')`, returns `{ success: true }` or `{ error: string }`
- `app/(tabularium)/tabularium/layout.tsx` — Modify: mount `AddTransactionButton` between `CustomNavbar` and `<main>`
- `backend/src/backend/models.py` — Amend (TASK-1): `quantity` nullable; add `ratio String(10)` nullable column
- `backend/src/backend/schemas/transactions.py` — Amend (TASK-1): `quantity` optional with cross-field validator; `ratio` optional with cross-field validator requiring it for Split; same changes in `TransactionResponse`

**Out of scope:**

- Sub-navigation component (`TabulaariumSubNav`) — TASK-4
- Ledger page (`transactions/page.tsx`) — TASK-2 (delivered; no changes needed)
- Authentication or multi-user access control
- Bulk or CSV transaction import

---

## Architecture

```txt
app/(tabularium)/tabularium/layout.tsx
  ├── CustomNavbar
  ├── AddTransactionButton  ('use client')         ← always mounted; visible on all sub-routes
  │     isDrawerOpen: boolean
  │     setIsDrawerOpen: Dispatch<SetStateAction<boolean>>
  │           │  onClick → setIsDrawerOpen(true)
  │           │
  │           ▼
  │     TransactionDrawer  (fixed inset-y-0 right-0 z-50)
  │       translate-x-full ──► translate-x-0 (when isOpen)
  │       backdrop overlay (fixed inset-0 bg-black/40 z-40)
  │             │
  │             ▼
  │       TransactionForm  ('use client')
  │         transactionType: 'buy'|'sell'|'dividend'|'split'
  │         assetClass:      'stock'|'bond'|'etf'
  │         → field visibility matrix applied
  │         → Zod schema validated on submit
  │                   │
  │                   ▼  onSubmit(validatedPayload)
  │          actions.ts: createTransaction(payload)    ← Server Action
  │            1. Zod.safeParse(payload)
  │            2. fetch(`${BACKEND_URL}/transactions`, { method: 'POST', body: ... })
  │            3. revalidateTag('transactions')
  │            4. return { success: true } | { error: string }
  │                   │
  │                   ▼  { success: true }
  │         onSuccess() → setIsDrawerOpen(false)       ← client closes drawer
  │
  └── <main>{children}</main>
  └── CustomFooter
```

### Why `AddTransactionButton` lives in the layout

Placing the button and drawer in `layout.tsx` means it is always mounted regardless of which Tabularium sub-route is active. No React Context or global store is needed — the layout level is the correct ownership boundary for UI that spans multiple pages.

### Why Server Actions instead of client-side fetch

The backend README explicitly states that no client-side API calls should be made for sensitive financial data. Server Actions execute on the server, keep `BACKEND_URL` out of the browser, and allow `revalidateTag` to invalidate the Next.js cache for the ledger in the same server-side round-trip — no separate client-side state update is needed after submission.

---

## Tech Stack

New packages introduced:

| Package | Version | Justification |
|---------|---------|---------------|
| `zod` | `>=3.23` | Client-side Zod schema mirrors Pydantic `TransactionCreate` validation (ISIN format, required-per-type fields) to provide immediate feedback before the server round-trip; also used in `actions.ts` for server-side re-validation |

---

## Implementation Details

### Modules / Files

| File | Action | Description |
|------|--------|-------------|
| `backend/src/backend/models.py` | Amend | `quantity` → `Mapped[Decimal \| None]`; add `ratio: Mapped[str \| None] = mapped_column(String(10))` |
| `backend/src/backend/schemas/transactions.py` | Amend | `quantity` optional with cross-field validator; add `ratio: str \| None = None` with cross-field validator; update `TransactionResponse` to match |
| `app/(tabularium)/tabularium/components/AddTransactionButton.tsx` | Create | `'use client'`; owns `isDrawerOpen` state; renders `+ Add Transaction` button (Lucide `Plus`) and `TransactionDrawer` |
| `app/(tabularium)/tabularium/components/TransactionDrawer.tsx` | Create | `'use client'`; fixed right-side panel; Tailwind translate transition; backdrop overlay; contains `TransactionForm` |
| `app/(tabularium)/tabularium/components/TransactionForm.tsx` | Create | `'use client'`; controlled form; field visibility matrix; `TransactionFormSchema` Zod schema; calls `createTransaction` on submit |
| `app/(tabularium)/tabularium/actions.ts` | Create | `'use server'`; `createTransaction` Server Action; Zod parse → `POST /transactions` → `revalidateTag('transactions')` |
| `app/(tabularium)/tabularium/layout.tsx` | Modify | Add `<AddTransactionButton />` between `<CustomNavbar />` and `<main>` |

---

### Key Functions

```tsx
// app/(tabularium)/tabularium/components/AddTransactionButton.tsx
'use client'

export function AddTransactionButton(): JSX.Element
/**
 * Trigger button that controls the transaction input drawer.
 *
 * Manages `isDrawerOpen` boolean state locally. Renders a `+ Add Transaction`
 * button (Lucide `Plus` icon, roman-* Tailwind tokens) and a `TransactionDrawer`
 * that receives `isOpen` and `onClose` props. Mounted directly in the Tabularium
 * layout so it remains visible across all sub-routes without prop-drilling.
 *
 * Returns:
 *   JSX containing the trigger button and `TransactionDrawer`, always mounted.
 */
```

```tsx
// app/(tabularium)/tabularium/components/TransactionDrawer.tsx
'use client'

interface TransactionDrawerProps {
  isOpen: boolean     // Controls translate-x-0 vs translate-x-full
  onClose: () => void // Called by the X button, backdrop click, or successful submit
}

export function TransactionDrawer({ isOpen, onClose }: TransactionDrawerProps): JSX.Element
/**
 * Right-side slide-in panel housing `TransactionForm`.
 *
 * Uses `transition-transform duration-300` with `translate-x-0` when open and
 * `translate-x-full` when closed. Fixed positioning (`fixed inset-y-0 right-0
 * z-50 w-96`) keeps it above page content on all sub-routes. A semi-transparent
 * backdrop (`fixed inset-0 bg-black/40 z-40`) is rendered when `isOpen` is true;
 * clicking it calls `onClose`. Passes `onSuccess={onClose}` to `TransactionForm`.
 *
 * Args:
 *   isOpen: Whether the drawer is in the visible (translate-x-0) position.
 *   onClose: Callback to close the drawer.
 *
 * Returns:
 *   JSX containing the drawer panel and conditional backdrop overlay.
 */
```

```tsx
// app/(tabularium)/tabularium/components/TransactionForm.tsx
'use client'

interface TransactionFormProps {
  onSuccess: () => void // Called after createTransaction returns { success: true }
}

export function TransactionForm({ onSuccess }: TransactionFormProps): JSX.Element
/**
 * Dynamic transaction entry form with context-sensitive field visibility.
 *
 * Maintains controlled state for `transactionType` and `assetClass`. Renders
 * fields per the visibility matrix below. On submit, validates against
 * `TransactionFormSchema` (Zod) and calls `createTransaction`; on success
 * calls `onSuccess()` to close the drawer. Inline error messages are rendered
 * below each field using Zod's `error.format()` output.
 *
 * Field visibility matrix:
 *   All types:  owner, broker_platform, transaction_type, asset_class, ticker?, isin?, transaction_date (always shown)
 *   Buy / Sell: quantity, price, currency, fees (required)
 *   Dividend:   currency, price (label: "Amount per share") (required); quantity? (optional)
 *   Split:      ratio (label: "Ratio e.g. 4:1") (required); price omitted, fees omitted, quantity omitted
 *
 * Args:
 *   onSuccess: Callback invoked when the Server Action returns `{ success: true }`.
 *
 * Returns:
 *   JSX containing the form with dynamic field set and inline validation errors.
 */
```

```ts
// app/(tabularium)/tabularium/actions.ts
'use server'

import { revalidateTag } from 'next/cache'
import { TransactionFormSchema, type TransactionFormValues } from './components/TransactionForm'

export async function createTransaction(
  payload: TransactionFormValues
): Promise<{ success: true } | { error: string }>
/**
 * Server Action: validate, persist, and invalidate the transaction cache.
 *
 * Parses `payload` with `TransactionFormSchema` (Zod). On parse success, POSTs
 * to `${process.env.BACKEND_URL}/transactions`. On HTTP 201, calls
 * `revalidateTag('transactions')` to invalidate the ledger cache and returns
 * `{ success: true }`. On Zod parse failure or non-201 HTTP response, returns
 * `{ error: string }` without throwing — callers receive a structured error
 * they can render inline.
 *
 * Args:
 *   payload: Raw form values from `TransactionForm`; validated client-side
 *            first, then re-validated here before the backend round-trip.
 *
 * Returns:
 *   `{ success: true }` on HTTP 201 from the backend, or `{ error: string }`
 *   on Zod parse failure or any non-201 response.
 */
```

```python
# backend/src/backend/schemas/transactions.py  (amendments to TASK-1 deliverable)

class TransactionCreate(BaseModel):
    ...
    quantity: Decimal | None = Field(default=None, gt=0)   # nullable; required for buy/sell/split via validator
    ratio: str | None = None                                # required for split via validator

    @model_validator(mode="after")
    def validate_type_specific_fields(self) -> "TransactionCreate":
        """Enforce cross-field rules: quantity required for buy/sell/split; ratio required for split."""
        if self.transaction_type in ("buy", "sell", "split") and self.quantity is None:
            raise ValueError("quantity is required for buy, sell, and split transactions")
        if self.transaction_type == "split" and self.ratio is None:
            raise ValueError("ratio is required for split transactions")
        return self
```

---

### Data Models / Schemas

```ts
// app/(tabularium)/tabularium/components/TransactionForm.tsx
import { z } from 'zod'

const ISIN_REGEX = /^[A-Z0-9]{12}$/

export const TransactionFormSchema = z.object({
  owner:            z.string().min(1, 'Owner is required'),
  broker_platform:  z.enum(['ibkr', 'n26']),
  transaction_type: z.enum(['buy', 'sell', 'dividend', 'split']),
  asset_class:      z.enum(['stock', 'bond', 'etf']),
  ticker: z.string().max(20).optional().or(z.literal('')),
  isin: z
    .string()
    .regex(ISIN_REGEX, 'ISIN must be 12 alphanumeric characters')
    .optional()
    .or(z.literal('')),
  quantity: z.coerce.number().positive('Quantity must be positive').optional(),
  price:    z.coerce.number().positive('Price must be positive').optional().nullable(),
  currency: z.string().length(3, 'Currency must be a 3-character ISO 4217 code').optional(),
  fees:     z.coerce.number().min(0).default(0),
  ratio:    z.string().regex(/^\d+:\d+$/, 'Ratio must be in N:M format (e.g. 4:1)').optional(),
  transaction_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
})

export type TransactionFormValues = z.infer<typeof TransactionFormSchema>
```

The Zod schema intentionally mirrors `TransactionCreate` in `src/backend/schemas/transactions.py`:

- `isin` validated as 12 alphanumeric characters (same as Pydantic `field_validator`)
- `quantity` and `price` use `z.coerce.number()` to accept `<input type="number">` string output
- `fees` defaults to `0` (same as Pydantic default)
- `ticker` and `isin` accept the empty string `''` — the Server Action converts `''` to `undefined` before POSTing
- `quantity` is optional at the schema level; the form enforces it as required for Buy/Sell via required field rendering (Split omits the field entirely; Dividend renders it as optional)
- `ratio` is optional at the schema level; the form enforces it as required for Split via required field rendering

---

### Testing Strategy

**Unit tests** (in-browser, manual):

- Open the drawer from `/tabularium`, `/tabularium/transactions`, and `/tabularium/portfolio` — confirm `AddTransactionButton` is visible on all three.
- Select transaction type "Buy" → confirm Quantity, Price, Currency, Fees fields appear. Switch to "Split" → confirm Price and Fees fields disappear.
- Submit with ISIN `US037833100` (11 chars) → confirm Zod inline error appears without sending a request to the backend.
- Submit with ISIN `US0378331005` (12 chars, valid) → confirm the form submits successfully.
- Click the backdrop overlay → confirm the drawer closes without submitting.

**Integration test** (manual):

1. Navigate to `/tabularium/portfolio`.
2. Click `+ Add Transaction`, fill in a valid Buy transaction (owner, broker, asset class, quantity, price, currency, transaction date).
3. Submit — confirm the drawer closes immediately.
4. Navigate to `/tabularium/transactions` — the new row must appear at the top of the ledger without a browser refresh.

**Edge cases:**

- Both `ticker` and `isin` left blank → accepted; no validation error (both nullable in the backend schema)
- `fees` field left blank → defaults to `0`; backend receives `fees: 0`
- Dividend type, `price` field used as "Amount per share" → submitted as `price`; backend stores it in the nullable `price` column
- Backend returns non-201 → `createTransaction` returns `{ error }` → form displays the error inline; drawer stays open

---

### Decisions Taken (formerly Open Questions)

- [x] **`quantity` nullable for Dividend:** `quantity` is made nullable in the ORM (`Mapped[Decimal | None]`) and in `TransactionCreate` (`quantity: Decimal | None = Field(default=None, gt=0)`). A Pydantic `model_validator` enforces that `quantity` is provided when `transaction_type` is `buy`, `sell`, or `split`. The form shows `quantity` as required for Buy/Sell, optional for Dividend, and hidden for Split. Drop and recreate the local `transactions` table after the model change (no production data exists; `create_all()` handles the new schema on next backend start).
- [x] **`ratio` column added:** A nullable `String(10)` column `ratio` is added to the ORM and both Pydantic models. A `model_validator` enforces it is provided when `transaction_type == 'split'`. The form renders a text input labelled "Ratio (e.g. 4:1)" exclusively for Split; the Zod regex is `/^\d+:\d+$/`. Same drop-and-recreate applies for the local DB.
- [x] **`revalidateTag` alignment — no action needed:** Both sides already agree. `transactions/page.tsx` caches with `{ next: { tags: ['transactions'] } }` and `actions.ts` calls `revalidateTag('transactions')`. The strings match; verify at code review as a routine sanity check only.
