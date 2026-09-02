# #issue-000: Cache Invalidation Fix

**GitHub Issue:** [issue-000 — Cache Invalidation Fix](https://github.com/Volscente/aerarium-saturni/issues/issue-000)
**GitHub Milestone:** Risk Rule Evaluation Engine

---

## Technical Scope

**In scope:**

- `frontend/app/(tabularium)/tabularium/actions.ts` — add `revalidateTag('holdings-exposure')` to `createTransaction`, `updateTransaction`, `deleteTransaction`
- `frontend/app/(tabularium)/tabularium/etf-actions.ts` — add `revalidateTag('holdings-exposure')` to `createEtf`, `updateEtf`, `deleteEtf`, `addPriceSnapshot`, `updatePriceSnapshot`, `deletePriceSnapshot`
- `frontend/app/api/etfs/[id]/holdings/upload/route.ts` — add `revalidateTag('holdings-exposure')` and `revalidateTag('portfolio-overview')` after a successful upload

**Out of scope:**

- `RiskAlert` schema and rule derivation — tracked separately under TASK-2
- Dashboard rendering of alerts — tracked separately under TASK-3
- Any change to what `portfolio-overview`/`transactions`/`etfs` tags already invalidate — this task only adds `holdings-exposure` alongside them, it does not touch the existing tags

---

## Architecture

```txt
Event A: Buy/Sell transaction         Event B: ETF/price mutation          Event C: Holdings upload
frontend/.../actions.ts               frontend/.../etf-actions.ts          frontend/app/api/etfs/[id]/holdings/upload/route.ts
  createTransaction                     createEtf                            POST handler (Route Handler, not a
  updateTransaction                     updateEtf                            Server Action — revalidateTag is a
  deleteTransaction                     deleteEtf                            general Next.js server API, usable
        │                                addPriceSnapshot                    here too)
        │  already calls:                updatePriceSnapshot                       │
        │    revalidateTag('transactions')  deletePriceSnapshot                    │  today calls:
        │    revalidateTag('portfolio-overview')     │                             │    nothing
        │                                             │  already calls:            │
        │  ADD:                                       │    revalidateTag('etfs')   │  ADD:
        │    revalidateTag('holdings-exposure')       │    revalidateTag('portfolio-overview')  revalidateTag('holdings-exposure')
        │                                              │                            revalidateTag('portfolio-overview')
        │                                              │  ADD:
        │                                              │    revalidateTag('holdings-exposure')
        ▼                                              ▼                            ▼
                    Next request to /tabularium/portfolio re-fetches
                    GET /portfolio/holdings/exposure fresh (cache tag
                    invalidated) instead of serving a stale cached response
```

### Why this is a prerequisite, not part of TASK-2/TASK-3

`holdings-exposure` is the cache tag `portfolio/page.tsx` already attaches to its `GET /portfolio/holdings/exposure` fetch (added when the Concentration Dashboard UI was built). Verified directly against this codebase: `grep -rn "revalidateTag" frontend/app` shows every existing call invalidates `transactions`, `portfolio-overview`, or `etfs` — never `holdings-exposure`. No alert computed in TASK-2 and no UI built in TASK-3 can be "real-time" if the data backing it is never invalidated in the first place; this has to land first (or at least land correctly regardless of merge order), independent of whether the rule engine or the dashboard panel exist yet.

---

## Tech Stack

No new packages — `revalidateTag` is an existing Next.js API already imported and used in both files being modified.

---

## Implementation Details

### Modules / Files

| File | Action | Description |
| --- | --- | --- |
| `frontend/app/(tabularium)/tabularium/actions.ts` | Modify | Add one `revalidateTag('holdings-exposure')` call to each of 3 existing functions |
| `frontend/app/(tabularium)/tabularium/etf-actions.ts` | Modify | Add one `revalidateTag('holdings-exposure')` call to each of 6 existing functions |
| `frontend/app/api/etfs/[id]/holdings/upload/route.ts` | Modify | Add `revalidateTag('holdings-exposure')` and `revalidateTag('portfolio-overview')` after a successful (2xx) upload response |

---

### Key Changes

No new functions — each change is a one-line addition immediately after the existing `revalidateTag(...)` call(s) already present in these functions, plus a docstring update in each to list the added tag. Representative diff shape (applies identically to all 9 Server Action functions, with `revalidateTag('holdings-exposure')` inserted after whatever tags that function already calls):

```typescript
// frontend/app/(tabularium)/tabularium/actions.ts — createTransaction (representative; same shape for
// updateTransaction, deleteTransaction, and all 6 functions in etf-actions.ts)

    revalidateTag('transactions')
    revalidateTag('portfolio-overview')
    revalidateTag('holdings-exposure')          // ADD — see 14-holdings-risk-alerts/rfc.md
    return { success: true }
```

```typescript
// frontend/app/api/etfs/[id]/holdings/upload/route.ts — full function, since this file
// currently has no revalidateTag import or call at all

import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const formData = await req.formData()

  const res = await fetch(`${process.env.BACKEND_URL}/etfs/${id}/holdings/upload`, {
    method: 'POST',
    body: formData,
  })

  const data = await res.json()

  if (res.ok) {
    revalidateTag('holdings-exposure')
    revalidateTag('portfolio-overview')
  }

  return NextResponse.json(data, { status: res.status })
}
```

---

### Data Models / Schemas

None — no request/response shape changes anywhere in this task.

---

### Testing Strategy

No backend changes, and this codebase has no frontend unit-test harness for Server Actions or Route Handlers (consistent with every other frontend task this session — see `.claude/13-holdings-data-visualisation/validation-scenarios.md`'s own "no existing frontend unit-test harness" notes).

**Manual verification:**

1. Note the current `total_weight_percentage` values on `/tabularium/portfolio`.
2. Trigger Event A: record a new buy transaction for an owned ETF.
3. Reload `/tabularium/portfolio` — confirm the numbers update immediately (not after some delay, not requiring a hard refresh/cache-bypass).
4. Trigger Event B: update a price via the ETF Registry's Edit/Price controls.
5. Reload — confirm current_value-dependent weighting updates immediately.
6. Trigger Event C: upload a new holdings CSV for an owned ETF.
7. Reload — confirm the new holdings' weights appear immediately.

**Edge cases:**

- A mutation that fails (e.g. a validation error returned before the `res.status !== 2xx` check) must NOT call `revalidateTag('holdings-exposure')` — no cache invalidation on a no-op write. This already matches the existing pattern (`revalidateTag` calls sit after the status-check `if` blocks in every function), so no new failure-path logic is needed — just confirm the added line lands after those checks, not before.
- The holdings-upload Route Handler currently returns whatever status the backend returned via `NextResponse.json(data, { status: res.status })` — the new `revalidateTag` calls must only run when `res.ok` (2xx), mirroring the Server Actions' existing status-gated pattern, not unconditionally before the response is constructed.

---

### Open Questions / Risks

- [ ] **Scope of `etf-actions.ts` coverage:** This task adds `revalidateTag('holdings-exposure')` to all 6 functions in `etf-actions.ts` (including `createEtf`/`updateEtf`/`deleteEtf`, not just the 3 price-related ones), matching how `portfolio-overview` is already invalidated uniformly across all 6 rather than only the ones that "obviously" affect exposure. Confirm this blanket approach is preferred over auditing each function individually for whether it can actually change look-through exposure. **Target:** before implementation begins.
