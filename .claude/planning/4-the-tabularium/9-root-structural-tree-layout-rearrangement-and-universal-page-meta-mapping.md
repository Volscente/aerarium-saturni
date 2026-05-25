# #9: Root Structural Tree Layout Rearrangement and Universal Page Meta Mapping

**GitHub Issue:** [#9 — Root Structural Tree Layout Rearrangement and Universal Page Meta Mapping](https://github.com/Volscente/aerarium-saturni/issues/9)
**GitHub Milestone:** [4-the-tabularium](https://github.com/Volscente/aerarium-saturni/milestone/2)
**Notion page:** [4 — The Tabularium](https://www.notion.so/4-The-Tabularium-3685cc6c0f078031b25bfeb9085d7a2b)

---

## Technical Scope

**In scope:**

- `the-codex/pages/` → `the-codex/content/` — directory migration; all existing MDX content relocated
- `the-codex/content/_meta.js` — root navigation config with per-page theme overrides
- `the-codex/content/index.mdx` — Home stub (empty body, correct frontmatter)
- `the-codex/content/tabularium.mdx` — Tabularium stub (empty body, correct frontmatter)
- `the-codex/content/codex/_meta.js` — Codex subtree navigation preserving existing structure
- `the-codex/content/codex/finance/black-scholes.mdx` — relocated from `the-codex/pages/finance/`
- `the-codex/.lighthouserc.js` — extended with assertion targets for `/`, `/tabularium`, and `/codex/finance/black-scholes`
- Playwright test fixtures — URL strings updated from `/finance/**` to `/codex/finance/**`; baselines regenerated
- MDX cross-link audit — absolute hrefs rewritten from `/finance/**` to `/codex/finance/**`
- FlexSearch smoke test — confirms search result hrefs resolve under `/codex/**`

**Out of scope:**

- Home page styled content (TASK-2)
- Tabularium styled content (TASK-3)
- Dockerfile and Nginx configuration changes
- Roman-aesthetic theme overrides (separate task)
- Portfolio management functional features (future phase)
- Database connectivity or state management

---

## Architecture

```txt
BEFORE                                    AFTER
─────────────────────────────────         ──────────────────────────────────────────────
the-codex/                                the-codex/
  pages/                                    content/
    index.mdx              ──────────►        index.mdx         (Home stub)
    finance/                                  tabularium.mdx    (Tabularium stub)
      black-scholes.mdx    ──────────►        _meta.js          (global nav)
                                              codex/
                                                _meta.js        (Codex subtree nav)
                                                finance/
                                                  black-scholes.mdx

_meta.js root entry structure:
  {
    index:       { title: 'Home',       theme: { sidebar: false, toc: false } }  → /
    tabularium:  { title: 'Tabularium', theme: { sidebar: false, toc: false } }  → /tabularium
    codex:       { title: 'Codex' }                                               → /codex/**
  }
```

### Why `content/` over `pages/`

Nextra 4's tab layout maps top-level `content/` entries directly to URL segments. The multi-pillar navigation (Home, Codex, Tabularium) cannot be expressed as sibling tab entries if the wiki content stays at the `pages/` root — Nextra 4 requires the hierarchical `content/` model to isolate each pillar under its own URL namespace.

---

## Tech Stack

No new packages required.

---

## Implementation Details

### Modules / Files

| File                                                          | Action | Description                                                                                           |
| ------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| `the-codex/content/_meta.js`                                  | Create | Root Nextra nav config: `index`, `tabularium`, `codex` entries; `index` and `tabularium` carry `theme: { sidebar: false, toc: false }` |
| `the-codex/content/index.mdx`                                 | Create | Home stub — empty body, minimal frontmatter; styled content added in TASK-2                          |
| `the-codex/content/tabularium.mdx`                            | Create | Tabularium stub — empty body, minimal frontmatter; styled content added in TASK-3                    |
| `the-codex/content/codex/_meta.js`                            | Create | Codex subtree nav — mirrors existing `pages/` `_meta.js` structure                                   |
| `the-codex/content/codex/finance/black-scholes.mdx`           | Move   | Relocated from `the-codex/pages/finance/black-scholes.mdx`; no content changes                       |
| `the-codex/pages/`                                            | Delete | Removed after clean build confirms the migration is complete                                          |
| `the-codex/.lighthouserc.js`                                  | Modify | Add `/`, `/tabularium`, `/codex/finance/black-scholes` as assertion targets                           |
| Playwright test fixtures                                      | Modify | Update URL strings from `/finance/black-scholes` to `/codex/finance/black-scholes`; regenerate baselines |

---

### Key Configuration Blocks

```js
// the-codex/content/_meta.js
// Root navigation contract for the three-pillar layout.
// index and tabularium suppress sidebar/ToC; codex inherits the standard doc layout.
export default {
  index: {
    title: 'Home',
    theme: { sidebar: false, toc: false },
  },
  tabularium: {
    title: 'Tabularium',
    theme: { sidebar: false, toc: false },
  },
  codex: {
    title: 'Codex',
  },
}
```

```js
// the-codex/content/codex/_meta.js
// Codex subtree nav — preserves existing structure from pages/_meta.js.
// Entries map to /codex/** URL paths; do not modify content keys.
export default {
  finance: {
    title: 'Finance',
  },
  // ... remaining entries ported from the-codex/pages/_meta.js
}
```

---

### Testing Strategy

**Build validation (CI gate):**

```bash
just codex-rebuild
```

Verify: build completes without errors; `.next/standalone` output is produced; no missing route warnings appear in build output. (`codex-rebuild` already runs `rm -rf .next` before building, so the cache is always clean.)

**FlexSearch smoke test (manual, post-build):**

Start the dev server and search for "black-scholes". Verify that the search result href begins with `/codex/finance/` and not `/finance/`. Confirms the index was rebuilt against the new content paths.

**Lighthouse CI:**

```bash
cd the-codex
npx lhci autorun
```

Verify: performance score ≥ 90 for all three assertion targets (`/`, `/tabularium`, `/codex/finance/black-scholes`).

**Cross-link audit (pre-merge):**

```bash
grep -r '/finance/' the-codex/content/
```

All matches must be rewritten to `/codex/finance/` before the branch is merged.

**Playwright fixture audit:**

```bash
grep -r '/finance/' the-codex/tests/
```

All matches must be updated to `/codex/finance/**`; baselines for `/`, `/tabularium`, and `/codex/finance/black-scholes` must be regenerated before enabling screenshot comparison in CI.

**Theme suppression verification (manual, post-dev-server start):**

```bash
cd the-codex && npm run dev
# Navigate to http://localhost:3000 and http://localhost:3000/tabularium
```

Expected behavior: both pages render as a full-width surface with **no left sidebar panel** and **no right ToC panel** visible. If either panel appears, the `_meta.js` theme API is not behaving as documented for the pinned Nextra version — implement the `getLayout` fallback instead (see Open Questions).

**Edge cases:**

- `the-codex/pages/` leftover files after migration → confirm directory is fully deleted; no duplicate route conflicts with `content/`
- Nextra 4 `_meta.js` theme API not suppressing sidebar/ToC → implement a minimal `getLayout` wrapper exported from `index.mdx` and `tabularium.mdx` using Next.js's page-level `getLayout` pattern as fallback

---

### Open Questions / Risks

- [x] **Nextra 4 `_meta.js` theme API discrepancy:** `{ sidebar: false, toc: false }` may not behave as documented for the pinned Nextra version. Verify with the theme suppression check in Testing Strategy; fallback is a `getLayout` wrapper component exported from the page file. **Target:** confirmed before M1 merge. **Answer:** Testing in UAT.
