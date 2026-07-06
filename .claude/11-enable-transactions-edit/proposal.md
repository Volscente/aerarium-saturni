---
title: "Enable Transactions Edit"
project: "Aerarium Saturni"
author: "Simone Porreca"
deadline: "2026-07-08"
notion-page: "https://app.notion.com/p/11-Enable-Transactions-Edit-3955cc6c0f078031af62fa21395aecae"
github-repo: "https://github.com/Volscente/aerarium-saturni"
milestone: [11-enable-transactions-edit](https://github.com/Volscente/aerarium-saturni/milestone/9)
tech-stack:
  - "Next.js 15 (App Router, Server Components, Server Actions)"
  - "Tailwind CSS"
  - "Zod"
  - "Python / FastAPI"
  - "SQLAlchemy (async)"
  - "Pydantic v2"
  - "PostgreSQL"
scope-in:
  - "Edit transaction: user can update any field of an existing transaction via the drawer/form flow"
  - "Delete transaction: user can remove a transaction row permanently"
  - "Mandatory field validation: form prevents submission with blank required fields on edit"
  - "Cache revalidation: transaction ledger and portfolio overview refresh immediately after edit or delete"
scope-out:
  - "Bulk edit/delete: not stated in initiative scope"
  - "Transaction audit log / history: future initiative"
  - "Undo / restore deleted transactions: future initiative"
  - "CSV bulk import: already excluded from backend scope"
milestones:
  - "Backend: PUT /transactions/{id} and DELETE /transactions/{id} endpoints"
  - "Frontend: Edit and Delete buttons on transaction table rows with drawer pre-population"
context-paths:
  - "frontend/README.md"
  - "backend/README.md"
---

## Problem

The Transaction Ledger at `/tabularium/transactions` is currently append-only. Once a transaction is recorded there is no way to correct a field value (wrong price, wrong quantity, wrong ticker) or remove an erroneous entry. This means any data entry mistake persists permanently, silently corrupting the portfolio overview derived from the same records.

## Approach direction

Reuse the existing `TransactionDrawer` / `TransactionForm` infrastructure in an edit mode (pre-populated with the selected row's data), mirroring the pattern already established for ETFs in `EtfRegistryTable` and `EtfForm`. Each row in the transaction table gains an Edit button (opens the drawer pre-filled) and a Delete button (calls a Server Action after confirmation). Two new FastAPI endpoints (`PUT /transactions/{id}`, `DELETE /transactions/{id}`) back the new Server Actions.

## Success criteria

- User can click Edit on any transaction row, modify any field, and see the ledger update immediately.
- User can click Delete on any transaction row and have it removed permanently after confirmation.
- Mandatory fields remain enforced during edit — the form cannot be submitted with blank required fields.
- The portfolio overview reflects edits and deletes without a manual page refresh.

## Constraints

- Any Server Action that writes or deletes transaction data must call both `revalidateTag('transactions')` and `revalidateTag('portfolio-overview')`.
- `TransactionFormSchema` (Zod) must remain the single validation contract for both create and edit paths.
- New FastAPI endpoints must use `Depends(get_session)` for dependency injection and `psycopg[binary]` as the database driver.
- Lighthouse performance score must remain ≥ 90 on `/tabularium/transactions` after changes.

## Desired tech

No new technologies are introduced. The initiative intentionally reuses the existing stack to keep scope minimal.

## Integration context

The solution extends two existing layers: `actions.ts` gains `updateTransaction` and `deleteTransaction` Server Actions; `routers/transactions.py` gains `PUT /transactions/{id}` and `DELETE /transactions/{id}` handlers. On the frontend, the transactions table gains row-level action buttons and the `TransactionDrawer` / `TransactionForm` components are extended to support an edit mode, following the same create/edit duality already present in `EtfDrawer` and `EtfForm`.

## Known risks / concerns

- The transactions table is currently a pure Server Component; adding per-row Edit/Delete buttons requires introducing a `'use client'` boundary, which must be scoped carefully to avoid re-rendering the full table on every interaction.
- `revalidateTag('portfolio-overview')` must be included in both `updateTransaction` and `deleteTransaction` — omitting it would leave the portfolio overview stale after a transaction change, since its metrics derive from the same records.
- The `transactions` table has no Alembic migration baseline yet; if the edit initiative requires any schema change it must coordinate with the deferred baseline migration work.
