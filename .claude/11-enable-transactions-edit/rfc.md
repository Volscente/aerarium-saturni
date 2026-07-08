# [RFC] Enable Transactions Edit — Aerarium Saturni

| Author          | Simone Porreca                                                                                                        |
| :-------------- | :-------------------------------------------------------------------------------------------------------------------- |
| **Project**     | Aerarium Saturni                                                                                                      |
| **RFC status**  | Draft                                                                                                                 |
| **Review deadline** | 2026-07-08                                                                                                        |
| **Notion page** | [11 — Enable Transactions Edit](https://app.notion.com/p/11-Enable-Transactions-Edit-3955cc6c0f078031af62fa21395aecae) |
| **GitHub repo** | [Volscente/aerarium-saturni](https://github.com/Volscente/aerarium-saturni)                                          |
| **Milestone**   | [11-enable-transactions-edit](https://github.com/Volscente/aerarium-saturni/milestone/9)                             |

### Timeline

| Date       | Status | Note  |
| :--------- | :----- | :---- |
| 2026-07-06 | Draft  |       |

### Table of contents

[Motivation](#motivation)

[Objectives](#objectives)

[Scope](#scope)

[Enable Transactions Edit](#enable-transactions-edit)

[Tech Stack](#tech-stack)

[Effort Estimations](#effort-estimations)

[FAQs](#faqs)

[Risks & Open Questions](#risks--open-questions)

[References](#references)

---

## Motivation {#motivation}

The Transaction Ledger at `/tabularium/transactions` is currently append-only. Once a transaction is recorded there is no way to correct a field value (wrong price, wrong quantity, wrong ticker) or remove an erroneous entry. This means any data entry mistake persists permanently, silently corrupting the portfolio overview derived from the same records. For full context, see the [Notion initiative page](https://app.notion.com/p/11-Enable-Transactions-Edit-3955cc6c0f078031af62fa21395aecae).

## Objectives {#objectives}

- **Enable transaction editing**: Any transaction row can be opened in the existing `TransactionDrawer`, all fields modified, and saved — the ledger refreshes immediately without a manual page reload.
- **Enable transaction deletion**: Any transaction row can be permanently removed via a per-row Delete button with a confirmation step — the row disappears from the ledger immediately.
- **Preserve validation parity**: `TransactionFormSchema` remains the single Zod contract for both create and edit paths; mandatory fields are enforced equally on both operations.
- **Maintain cache consistency**: Both `updateTransaction` and `deleteTransaction` Server Actions call `revalidateTag('transactions')` and `revalidateTag('portfolio-overview')`, keeping the ledger and portfolio overview in sync after every mutation.
- **Preserve Lighthouse score**: The `'use client'` boundary introduced for row-level interactivity is scoped to the table component only, keeping the page shell and data fetch server-rendered and the performance score ≥ 90.

## Scope {#scope}

**In-Scope:**

- Edit transaction: user can update any field of an existing transaction via the drawer/form flow
- Delete transaction: user can remove a transaction row permanently
- Mandatory field validation: form prevents submission with blank required fields on edit
- Cache revalidation: transaction ledger and portfolio overview refresh immediately after edit or delete

**Out-of-Scope:**

- **Bulk edit/delete**: not stated in initiative scope
- **Transaction audit log / history**: future initiative
- **Undo / restore deleted transactions**: future initiative
- **CSV bulk import**: already excluded from backend scope

**Constraints:**

- Any Server Action that writes or deletes transaction data must call both `revalidateTag('transactions')` and `revalidateTag('portfolio-overview')`.
- `TransactionFormSchema` (Zod) must remain the single validation contract for both create and edit paths.
- New FastAPI endpoints must use `Depends(get_session)` for dependency injection and `psycopg[binary]` as the database driver.
- Lighthouse performance score must remain ≥ 90 on `/tabularium/transactions` after changes.

---

# **Enable Transactions Edit** {#enable-transactions-edit}

## Approach Overview {#approach-overview}

The approach mirrors the edit/delete pattern already established for ETFs (`EtfRegistryTable` → `EtfDrawer` → `EtfForm` backed by `updateEtf`/`deleteEtf` Server Actions and `PUT /etfs/{id}` / `DELETE /etfs/{id}` FastAPI routes). This pattern is proven, consistent with the existing codebase, and requires no new abstractions.

On the backend, a `TransactionUpdate` Pydantic model (all fields optional, same validators as `TransactionCreate`) is introduced alongside `PUT /transactions/{id}` and `DELETE /transactions/{id}` route handlers in `routers/transactions.py`. On the frontend, the transactions page is split into a thin Server Component shell (data fetch, cache tag) and a new `TransactionTable` client component (state, edit/delete actions). `TransactionDrawer` and `TransactionForm` gain an optional `transaction` prop; when present, the form pre-populates and calls `updateTransaction` instead of `createTransaction`.

The proposal's stated direction is adopted in full. The ETF analogy is the right reference: it solves the same problem (read-only table → editable table) with the same stack and the same component hierarchy.

### Integration {#integration}

| Layer | What changes |
| :---- | :----------- |
| `backend/src/backend/schemas/transactions.py` | New `TransactionUpdate` Pydantic model (all fields optional) |
| `backend/src/backend/routers/transactions.py` | New `PUT /transactions/{id}` (HTTP 200) and `DELETE /transactions/{id}` (HTTP 204) handlers |
| `frontend/app/(tabularium)/tabularium/actions.ts` | New `updateTransaction` and `deleteTransaction` Server Actions; both call `revalidateTag('transactions')` and `revalidateTag('portfolio-overview')` |
| `frontend/app/(tabularium)/tabularium/transactions/page.tsx` | Remains a Server Component; passes fetched rows to the new `TransactionTable` client component |
| `frontend/app/(tabularium)/tabularium/components/TransactionTable.tsx` | New `'use client'` component; owns `editingTransaction` state and delete confirmation; renders rows with Edit/Delete buttons |
| `frontend/app/(tabularium)/tabularium/components/TransactionDrawer.tsx` | Accepts optional `transaction` prop; title toggles "Add Transaction" / "Edit Transaction" |
| `frontend/app/(tabularium)/tabularium/components/TransactionForm.tsx` | Detects edit mode (presence of initial `transaction` prop); pre-populates `formState`; calls `updateTransaction` on submit in edit mode |

`transaction-schema.ts` is **unchanged** — `TransactionFormSchema` and `TransactionFormValues` serve both paths without modification.

## M1 — Backend: Edit and Delete Endpoints {#m1-backend}

Two new route handlers are added to `routers/transactions.py`, both using `Depends(get_session)`:

- **`PUT /transactions/{id}`** — Accepts a `TransactionUpdate` body (all fields optional). Fetches the existing `Transaction` ORM row by primary key; raises HTTP 404 if absent. Applies only the non-`None` fields from the request via a `setattr` loop (same pattern as `PUT /etfs/{id}`). Commits the session and returns the updated `TransactionResponse` (HTTP 200).
- **`DELETE /transactions/{id}`** — Fetches the row by primary key; raises HTTP 404 if absent. Deletes the row and commits. Returns HTTP 204 with no body.

`TransactionUpdate` in `schemas/transactions.py` mirrors `TransactionCreate` but marks every field `Optional` with a `None` default. The `model_validator` from `TransactionCreate` is not reused — on partial update, the caller is responsible for sending a consistent payload; the validator would fire on incomplete partial bodies.

Unit tests cover: successful update returning the modified row, 404 on unknown id, successful delete returning 204, and 404 delete on unknown id.

## M2 — Frontend: Edit and Delete UI {#m2-frontend}

**`TransactionTable` client component**

A new `'use client'` component receives `transactions: TransactionResponse[]` as a prop from the Server Component page. It owns two pieces of state: `editingTransaction: TransactionResponse | null` (controls whether the drawer opens in edit mode) and no explicit delete state (delete uses `window.confirm` inline, matching the ETF pattern). It renders the same 11-column table currently in `page.tsx`, but with two additional action buttons per row: Edit (pencil icon, sets `editingTransaction`) and Delete (trash icon, calls `deleteTransaction` after `window.confirm`).

**`TransactionDrawer` edit mode**

An optional `transaction?: TransactionResponse` prop is added. When present, the drawer title reads "Edit Transaction" and passes the transaction down to `TransactionForm` as initial data. The `AddTransactionButton` in the layout continues to open the drawer in create mode (no `transaction` prop); the new `TransactionTable` opens it in edit mode.

**`TransactionForm` edit mode**

An optional `transaction?: TransactionResponse` prop is added. When present, `formState` is initialised from the transaction's existing values rather than blank defaults. On submit, the form calls `updateTransaction(transaction.id, formData)` instead of `createTransaction(formData)`. The `onSuccess()` callback is unchanged — it closes the drawer and the table revalidates from the server via the cache tag.

**Server Actions**

`updateTransaction(id: number, data: TransactionFormValues)` re-validates with Zod, calls `PUT /transactions/{id}`, and calls both `revalidateTag('transactions')` and `revalidateTag('portfolio-overview')`. Returns `{ success: true } | { error: string }`.

`deleteTransaction(id: number)` calls `DELETE /transactions/{id}`, and calls both `revalidateTag('transactions')` and `revalidateTag('portfolio-overview')`. Returns `{ success: true } | { error: string }`.

## Tech Stack {#tech-stack}

- **Next.js 15 (App Router, Server Components, Server Actions)**: The data-fetch + Server Action pattern is already established for the transactions flow (`createTransaction`, `revalidateTag`). Edit and delete follow the same model with no architectural change.
- **Tailwind CSS**: All existing Tabularium components use Tailwind utility classes. Action buttons on the new table rows use the same `roman-*` token set.
- **Zod**: `TransactionFormSchema` in `transaction-schema.ts` is the shared validation boundary used by both `TransactionForm` (client) and Server Actions (server). No new schema file is introduced.
- **Python / FastAPI**: The existing transactions router is extended with two new endpoints. FastAPI's `Depends(get_session)` and automatic 422 Pydantic validation are inherited by the new handlers.
- **SQLAlchemy (async)**: The `PUT /transactions/{id}` handler reuses the same `AsyncSession` pattern as the existing `GET` and `POST` handlers. The `setattr` partial-update idiom matches what `PUT /etfs/{id}` already does.
- **Pydantic v2**: `TransactionUpdate` (all-optional partial update model) follows the same structure as `EtfUpdate` in `schemas/etfs.py`.
- **PostgreSQL**: No schema changes. The `transactions` table is unmodified; only row-level `UPDATE` and `DELETE` statements are added.

## Effort Estimations {#effort-estimations}

Total estimated effort: **2 sessions**.

| Milestone | Description | Est. effort | GitHub Issue |
| :-------- | :---------- | :---------- | :----------- |
| M1 — Backend | `TransactionUpdate` schema; `PUT /transactions/{id}` and `DELETE /transactions/{id}` handlers; unit tests | 1 session | #{issue} |
| M2 — Frontend | `TransactionTable` client component; drawer/form edit mode; `updateTransaction` and `deleteTransaction` Server Actions | 1 session | #{issue} |

### Recommended Order

1. M1 — Backend (the FastAPI endpoints must exist before the frontend Server Actions can call them)
2. M2 — Frontend (depends on M1 endpoints being available at `http://localhost:8000`)

---

# **FAQs** {#faqs}

**Q: Why introduce a new `TransactionTable` client component instead of converting the existing `page.tsx` to `'use client'`?**

A: `page.tsx` is a Server Component that performs the data fetch with a Next.js cache tag (`{ next: { tags: ['transactions'] } }`). Converting it to a client component would remove the ability to use `revalidateTag`, which is the mechanism both Server Actions use to invalidate the cache after a mutation. Keeping the data fetch in a Server Component and delegating only the interactive row state to a client component is the same split used by `portfolio/page.tsx` → `PortfolioPageClient.tsx`.

**Q: Why use `PUT /transactions/{id}` with all-optional fields rather than a true `PATCH`?**

A: The ETF router uses the same convention (`PUT /etfs/{id}` with `EtfUpdate` — all fields optional). Staying consistent avoids introducing a second HTTP verb convention in the backend. The `setattr` partial-update loop handles the semantics correctly regardless of whether the caller sends one field or all of them.

**Q: Does the absence of a `model_validator` in `TransactionUpdate` risk storing an inconsistent row (e.g., a Sell with no quantity)?**

A: The `TransactionForm` in edit mode initialises from the full existing row and sends all fields on submit (not just the changed ones). The Zod `TransactionFormSchema` validates the complete payload client-side before the Server Action is called, and the Server Action re-validates with Zod before calling the backend. This two-layer validation means an inconsistent partial body never reaches `PUT /transactions/{id}` in normal operation.

**Q: Will adding Edit/Delete buttons affect the Lighthouse performance score?**

A: The `TransactionTable` client component receives pre-fetched data as props — no additional network request is added on page load. The extra JS for the client component is small (state + two event handlers). Lighthouse is configured to assert ≥ 90 on `/tabularium/transactions`; the CI gate will catch any regression introduced by the bundle size increase.

**Q: Terminology?**

A: 

- **Server Action** → Next.js 15 async function marked `'use server'`; runs on the server, callable from client components; used here for `createTransaction`, `updateTransaction`, `deleteTransaction`
- **`revalidateTag`** → Next.js cache invalidation API; instructs the data cache to discard entries tagged with the given string on the next request
- **`TransactionFormSchema`** → Zod schema in `transaction-schema.ts`; the single source of truth for transaction field constraints on both client and server

---

## Risks & Open Questions {#risks--open-questions}

| Risk / Question | Likelihood | Mitigation / Answer |
| :-------------- | :--------- | :------------------ |
| `'use client'` boundary scoped too broadly causes bundle bloat or unwanted re-renders on `/tabularium/transactions` | Low | Wrap only `TransactionTable`; keep `page.tsx` as a Server Component. Lighthouse CI gate catches any score regression. |
| `revalidateTag('portfolio-overview')` omitted from `updateTransaction` or `deleteTransaction`, leaving the portfolio overview stale | Medium | Treat both tags as a constraint (documented in proposal and constraints section). Add a code review checklist item: both Server Actions must call both tags. |
| `PUT /transactions/{id}` introduces a schema change (e.g., `updated_at` column) that conflicts with the deferred Alembic baseline for `transactions` | Low | No schema change is planned. If `updated_at` is desired, defer it to the Alembic baseline milestone; do not add it here. |
| Edit form sends a partial payload (only changed fields) rather than the full row, causing unintended `null` writes via the `setattr` loop | Low | `TransactionForm` in edit mode initialises all fields from the existing row and submits the complete set. Server Action re-validates with Zod before calling the backend. |

## References {#references}

- [Notion initiative page](https://app.notion.com/p/11-Enable-Transactions-Edit-3955cc6c0f078031af62fa21395aecae)
- [GitHub milestone 9](https://github.com/Volscente/aerarium-saturni/milestone/9)
