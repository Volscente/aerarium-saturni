# [HOTFIX] No Visible Search Bar

**Severity:** Critical
**Affected versions:** 0.0.2
**Environments:** Production, Staging
**GitHub Repo:** https://github.com/Volscente/aerarium-saturni
**Tech stack:** Next.js 15, Nextra 4, FlexSearch, Tailwind CSS

---

## Symptom

The search bar is not visible in the Codex pillar (routes under `/codex/**`). Users cannot search for content within the Codex area.

---

## Root Cause Analysis

The `<Layout>` component in `app/[[...slug]]/layout.tsx` receives a `navbar` prop set to `<CustomNavbar />`:

```tsx
<Layout
  pageMap={pageMap}
  navbar={<CustomNavbar />}   // ← replaces the entire Nextra default navbar
  footer={<CustomFooter />}
  ...
>
```

In Nextra 4 (`nextra-theme-docs`), providing a custom `navbar` prop replaces the default Nextra navbar **in full**, including its embedded FlexSearch search bar. The `CustomNavbar` (`theme/components/Navbar.tsx`) was intentionally designed as a framework-agnostic component — data-driven `NavLink[]` array, `usePathname()` active state — with no Nextra-specific imports and therefore no search integration.

This design is correct for the Tabularium layout, where Nextra chrome is absent by design. However, when the same `CustomNavbar` was adopted for the Nextra `[[...slug]]` layout during the 2026-06-01 restructuring, it displaced the default navbar and with it the only entry point for the FlexSearch integration.

```
Before 2026-06-01 (app/layout.tsx — root)        After 2026-06-01 (app/[[...slug]]/layout.tsx)
─────────────────────────────────────────         ──────────────────────────────────────────────
Nextra <Layout>                                   Nextra <Layout>
  └── default navbar                                └── navbar={<CustomNavbar />}
        ├── nav links                                     ├── nav links      ✓
        └── <Search />  ← FlexSearch UI                  └── (no search)    ✗
```

The `styles/globals.css` overrides are not implicated — they contain no selectors targeting Nextra search components.

---

## Technical Scope

**In scope:**

- `frontend/app/[[...slug]]/layout.tsx` — add a `search` prop to the Nextra `<Layout>` to restore FlexSearch without altering `CustomNavbar`

**Out of scope:**

- `theme/components/Navbar.tsx`: `CustomNavbar` remains framework-agnostic; no changes needed
- `app/(tabularium)/tabularium/layout.tsx`: Tabularium has no Nextra chrome by design
- `styles/globals.css`: no CSS suppression identified
- Search behavior or ranking changes: separate initiative

---

## Implementation Details

### Modules / Files

| File | Action | Description |
|------|--------|-------------|
| `frontend/app/[[...slug]]/layout.tsx` | Modify | Import `Search` from `nextra-theme-docs` and pass it as the `search` prop to `<Layout>` |

### Key Changes

#### `frontend/app/[[...slug]]/layout.tsx`

Add `Search` to the existing import from `nextra-theme-docs` and pass it to the `<Layout>` `search` prop. No other file needs to change.

```tsx
// Before
import { Layout } from 'nextra-theme-docs'

<Layout
  pageMap={pageMap}
  docsRepositoryBase="https://github.com/Volscente/aerarium-saturni/tree/main/frontend"
  navbar={<CustomNavbar />}
  footer={<CustomFooter />}
  darkMode
  sidebar={{ defaultMenuCollapseLevel: 1, toggleButton: true }}
>
  {children}
</Layout>

// After
import { Layout, Search } from 'nextra-theme-docs'

<Layout
  pageMap={pageMap}
  docsRepositoryBase="https://github.com/Volscente/aerarium-saturni/tree/main/frontend"
  navbar={<CustomNavbar />}
  footer={<CustomFooter />}
  search={<Search />}
  darkMode
  sidebar={{ defaultMenuCollapseLevel: 1, toggleButton: true }}
>
  {children}
</Layout>
```

The `Search` component is provided by `nextra-theme-docs` and handles the FlexSearch index fetch from `/_next/static/chunks/nextra-data-en-US.json` internally. The `navbar` prop remains unchanged, keeping `CustomNavbar` framework-agnostic.

---

## Verification

### Manual checks (Staging → Production)

1. Navigate to `/codex` — confirm the search bar is visible in the page header.
2. Navigate to any `/codex/**` article — confirm the search bar is visible.
3. Type 1 character — confirm no results appear (minimum-2-character constraint).
4. Type 2+ characters — confirm search results populate from the Codex index.
5. Verify the search index loads: open DevTools → Network tab → confirm `nextra-data-en-US.json` returns HTTP 200.
6. Toggle light and dark mode — confirm search bar is visible in both.
7. Navigate to `/tabularium` — confirm no search bar appears (Tabularium has no Nextra chrome by design).

### Edge cases

- Empty query (0–1 characters): no results, no error.
- Query with no matches: graceful empty state, no console errors.
- Fast repeated keystrokes: no duplicate index fetches or UI flicker.

### Automated

```bash
cd frontend
npm run build          # must complete within 3-minute CI guard
npx lhci autorun       # Lighthouse performance score must remain ≥ 90 for /, /tabularium, /codex/fundamentals
```

---

## Open Questions / Risks

- [ ] **Nextra 4 Search prop availability:** Confirm `Search` is exported from the installed version of `nextra-theme-docs` before implementation. If not exported, the fallback is to wrap `CustomNavbar` in a thin `NextraNavbar` adapter that renders both `CustomNavbar` and `Search`. **Target:** before implementation start.
- [ ] **Styling bleed from Search component:** Nextra's `Search` UI is styled by `nextra-theme-docs/style.css` (already imported in the layout). Verify the rendered search widget does not expose unwanted standard Nextra chrome that violates the invariant "No standard Nextra styling may be visible in the final site." **Target:** Step 6 of manual verification.
- [ ] **Lighthouse performance regression:** Adding the FlexSearch UI component increases client-side JS weight. Run `lhci autorun` and confirm score remains ≥ 90. **Target:** automated verification step.
