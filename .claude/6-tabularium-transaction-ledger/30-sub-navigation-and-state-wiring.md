# #30: Sub-navigation and State Wiring

**GitHub Issue:** [#30 — Sub-navigation and State Wiring](https://github.com/Volscente/aerarium-saturni/issues/30)
**GitHub Milestone:** [6-tabularium-transaction-ledger](https://github.com/Volscente/aerarium-saturni/milestone/4)
**Notion page:** [6-Tabularium-Transaction-Ledger-Input-Engine](https://app.notion.com/p/6-Tabularium-Transaction-Ledger-Input-Engine-37a5cc6c0f0780a8a9d7cb0bd6ef5119)

---

## Technical Scope

**In scope:**

- `app/(tabularium)/tabularium/components/TabulariumSubNav.tsx` — New `'use client'` component; two nav links (`/tabularium/portfolio`, `/tabularium/transactions`) with `usePathname()` active-state prefix matching; styled with `roman-*` Tailwind tokens; no Nextra imports
- `app/(tabularium)/tabularium/layout.tsx` — Insert `<TabulariumSubNav />` between the `AddTransactionButton` bar and `<main>`
- End-to-end verification: submitting a transaction from `/tabularium/portfolio` must cause the new row to appear in `/tabularium/transactions` without a full page reload

**Out of scope:**

- Adding a third Tabularium sub-route (README invariant: exactly two sub-routes — `/tabularium/portfolio` and `/tabularium/transactions`)
- Any Nextra imports in `TabulariumSubNav` (the Tabularium layout has no Nextra context)
- Backend changes (TASK-1 complete)
- Transaction ledger page changes (TASK-2 complete)
- Drawer, form, or Server Action changes (TASK-3 complete)
- `revalidateTag` changes — `createTransaction` already calls `revalidateTag('transactions')`

---

## Architecture

```txt
app/(tabularium)/tabularium/layout.tsx
    │
    ├── <CustomNavbar />                    ← existing; no Nextra imports
    │
    ├── <div>  (right-aligned action bar)
    │    └── <AddTransactionButton />        ← existing 'use client'; owns isDrawerOpen
    │         └── <TransactionDrawer />      ← existing 'use client'; fixed right panel
    │              └── <TransactionForm />   ← existing 'use client'; dynamic form
    │                   └── createTransaction()  (actions.ts Server Action)
    │                        ├── POST /transactions
    │                        └── revalidateTag('transactions')
    │
    ├── <TabulariumSubNav />                 ← NEW 'use client'
    │    ├── <Link href="/tabularium/portfolio">Portfolio</Link>
    │    └── <Link href="/tabularium/transactions">Transactions</Link>
    │         └── usePathname() → prefix-match active state
    │
    └── <main>
         └── {children}
              └── /tabularium/transactions/page.tsx (Server Component)
                   └── fetch GET /transactions  [tag: 'transactions']
                        └── list[TransactionResponse] → 11-column ledger table
```

### Why `TabulariumSubNav` is a separate component

`TabulariumSubNav` uses `usePathname()`, a client-only hook, which means it must be a `'use client'` component. Isolating it in its own file keeps `layout.tsx` as a React Server Component boundary — consistent with the existing pattern where `AddTransactionButton` is similarly extracted. Placing the sub-nav in the layout (not in each page) ensures it persists across sub-route navigations without remounting.

---

## Tech Stack

No new packages required.

---

## Implementation Details

### Modules / Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `app/(tabularium)/tabularium/components/TabulariumSubNav.tsx` | Create | `'use client'` sub-nav component; data-driven `NavLink[]` array; `usePathname()` prefix-match active state; `roman-*` token styling; no Nextra imports |
| `app/(tabularium)/tabularium/layout.tsx` | Modify | Insert `<TabulariumSubNav />` between the action bar (containing `AddTransactionButton`) and `<main>` |

---

### Key Functions

```tsx
// app/(tabularium)/tabularium/components/TabulariumSubNav.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavLink {
  label: string
  href: string
}

const NAV_LINKS: NavLink[] = [
  { label: 'Portfolio', href: '/tabularium/portfolio' },
  { label: 'Transactions', href: '/tabularium/transactions' },
]

/**
 * Persistent Tabularium sub-navigation bar.
 *
 * Renders two links covering the two Tabularium sub-routes. Active state is
 * determined by prefix-matching the current pathname against each link's href,
 * consistent with the CustomNavbar pattern. Must not import from 'nextra' or
 * 'nextra/components' — the Tabularium layout has no Nextra context.
 *
 * Token reference (styles/globals.css @theme):
 *   roman-terracotta (#C0553A) — active link text + underline
 *   roman-stone      (#8B8680) — inactive link text
 *   roman-gold       (#B8860B) — inactive link hover
 *   roman-parchment  (#F5F0E8) — light-mode background
 *   roman-obsidian   (#1A1A2E) — dark-mode background
 *
 * @returns A <nav> element with two styled anchor links.
 */
export function TabulariumSubNav() {
  const pathname = usePathname()

  return (
    <nav className="flex gap-6 border-b border-roman-stone/40 bg-roman-parchment dark:bg-roman-obsidian px-6 py-2 text-sm">
      {NAV_LINKS.map(({ label, href }) => {
        const active = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={`font-medium transition-colors pb-2 ${
              active
                ? 'text-roman-terracotta border-b-2 border-roman-terracotta'
                : 'text-roman-stone hover:text-roman-gold'
            }`}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
```

```tsx
// app/(tabularium)/tabularium/layout.tsx  (diff: add TabulariumSubNav)
// Import added:
import { TabulariumSubNav } from './components/TabulariumSubNav'

// Layout body — insert <TabulariumSubNav /> after the action bar, before <main>:
export default function TabulriumLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CustomNavbar />
      <div className="flex justify-end px-6 py-2">
        <AddTransactionButton />
      </div>
      <TabulariumSubNav />        {/* ← inserted here */}
      <main className="...">
        {children}
      </main>
      <CustomFooter />
    </>
  )
}
```

---

### Data Models / Schemas

No new data models. `TabulariumSubNav` uses the local `NavLink` interface (label + href pair) that is not exported — it is internal to the component, following the same pattern as the data-driven array in `CustomNavbar`.

---

### Testing Strategy

**Manual verification (required before merge):**

1. Start the dev stack (`just frontend-dev` + `just backend-dev`).
2. Navigate to `/tabularium/portfolio` — verify the **Portfolio** link is highlighted; **Transactions** is not.
3. Navigate to `/tabularium/transactions` — verify the **Transactions** link is highlighted; **Portfolio** is not.
4. Navigate to `/tabularium` (root landing) — verify neither link is active (prefix `/tabularium/portfolio` and `/tabularium/transactions` do not match `/tabularium` alone).
5. Open the drawer from `/tabularium/portfolio`, submit a valid transaction, navigate to `/tabularium/transactions` — the new row must appear **without a full page reload**.

**Invariant check:**

```bash
# Confirm no Nextra imports crept into the new component
grep -r 'nextra' frontend/app/\(tabularium\)/tabularium/components/TabulariumSubNav.tsx
# Expected: no output
```

**Lighthouse CI** (`lhci autorun`) must continue to pass ≥ 90 on all four asserted URLs, including `/tabularium/transactions`. The sub-nav adds only a single `<nav>` element and two `<Link>` anchors — no new JS bundles are introduced.

**Edge cases:**

- Root `/tabularium` path → no sub-nav link is active (prefix matching; `/tabularium` does not start with `/tabularium/portfolio` or `/tabularium/transactions`)
- `AddTransactionButton` drawer remains functional on both sub-routes after layout update — sub-nav insertion must not displace or unmount the button
- Dark mode: `roman-*` dark-mode variants must render correctly on both sub-routes

---

### Open Questions / Risks

- [x] **UAT gate:** Per the RFC, end-to-end verification must be confirmed before the milestone is marked complete. The PR must not be merged without passing UAT (steps 1–5 of the manual verification checklist above). **Target:** before PR merge
