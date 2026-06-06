# Initiative — Tabularium Hybrid Routing Migration

## 1. What

Migrate the Tabularium pillar from a Nextra-managed MDX page (`content/tabularium.mdx`) to a dedicated **Next.js App Router route group** (`app/(tabularium)/`), while leaving the Home and Codex pillars untouched under Nextra. The top navigation bar, design tokens, and global layout remain visually unified across all three pillars. The Nextra `<Layout>` wrapper is moved from the root layout down into the `[[...slug]]` layout so it only applies to Nextra-served pages.

---

## 2. Why

Nextra is a documentation framework. Its value lies in MDX compilation, sidebar generation, full-text search, and static content delivery — all exactly right for the Codex. Applied to the Tabularium, however, it creates compounding friction:

- **No native DB access pattern**: Nextra pages are MDX files; wiring Server Components or Server Actions for DB reads/writes means embedding increasingly complex JSX into a markdown file
- **Prose wrapper conflict**: Nextra injects a typography container around MDX content that fights dashboard layouts (charts, data tables, forms need full-width, not a constrained prose column)
- **No route granularity**: A dashboard needs sub-routes (`/tabularium/portfolio`, `/tabularium/transactions`) with their own layouts and data-fetching logic — Nextra's file-system routing is designed for documentation trees, not application pages
- **Theme lock-in**: Nextra controls sidebar, ToC, and navigation tab rendering; suppressing them via `_meta.js` overrides is a workaround, not a design

Next.js 15 App Router, which Nextra already runs on top of, provides all the primitives the Tabularium needs natively — Server Components, Server Actions, route groups, co-located layouts. Using it directly for the Tabularium removes all the above friction while keeping a single deployment.

---

## 3. Success Criteria

- `GET /tabularium` and all `GET /tabularium/**` sub-routes are served by the App Router route group with zero Nextra involvement
- The top navigation bar renders on all three pillars with correct active-route highlighting, driven by `usePathname()` rather than Nextra's page map
- The Tabularium layout renders without Nextra sidebar, ToC, prose wrapper, or any documentation chrome
- `GET /` (Home) and all `GET /codex/**` routes continue to work identically — no regressions
- `content/tabularium.mdx` and the `tabularium` entry in `content/_meta.js` are removed without breaking the build
- Lighthouse performance score ≥ 90 for `/tabularium`
- CI build completes within 3 minutes
- The Tabularium route group is structurally ready to receive dashboard sub-pages (charts, forms, DB queries) without further architectural changes

---

## 4. Approach Overview

The migration has three sequential steps:

**Step 1 — Lift Nextra Layout out of the root layout.**
Move the Nextra `<Layout>` wrapper from `app/layout.tsx` into `app/[[...slug]]/layout.tsx`. The root layout becomes a minimal shell: `<html>`, `<body>`, global imports, and the `NextThemes` provider only. This ensures that any route not matched by `[[...slug]]` — specifically the Tabularium group — never enters the Nextra rendering path.

**Step 2 — Add the Tabularium route group.**
Create `app/(tabularium)/tabularium/layout.tsx` and `page.tsx`. The layout renders `CustomNavbar` and `CustomFooter` directly (the same components already used by Nextra pages), giving the Tabularium the same visual shell without the Nextra overhead.

**Step 3 — Decouple the Navbar from Nextra's page map.**
Currently `CustomNavbar` wraps Nextra's `<Navbar>` component, which derives the top-level tabs (Home, Codex, Tabularium) from `_meta.js` at render time. Once Tabularium is removed from `_meta.js`, Nextra's tab list shrinks to two entries. The fix: replace the Nextra `<Navbar>` wrapper with an explicit three-link nav using Next.js `<Link>` and `usePathname()` for active state. `CustomNavbar` becomes framework-agnostic and reusable in both the Nextra and Tabularium layouts.

---

## 5. Architecture Details

**Current:**

```
app/
  layout.tsx                    ← html + body + Nextra <Layout> (CustomNavbar, CustomFooter)
  [[...slug]]/
    page.tsx                    ← Nextra catch-all (Home, Tabularium, Codex)
content/
  _meta.js                      ← index, tabularium, codex
  index.mdx
  tabularium.mdx
  codex/
```

**Target:**

```
app/
  layout.tsx                    ← html + body + NextThemes provider only
  [[...slug]]/
    layout.tsx                  ← Nextra <Layout> (CustomNavbar, CustomFooter, sidebar/toc)
    page.tsx                    ← Nextra catch-all (Home + Codex routes only)
  (tabularium)/
    tabularium/
      layout.tsx                ← Dashboard shell: CustomNavbar + CustomFooter, no Nextra
      page.tsx                  ← Tabularium landing (styled placeholder → dashboard)
      portfolio/
        page.tsx                ← (future) Portfolio overview with charts and table
      transactions/
        page.tsx                ← (future) Transaction entry form + history

content/
  _meta.js                      ← index, codex only (tabularium entry removed)
  index.mdx                     ← Home page (unchanged)
  codex/                        ← Codex content (unchanged)

theme/components/
  Navbar.tsx                    ← Refactored: hard-coded Link[Home, Codex, Tabularium]
                                   with usePathname() active state; Nextra <Navbar> removed
```

**Key decisions:**

| Decision | Rationale |
| --- | --- |
| Route group `(tabularium)` rather than a top-level `tabularium/` directory | Route groups are invisible to the URL; avoids slug conflicts with Nextra's `[[...slug]]` catch-all |
| `CustomNavbar` uses hard-coded links + `usePathname()` | The only way to maintain a three-pillar nav once Tabularium is outside Nextra's page map |
| Nextra `<Layout>` moves to `[[...slug]]/layout.tsx` | Prevents the Nextra shell (sidebar, ToC, prose wrapper) from leaking into the Tabularium route group |
| `content/tabularium.mdx` deleted | Keeping it would cause Nextra to still render `/tabularium` via the catch-all, creating a routing conflict with the App Router page |

**Data flow for future dashboard pages:**

```
Browser → GET /tabularium/portfolio
  → app/(tabularium)/tabularium/layout.tsx   (shared shell: Navbar, Footer)
  → app/(tabularium)/tabularium/portfolio/page.tsx   (Server Component)
       ├── DB query (Server Component, direct)
       └── <PortfolioChart />   (Client Component, receives data as props)
            └── <TransactionForm />   (Client Component, Server Action on submit)
```

No API layer needed between the page and the database — Server Components query directly, pass serializable data down to Client Components for interactivity.
