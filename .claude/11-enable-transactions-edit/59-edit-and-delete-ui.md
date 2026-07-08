# #59: Frontend: Edit and Delete UI

**GitHub Issue:** [#59 — Frontend: Edit and Delete UI](https://github.com/Volscente/aerarium-saturni/issues/59)
**GitHub Milestone:** [11-enable-transactions-edit](https://github.com/Volscente/aerarium-saturni/milestone/9)
**Notion page:** [11 — Enable Transactions Edit](https://app.notion.com/p/11-Enable-Transactions-Edit-3955cc6c0f078031af62fa21395aecae)

---

## Technical Scope

**In scope:**

- `frontend/app/(tabularium)/tabularium/components/TransactionTable.tsx` — Create: new `'use client'` component; receives `transactions: TransactionResponse[]`; owns `editingTransaction` state; renders the 11-column table with Edit/Delete buttons; embeds the drawer in edit mode
- `frontend/app/(tabularium)/tabularium/components/TransactionDrawer.tsx` — Modify: add optional `transaction?: TransactionResponse` prop; toggle title between "Add Transaction" / "Edit Transaction"; pass prop to `TransactionForm`
- `frontend/app/(tabularium)/tabularium/components/TransactionForm.tsx` — Modify: add optional `transaction?: TransactionResponse` prop; pre-populate `formState` from prop; call `updateTransaction` instead of `createTransaction` when prop is present
- `frontend/app/(tabularium)/tabularium/actions.ts` — Modify: add `updateTransaction` and `deleteTransaction` Server Actions; both call `revalidateTag('transactions')` and `revalidateTag('portfolio-overview')`
- `frontend/app/(tabularium)/tabularium/transactions/page.tsx` — Modify: remove inline table JSX; pass fetched rows to `<TransactionTable>`
- `frontend/app/(tabularium)/tabularium/transaction-schema.ts` — Modify: export `TransactionResponse` interface (moved from `page.tsx`) so it can be shared across `page.tsx`, `TransactionTable`, `TransactionDrawer`, and `TransactionForm`

**Out of scope:**

- `transaction-schema.ts` (Zod schema and `TransactionFormValues` type) — unchanged; no new validation contract
- `AddTransactionButton.tsx` — unchanged; continues to open the drawer in create mode with no `transaction` prop
- Backend endpoints (`PUT /transactions/{id}`, `DELETE /transactions/{id}`) — delivered in TASK-1 / issue #58
- Bulk edit or delete
- Undo / restore deleted transactions

---

## Architecture

```txt
TransactionsPage (Server Component, page.tsx)
  │  fetch GET /transactions  { next: { tags: ['transactions'] } }
  │  → TransactionResponse[]
  │
  ▼
<TransactionTable transactions={rows} />   ── 'use client' boundary
  │  state: editingTransaction: TransactionResponse | null
  │
  ├── <table>  (11 existing columns + 2 action columns)
  │     └── per row:
  │           ├── EditButton   → setEditingTransaction(tx)
  │           └── DeleteButton → window.confirm → deleteTransaction(tx.id)
  │                                 │
  │                                 ▼
  │                           DELETE /transactions/{id}
  │                           revalidateTag('transactions')
  │                           revalidateTag('portfolio-overview')
  │
  └── <TransactionDrawer
          isOpen={editingTransaction !== null}
          onClose={() => setEditingTransaction(null)}
          transaction={editingTransaction} />
            │
            └── <TransactionForm
                    onSuccess={onClose}
                    transaction={editingTransaction} />
                      │  edit mode: formState initialised from transaction prop
                      │  on submit → updateTransaction(id, formData)
                      │               │
                      │               ▼
                      │         PUT /transactions/{id}
                      │         revalidateTag('transactions')
                      │         revalidateTag('portfolio-overview')
                      │
AddTransactionButton (Tabularium layout, unchanged)
  └── <TransactionDrawer isOpen={...} onClose={...} />
        (no transaction prop → create mode, unchanged behaviour)
```

### Why TransactionTable embeds its own drawer instance

`AddTransactionButton` in the layout owns the create-mode drawer. Adding edit-mode drawer state to the layout would require lifting `editingTransaction` state up through the layout into `page.tsx`, breaking the Server Component boundary. Instead, `TransactionTable` owns its own `TransactionDrawer` instance for edit mode. Two drawer instances are mounted simultaneously but only one is ever open (the layout's create drawer or the table's edit drawer), so there is no visual conflict.

---

## Tech Stack

No new packages required.

---

## Implementation Details

### Modules / Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `frontend/app/(tabularium)/tabularium/transaction-schema.ts` | Modify | Export `TransactionResponse` interface (moved from `page.tsx`) |
| `frontend/app/(tabularium)/tabularium/transactions/page.tsx` | Modify | Remove inline table; render `<TransactionTable transactions={data} />` |
| `frontend/app/(tabularium)/tabularium/components/TransactionTable.tsx` | Create | `'use client'` component; edit/delete state; per-row action buttons |
| `frontend/app/(tabularium)/tabularium/components/TransactionDrawer.tsx` | Modify | Add `transaction?: TransactionResponse` prop; toggle title |
| `frontend/app/(tabularium)/tabularium/components/TransactionForm.tsx` | Modify | Add `transaction?: TransactionResponse` prop; edit-mode form state and submit |
| `frontend/app/(tabularium)/tabularium/actions.ts` | Modify | Add `updateTransaction` and `deleteTransaction` Server Actions |

---

### Key Functions

```typescript
// frontend/app/(tabularium)/tabularium/actions.ts

export async function updateTransaction(
  id: number,
  payload: TransactionFormValues
): Promise<{ success: true } | { error: string }>
/**
 * Re-validates payload with TransactionFormSchema, calls PUT /transactions/{id},
 * and invalidates both cache tags on success.
 *
 * Args:
 *   id: Primary key of the transaction to update.
 *   payload: Full form values from TransactionForm (all fields, not just changed ones).
 *
 * Returns:
 *   { success: true } on HTTP 200 from the backend.
 *   { error: string } on Zod parse failure or any non-200 response.
 */
```

```typescript
// frontend/app/(tabularium)/tabularium/actions.ts

export async function deleteTransaction(
  id: number
): Promise<{ success: true } | { error: string }>
/**
 * Calls DELETE /transactions/{id} and invalidates both cache tags on success.
 *
 * Args:
 *   id: Primary key of the transaction to delete.
 *
 * Returns:
 *   { success: true } on HTTP 204 from the backend.
 *   { error: string } on any non-204 response or network error.
 */
```

```typescript
// frontend/app/(tabularium)/tabularium/components/TransactionTable.tsx

export function TransactionTable({
  transactions,
}: {
  transactions: TransactionResponse[]
}): JSX.Element
/**
 * Client component rendering the 11-column transaction table with per-row
 * Edit and Delete action buttons.
 *
 * State:
 *   editingTransaction: TransactionResponse | null — non-null when the edit
 *     drawer is open; set by the Edit button, cleared by onClose.
 *
 * Delete flow: window.confirm → deleteTransaction(tx.id) → clears state on success.
 * Edit flow: setEditingTransaction(tx) → TransactionDrawer opens in edit mode.
 */
```

---

### Data Models / Schemas

```typescript
// Moved from page.tsx to transaction-schema.ts and exported

export interface TransactionResponse {
  id: number
  owner: string
  broker_platform: 'ibkr' | 'n26'
  transaction_type: 'buy' | 'sell' | 'dividend' | 'split'
  asset_class: 'stock' | 'bond' | 'etf'
  ticker: string | null
  isin: string | null
  quantity: string | null
  price: string | null
  currency: string
  fees: string
  ratio: string | null
  transaction_date: string
  created_at: string
}
```

Note: `id` is typed as `number` (not `string` as in the current `page.tsx`) to match the backend `TransactionResponse` Pydantic model. `quantity`, `price`, and `ratio` are `string | null` (not `string`) to match the ORM model's nullable columns.

---

### Testing Strategy

**Server Action unit tests** (manual, no test file currently exists for frontend):

- `updateTransaction`: valid payload → verify `PUT /transactions/{id}` is called with correct body and both `revalidateTag` calls fire
- `updateTransaction`: Zod parse failure → returns `{ error: string }`, no fetch called
- `updateTransaction`: backend returns non-200 → returns `{ error: string }`
- `deleteTransaction`: backend returns 204 → returns `{ success: true }`, both `revalidateTag` calls fire
- `deleteTransaction`: backend returns non-204 → returns `{ error: string }`

**Integration test** (manual browser):

1. Navigate to `/tabularium/transactions`
2. Click Edit on a row — drawer opens pre-filled with that row's values
3. Modify a field (e.g. price) and submit — drawer closes, ledger row updates immediately
4. Click Delete on a row — confirm dialog appears; confirm — row disappears immediately
5. Navigate to `/tabularium/portfolio` — portfolio overview reflects the change without reload
6. Run `lhci autorun` and confirm score ≥ 90 on `/tabularium/transactions`

**Edge cases:**

- Edit drawer closes via backdrop click → `editingTransaction` reset to `null`, form state discarded
- Delete on a transaction already deleted by another session → `deleteTransaction` returns `{ error: 'Backend error 404: ...' }`; surface the error inline (same pattern as `serverError` state in `TransactionForm`)
- Form submitted in edit mode with a required field cleared → Zod `TransactionFormSchema` blocks submission client-side with inline field error

---

### Open Questions / Risks

- [ ] **`id` type mismatch:** `TransactionResponse` in `page.tsx` currently types `id` as `string`; the backend returns it as an integer. Confirm the actual JSON payload before wiring `updateTransaction(id)` calls. **Target:** implementation start
- [ ] **`revalidateTag('portfolio-overview')` omitted:** Both Server Actions must call both cache tags. Add a PR checklist item: confirm both tags appear in `updateTransaction` and `deleteTransaction` before merge. **Target:** code review
- [ ] **Lighthouse regression:** The new `TransactionTable` `'use client'` boundary increases the JS bundle on `/tabularium/transactions`. Run `lhci autorun` locally before opening the PR. **Target:** pre-merge
