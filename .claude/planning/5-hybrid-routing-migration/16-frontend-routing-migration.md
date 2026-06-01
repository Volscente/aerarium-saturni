# #16: Frontend Routing Migration

**GitHub Issue:** [#16 — Frontend Routing Migration](https://github.com/Volscente/aerarium-saturni/issues/16)
**GitHub Milestone:** [5-hybrid-routing-migration](https://github.com/Volscente/aerarium-saturni/milestone/3)
**Notion page:** [5-Hybrid-Routing-Migration](https://app.notion.com/p/5-Hybrid-Routing-Migration-36c5cc6c0f078050b8dae419491a7954)

---

## Technical Scope

**In scope:**

- `the-codex/` → `frontend/` — workspace directory renamed; all internal paths unchanged
- `frontend/app/layout.tsx` — stripped to minimal shell (`<html>`, `<body>`, global CSS, `NextThemes`); Nextra `<Layout>` removed
- `frontend/app/[[...slug]]/layout.tsx` — new file; receives Nextra `<Layout>` wrapper
- `frontend/app/(tabularium)/tabularium/layout.tsx` — new file; `CustomNavbar` + `CustomFooter`, no Nextra chrome, full-width content area
- `frontend/app/(tabularium)/tabularium/page.tsx` — new file; Tabularium landing page
- `frontend/app/(tabularium)/tabularium/portfolio/page.tsx` — new file; empty placeholder
- `frontend/app/(tabularium)/tabularium/transactions/page.tsx` — new file; empty placeholder
- `frontend/theme/components/Navbar.tsx` — refactored to `'use client'`; typed `{ label, href }` link array; `usePathname()` active state via prefix matching; Providentia placeholder commented out
- `frontend/content/_meta.js` — `tabularium` entry removed
- `frontend/content/tabularium.mdx` — deleted
- `justfile` — `codex-rebuild` → `frontend-rebuild`, `codex-dev` → `frontend-dev`; all `the-codex/` paths updated to `frontend/`

**Out of scope:**

- Dashboard content (charts, data tables, forms) — future initiative
- Database integration and queries
- Any changes to `GET /` or `GET /codex/**` routes
- Visual or design changes to `CustomNavbar` or `CustomFooter`
- Authentication or authorisation

---

## Architecture

```txt
Browser Request
        │
        ├── GET /            ─┐
        └── GET /codex/**    ─┤─► app/[[...slug]]/layout.tsx  (Nextra <Layout>)
                              │       └── MDX pipeline: sidebar + ToC + FlexSearch + prose wrapper
                              │
        └── GET /tabularium/** ──► app/(tabularium)/tabularium/layout.tsx
                                       └── CustomNavbar + CustomFooter (no Nextra chrome)
                                            ├── page.tsx              (/tabularium landing)
                                            ├── portfolio/page.tsx    (/tabularium/portfolio placeholder)
                                            └── transactions/page.tsx (/tabularium/transactions placeholder)

app/layout.tsx (root shell — no Nextra involvement)
  <html> + <body> + NextThemesProvider + global CSS (styles/globals.css)
        │
        ├── app/[[...slug]]/layout.tsx  ← Nextra <Layout> scoped here only
        └── app/(tabularium)/          ← Route group (parenthetical; invisible to URL router)
                 └── tabularium/layout.tsx  ← CustomNavbar + CustomFooter shell
```

### Step ordering constraint

`content/tabularium.mdx` must be deleted and its `_meta.js` entry removed **before** `app/(tabularium)/tabularium/page.tsx` is created. Nextra's `[[...slug]]` catch-all derives its route set from the `content/` file tree; if the MDX file still exists when the App Router page goes live, the catch-all silently shadows the new route and `GET /tabularium` continues to serve Nextra content.

---

## Tech Stack

No new packages required. All dependencies (Next.js 15, Nextra 4, Tailwind CSS, Lucide React) are already present in `frontend/package.json`.

---

## Implementation Details

### Modules / Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `the-codex/` → `frontend/` | Rename | Workspace directory rename; all internal paths unchanged |
| `frontend/app/layout.tsx` | Modify | Strip to minimal shell; remove Nextra `<Layout>`; retain `NextThemesProvider` and global CSS import |
| `frontend/app/[[...slug]]/layout.tsx` | Create | Nextra `<Layout>` wrapper; scopes Nextra chrome exclusively to catch-all routes |
| `frontend/app/(tabularium)/tabularium/layout.tsx` | Create | `CustomNavbar` + `CustomFooter`; no Nextra chrome; full-width `<main>` content area |
| `frontend/app/(tabularium)/tabularium/page.tsx` | Create | Tabularium landing page using `roman-*` Tailwind tokens |
| `frontend/app/(tabularium)/tabularium/portfolio/page.tsx` | Create | Empty placeholder; establishes `/tabularium/portfolio` sub-route |
| `frontend/app/(tabularium)/tabularium/transactions/page.tsx` | Create | Empty placeholder; establishes `/tabularium/transactions` sub-route |
| `frontend/theme/components/Navbar.tsx` | Modify | Refactor to `'use client'`; data-driven `NavLink[]` constant; `usePathname()` prefix-matching active state |
| `frontend/content/_meta.js` | Modify | Remove `tabularium` entry; retain Home and Codex entries unchanged |
| `frontend/content/tabularium.mdx` | Delete | Removes Nextra's claim on `/tabularium`; prerequisite for route group page creation |
| `justfile` | Modify | Rename `codex-rebuild` → `frontend-rebuild`, `codex-dev` → `frontend-dev`; update all `the-codex/` path references to `frontend/` |

---

### Key Functions

```typescript
// frontend/theme/components/Navbar.tsx

interface NavLink {
  label: string;
  href: string;
}

/**
 * Determines whether a nav link should be styled as active.
 *
 * Uses prefix matching so child routes (e.g. /tabularium/portfolio) keep the
 * parent tab active. The Home link ('/') is matched exactly to prevent it from
 * being active on every route.
 *
 * Args:
 *   pathname: Current URL pathname returned by usePathname().
 *   href: The link's href to test against.
 *
 * Returns:
 *   true if the link should receive the active CSS class, false otherwise.
 */
function isActive(pathname: string, href: string): boolean
```

```typescript
// frontend/theme/components/Navbar.tsx

/**
 * Framework-agnostic top navigation bar.
 *
 * Iterates the module-level NAV_LINKS constant to render <Link> elements with
 * active-state styling from usePathname(). Declared as 'use client' because it
 * reads pathname at render time. Reusable in both the Nextra [[...slug]] layout
 * and the Tabularium route group layout without any Nextra page-map dependency.
 *
 * Returns:
 *   A <nav> element containing three <Link> entries (Home, Tabularium, Codex).
 *   A commented-out Providentia entry is present for future extension.
 */
export default function CustomNavbar(): JSX.Element
```

```typescript
// frontend/app/[[...slug]]/layout.tsx

/**
 * Layout for all Nextra-managed routes (Home '/' and Codex '/codex/**').
 *
 * Wraps children in the Nextra <Layout> component, confining sidebar, ToC,
 * prose wrapper, and FlexSearch integration to catch-all routes only. The
 * root app/layout.tsx no longer contains Nextra <Layout> after this change.
 *
 * Args:
 *   children: React nodes provided by Nextra's MDX compilation pipeline.
 *
 * Returns:
 *   Nextra <Layout> wrapping children; Nextra theme config from theme/config.tsx.
 */
export default function NextraLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element
```

```typescript
// frontend/app/(tabularium)/tabularium/layout.tsx

/**
 * Layout shell for all Tabularium routes (/tabularium and /tabularium/**).
 *
 * Renders CustomNavbar and CustomFooter with a full-width <main> content area
 * and zero Nextra chrome. Composable: future dashboard sub-pages slot in as
 * children without revisiting the routing architecture. Reuses roman-* Tailwind
 * tokens from styles/globals.css for visual continuity across pillars.
 *
 * Args:
 *   children: React nodes for the active Tabularium sub-route page.
 *
 * Returns:
 *   Full-page shell: CustomNavbar at top, <main> flex-grow content, CustomFooter at bottom.
 */
export default function TabulariumLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element
```

---

### Data Models / Schemas

```typescript
// frontend/theme/components/Navbar.tsx

interface NavLink {
  label: string;  // Display text rendered inside the <Link>
  href: string;   // URL path used for <Link href> and isActive() prefix matching
}

const NAV_LINKS: NavLink[] = [
  { label: "Home", href: "/" },
  { label: "Tabularium", href: "/tabularium" },
  { label: "Codex", href: "/codex" },
  // { label: "Providentia", href: "/providentia" },  // future RFC
];
```

---

### Testing Strategy

**Manual smoke tests (required before closing issue):**

- Navigate to `/` — Home renders, no Nextra sidebar visible, "Home" link is active in navbar, `roman-*` design tokens applied correctly.
- Navigate to `/codex/fundamentals` — Nextra sidebar renders, ToC renders, search returns results; "Codex" link is active in navbar.
- Navigate to `/tabularium` — no Nextra sidebar, no ToC, no prose wrapper; "Tabularium" link is active in navbar.
- Navigate to `/tabularium/portfolio` — placeholder page renders (no 404); "Tabularium" link remains active (prefix match).
- Navigate to `/tabularium/transactions` — placeholder page renders; "Tabularium" link active.

**Automated checks (CI must remain green):**

```bash
# From repository root
just frontend-build    # renamed from codex-rebuild; must complete within 3 minutes
npx lhci autorun       # run from frontend/; Lighthouse score ≥ 90 at /, /tabularium, /codex/fundamentals
npx playwright test    # existing screenshot tests must pass without regression
```

**Edge cases:**

- `usePathname()` returns `/` → only "Home" link active (exact match, not prefix); Tabularium and Codex links inactive.
- `usePathname()` returns `/codex/fundamentals/mathematics` → "Codex" link active (prefix `/codex` matches); Home and Tabularium inactive.
- `GET /tabularium` with `content/tabularium.mdx` still present → Nextra catch-all shadows the App Router page; deletion must be verified with a 404 response before the route group page is created.

---

### Open Questions / Risks

- [x] **Routing conflict**: Verify `curl http://localhost:3000/tabularium` returns 404 after deleting `content/tabularium.mdx` and before creating `app/(tabularium)/tabularium/page.tsx`. **Target:** Step 3 of M1 implementation. **Anwer:** Verify as manual step.
- [ ] **Navbar active state regression**: Test `isActive()` at `/`, `/codex/fundamentals`, and `/tabularium` to confirm exact-match for Home and prefix-match for Tabularium and Codex. **Target:** during CustomNavbar refactor
- [ ] **Nextra Layout scope leak**: Confirm sidebar, ToC, and FlexSearch search results remain functional on `/codex/fundamentals` after moving `<Layout>` to `app/[[...slug]]/layout.tsx`. **Target:** after Step 1 of M1 implementation
