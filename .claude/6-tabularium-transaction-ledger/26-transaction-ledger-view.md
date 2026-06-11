# #26: Transaction Ledger View

**GitHub Issue:** [#26 — Transaction Ledger View](https://github.com/Volscente/aerarium-saturni/issues/26)
**GitHub Milestone:** [6-tabularium-transaction-ledger](https://github.com/Volscente/aerarium-saturni/milestone/4)
**Notion page:** [6-Tabularium-Transaction-Ledger-Input-Engine](https://app.notion.com/p/6-Tabularium-Transaction-Ledger-Input-Engine-37a5cc6c0f0780a8a9d7cb0bd6ef5119)

---

## Technical Scope

**In scope:**

- `app/(tabularium)/tabularium/transactions/page.tsx` — Convert the `return null` placeholder into a Next.js Server Component that calls `GET /transactions` and renders a full-width chronological ledger table
- TypeScript interface mirroring `TransactionResponse` for type-safe API consumption
- Empty-state UI (no transactions yet in the database)

**Out of scope:**

- Transaction creation form, drawer, or Server Action (TASK-3)
- Tabularium sub-navigation component (TASK-4)
- Client-side fetch, pagination, or sorting controls
- Lighthouse coverage for `/tabularium/transactions` (`.lighthouserc.js` currently audits `/`, `/tabularium`, `/codex/fundamentals` only — adding this route is a separate decision)

---

## Architecture

```txt
Browser → GET /tabularium/transactions
                      │
                      ▼
       TransactionsPage  (Next.js Server Component)
       app/(tabularium)/tabularium/transactions/page.tsx
                      │
                      │  fetch(`${BACKEND_URL}/transactions`,
                      │         { next: { tags: ['transactions'] } })
                      │
                      ▼
       FastAPI  GET /transactions  →  list[TransactionResponse]
                (ordered transaction_date DESC)
                      │
                      ▼
       <table> with 11 columns:
         Date · Owner · Broker Platform · Type · Asset Class ·
         Ticker · ISIN · Quantity · Price · Currency · Fees
                      │
                      ▼  (if list is empty)
       <empty-state> paragraph — "No transactions recorded yet."
```

### Why Server Component with cache tag

The page is a Server Component so financial data never reaches the browser as a fetch call. `{ next: { tags: ['transactions'] } }` enables `revalidateTag('transactions')` in the `createTransaction` Server Action (TASK-3) to invalidate only this route's cached data without touching other routes. This is the selective invalidation pattern specified in the planning doc; `revalidatePath` is intentionally not used here.

---

## Tech Stack

No new packages required.

---

## Implementation Details

### Modules / Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `app/(tabularium)/tabularium/transactions/page.tsx` | Modify | Server Component; fetches `GET /transactions` with cache tag; renders ledger table or empty state |
| `.env.local` | Create | Local dev env vars; git-ignored; sets `BACKEND_URL=http://localhost:8000` |
| `docker-compose.yml` | Modify | Add `BACKEND_URL=http://backend:8000` to the `frontend` service `environment` block |
| `.lighthouserc.js` | Modify | Add `/tabularium/transactions` to the URL list so CI gates performance from day one |

---

### Key Functions

```typescript
async function fetchTransactions(): Promise<TransactionResponse[]>
```

Calls `GET /transactions` from the FastAPI backend using `fetch`. Uses `{ next: { tags: ['transactions'] } }` for cache tagging so `revalidateTag('transactions')` (called from the TASK-3 Server Action) can selectively invalidate this data without a full route cache flush. Reads the backend URL from `process.env.BACKEND_URL`. Throws if `response.ok` is false.

```typescript
export default async function TransactionsPage(): Promise<JSX.Element>
```

Next.js Server Component. Awaits `fetchTransactions()`, then conditionally renders either an empty-state paragraph (when the list is empty) or a full-width `<table>` with 11 columns ordered newest-first. All data is fetched and rendered server-side; no `'use client'` directive, no `useState`, no client fetch.

---

### CLI Parameters

Not applicable — this is a Next.js Server Component, not a CLI module.

---

### Data Models / Schemas

```typescript
interface TransactionResponse {
  id: string                   // UUID string
  owner: string
  broker_platform: 'ibkr' | 'n26'
  transaction_type: 'buy' | 'sell' | 'dividend' | 'split'
  asset_class: 'stock' | 'bond' | 'etf'
  ticker: string | null
  isin: string | null
  quantity: string             // Decimal serialised as string by FastAPI
  price: string | null         // Decimal serialised as string; null for split transactions
  currency: string             // ISO 4217 (3 chars)
  fees: string                 // Decimal serialised as string
  transaction_date: string     // ISO 8601 date: "YYYY-MM-DD"
  created_at: string           // ISO 8601 datetime with timezone
}
```

FastAPI/Pydantic v2 serialises `Numeric`/`Decimal` columns to JSON strings. Display these as-is in the table; do not parse to `Number` (floating-point rounding would distort financial values).

---

### Testing Strategy

**Manual integration test:**

```bash
# 1. Start the full stack
just backend-dev          # FastAPI at http://localhost:8000
cd frontend && npm run dev  # Next.js at http://localhost:3000

# 2. POST a test transaction
curl -X POST http://localhost:8000/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "Simone",
    "broker_platform": "ibkr",
    "transaction_type": "buy",
    "asset_class": "stock",
    "ticker": "AAPL",
    "isin": "US0378331005",
    "quantity": "10.5000",
    "currency": "USD",
    "transaction_date": "2026-06-11"
  }'

# 3. Open http://localhost:3000/tabularium/transactions
# Expected: row appears in the table, all 11 columns populated correctly
```

**Edge cases:**

- No transactions in the database → page renders the empty-state message, not an error or blank screen
- `ticker` is `null` → cell renders `—` (em-dash), not the string `"null"`
- `isin` is `null` → cell renders `—`
- `price` is `null` (split transaction) → Price cell renders `—`
- `BACKEND_URL` env var not set → `fetchTransactions` throws; Next.js surfaces its error boundary

---

### Environment Variables

`BACKEND_URL` must be set before the frontend starts. It is a server-only variable (no `NEXT_PUBLIC_` prefix) — it is read exclusively inside Server Components and Server Actions and never reaches the browser.

| Environment | Value | Where set |
| --- | --- | --- |
| Local dev | `http://localhost:8000` | `.env.local` (git-ignored) |
| Docker Compose | `http://backend:8000` | `docker-compose.yml` → `frontend.environment` |

`.env.local` is never committed. Docker Compose injects its own value at container start. Both feed `process.env.BACKEND_URL` on the Node.js server.

---

### Open Questions / Risks

- [x] **Backend URL env var:** Resolved — use `BACKEND_URL` (server-only, no `NEXT_PUBLIC_` prefix). Set `http://localhost:8000` in `.env.local` for local dev and `http://backend:8000` in `docker-compose.yml` for Docker Compose.
- [x] **Decimal serialisation format:** Resolved — treat all `Numeric`/`Decimal` fields as `string` to preserve arbitrary precision. Do not parse to `number`. Display as-is in the table.
- [x] **Lighthouse coverage for `/tabularium/transactions`:** Resolved — add `/tabularium/transactions` to `.lighthouserc.js` in this issue so performance is gated from day one.
