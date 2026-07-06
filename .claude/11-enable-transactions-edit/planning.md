# Enable Transactions Edit — High-Level Planning

**Project:** Aerarium Saturni
**GitHub repo:** [Volscente/aerarium-saturni](https://github.com/Volscente/aerarium-saturni)
**GitHub Milestone:** [11-enable-transactions-edit](https://github.com/Volscente/aerarium-saturni/milestone/9)
**Notion page:** [11 — Enable Transactions Edit](https://app.notion.com/p/11-Enable-Transactions-Edit-3955cc6c0f078031af62fa21395aecae)
**Total estimated effort:** 1 FTE-day (1 FTE = 1 day)

---

## Overview

This initiative makes the Transaction Ledger at `/tabularium/transactions` fully editable. The backend gains `PUT /transactions/{id}` and `DELETE /transactions/{id}` FastAPI endpoints backed by a new `TransactionUpdate` Pydantic model. The frontend gains a `TransactionTable` client component that renders per-row Edit and Delete buttons, extends `TransactionDrawer` and `TransactionForm` to support an edit mode pre-populated from the selected row, and adds `updateTransaction` and `deleteTransaction` Server Actions that invalidate both the `transactions` and `portfolio-overview` cache tags on every mutation. No schema changes to the `transactions` table and no new dependencies are introduced.

### Dependency Order

```txt
TASK-1 ──► TASK-2
```

TASK-2 depends on the FastAPI endpoints being available; TASK-1 must land first.

---

## TASK-1 — Backend: Edit and Delete Endpoints

**GitHub Issue:** #{issue}
**Effort estimate:** 0.5 FTE-days

### Scope

Add a `TransactionUpdate` Pydantic model to `schemas/transactions.py` and two new route handlers (`PUT /transactions/{id}`, `DELETE /transactions/{id}`) to `routers/transactions.py`, each using `Depends(get_session)`. Cover all four code paths with unit tests.

### Goal

The FastAPI backend exposes a full CRUD interface for individual transactions, unblocking the frontend Server Actions that call the new endpoints.

### Deliverables

- `backend/src/backend/schemas/transactions.py` — new `TransactionUpdate` model; all fields optional with `None` defaults; no `model_validator` (validation is the caller's responsibility)
- `backend/src/backend/routers/transactions.py` — `PUT /transactions/{id}` handler (HTTP 200, `setattr` partial-update loop, 404 on unknown id) and `DELETE /transactions/{id}` handler (HTTP 204, 404 on unknown id)
- `backend/tests/routers/test_transactions.py` — 4 new unit tests: successful update, 404 update, successful delete, 404 delete

### Technical Overview

`TransactionUpdate` mirrors `EtfUpdate` in `schemas/etfs.py`: all fields typed `Optional[T] = None`. The `PUT` handler fetches the ORM row by primary key via `await session.get(Transaction, id)`; iterates over `update_data.model_dump(exclude_none=True)` applying `setattr`; commits and returns the refreshed `TransactionResponse`. The `DELETE` handler fetches the row, calls `await session.delete(row)`, commits, and returns `Response(status_code=204)`. Both handlers raise `HTTPException(status_code=404)` when the row is absent. Test fixtures follow the pattern in `conftest.py` (`mock_session_*` / `client_*`).

---

## TASK-2 — Frontend: Edit and Delete UI

**GitHub Issue:** #{issue}
**Effort estimate:** 0.5 FTE-days

### Scope

Introduce a `TransactionTable` client component that owns edit/delete state and renders per-row action buttons. Extend `TransactionDrawer` and `TransactionForm` with an optional `transaction` prop for edit mode. Add `updateTransaction` and `deleteTransaction` Server Actions to `actions.ts`.

### Goal

Users can edit or delete any transaction row from the ledger; changes are reflected immediately on both the Transaction Ledger and the Portfolio Overview without a manual page reload.

### Deliverables

- `frontend/app/(tabularium)/tabularium/components/TransactionTable.tsx` — new `'use client'` component; receives `transactions: TransactionResponse[]` as props; owns `editingTransaction: TransactionResponse | null` state; renders the 11-column table with Edit and Delete action buttons per row; calls `deleteTransaction` after `window.confirm`
- `frontend/app/(tabularium)/tabularium/components/TransactionDrawer.tsx` — adds optional `transaction?: TransactionResponse` prop; title toggles "Add Transaction" / "Edit Transaction"; passes `transaction` down to `TransactionForm`
- `frontend/app/(tabularium)/tabularium/components/TransactionForm.tsx` — adds optional `transaction?: TransactionResponse` prop; pre-populates `formState` from prop when present; calls `updateTransaction(transaction.id, formData)` in edit mode instead of `createTransaction`
- `frontend/app/(tabularium)/tabularium/actions.ts` — `updateTransaction(id: number, data: TransactionFormValues)`: Zod re-validation → `PUT /transactions/{id}` → `revalidateTag('transactions')` + `revalidateTag('portfolio-overview')`; `deleteTransaction(id: number)`: `DELETE /transactions/{id}` → `revalidateTag('transactions')` + `revalidateTag('portfolio-overview')`; both return `{ success: true } | { error: string }`
- `frontend/app/(tabularium)/tabularium/transactions/page.tsx` — refactored to pass fetched rows to `<TransactionTable>` instead of rendering the table inline; remains a Server Component

### Technical Overview

`page.tsx` keeps the `GET /transactions` fetch with `{ next: { tags: ['transactions'] } }` and renders `<TransactionTable transactions={data} />`. `TransactionTable` is the only `'use client'` boundary; the page shell and data fetch stay server-rendered, preserving the Lighthouse ≥ 90 constraint. The `AddTransactionButton` in the Tabularium layout continues to open `TransactionDrawer` in create mode (no `transaction` prop); `TransactionTable` opens it in edit mode by passing `editingTransaction` as the `transaction` prop. `TransactionForm` detects edit mode by checking `props.transaction !== undefined` and branches `formState` initialisation accordingly. `transaction-schema.ts` is unchanged — `TransactionFormSchema` is the single validation contract for both paths.

---

## GitHub Issues

### Milestone 1 — Backend: Edit and Delete Endpoints

**Tasks:** TASK-1
**Effort:** 0.5 FTE-days

#### Scope

Extend the FastAPI transactions service with the `TransactionUpdate` Pydantic schema and the `PUT /transactions/{id}` and `DELETE /transactions/{id}` route handlers, including unit tests for all success and 404 paths.

#### Goal

The backend exposes a complete CRUD interface for transactions, enabling the frontend to call edit and delete operations via Server Actions.

#### Deliverables

- `TransactionUpdate` Pydantic model in `backend/src/backend/schemas/transactions.py`
- `PUT /transactions/{id}` route handler (HTTP 200) in `backend/src/backend/routers/transactions.py`
- `DELETE /transactions/{id}` route handler (HTTP 204) in `backend/src/backend/routers/transactions.py`
- 4 unit tests in `backend/tests/routers/test_transactions.py`

---

### Milestone 2 — Frontend: Edit and Delete UI

**Tasks:** TASK-2
**Effort:** 0.5 FTE-days

#### Scope

Introduce the `TransactionTable` client component, extend `TransactionDrawer` and `TransactionForm` with edit-mode support, and add `updateTransaction` and `deleteTransaction` Server Actions that invalidate both cache tags on every mutation.

#### Goal

Users can edit and delete any transaction row from the ledger; the Transaction Ledger and Portfolio Overview both refresh immediately after each mutation, with mandatory field validation enforced on edit.

#### Deliverables

- `TransactionTable` client component in `frontend/app/(tabularium)/tabularium/components/TransactionTable.tsx`
- Edit-mode extension to `frontend/app/(tabularium)/tabularium/components/TransactionDrawer.tsx`
- Edit-mode extension to `frontend/app/(tabularium)/tabularium/components/TransactionForm.tsx`
- `updateTransaction` and `deleteTransaction` Server Actions in `frontend/app/(tabularium)/tabularium/actions.ts`
- Refactored `frontend/app/(tabularium)/tabularium/transactions/page.tsx`
