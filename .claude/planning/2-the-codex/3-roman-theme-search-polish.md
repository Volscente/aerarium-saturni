# #3: Roman Theme & Search Polish

**GitHub Issue:** [#3 — Roman Theme & Search Polish](https://github.com/Volscente/aerarium-saturni/issues/3)
**GitHub Milestone:** Milestone 2 — Roman Theme & Search Polish
**Notion page:** N/A

---

## Technical Scope

**In scope:**

- `the-codex/tailwind.config.js` — Tailwind JIT config with Roman color palette, Nextra output paths, and `@layer base` overrides
- `the-codex/postcss.config.js` — PostCSS config required by Tailwind
- `the-codex/styles/globals.css` — Add Tailwind directives; Roman CSS custom properties replacing Nextra defaults
- `the-codex/theme/index.tsx` — Full `Layout` component replacing the TASK-1 stub
- `the-codex/theme/config.tsx` — Updated `DocsThemeConfig` with Lucide icon injections, custom `search.component`, and other component shadows
- `the-codex/theme/components/Navbar.tsx` — Roman-themed navbar; all icons via Lucide React
- `the-codex/theme/components/Sidebar.tsx` — Roman-themed sidebar; all icons via Lucide React
- `the-codex/theme/components/Footer.tsx` — Roman-themed footer
- `the-codex/theme/components/CodeBlock.tsx` — Roman-styled code block
- `the-codex/rehype/katexOverflow.ts` — Custom rehype plugin wrapping block LaTeX in `overflow-x-auto` scroll containers
- `the-codex/next.config.mjs` — Register `katexOverflow` plugin after `rehype-katex` in the pipeline
- `the-codex/tests/mobile-screenshot.spec.ts` — Playwright test at 375 px viewport for mobile LaTeX overflow regression
- `.github/workflows/ci.yml` — Add Playwright screenshot step to the CI matrix

**Out of scope:**

- User authentication or access control
- Real-time market data or dynamic content
- Shared header/footer with the main Aerarium Saturni application (deferred to a future phase using a shared design-token package)
- Migration to server-side search (Meilisearch/Algolia) — flagged as a future risk only
- Path-based (`/wiki`) routing validation — subdomain topology is primary; path-based remains commented out in `next.config.mjs`

---

## Architecture

```txt
MDX Files                        Nextra Build Pipeline
└── pages/**/*.mdx  ──►  remark-math → rehype-katex → katexOverflow
                          FlexSearch index (h1/h2: 2× weight, custom stopwords)
                                        │
                                        ▼
                          Static Site  (.next/standalone)
                                        │
                    ┌───────────────────┴──────────────────┐
                    ▼                                       ▼
       Custom Theme Layer                      FlexSearch Bundle
  ┌──────────────────────────┐                 (client-side, <200 ms)
  │  Layout  (theme/index)   │
  │  ├── Navbar              │◄── tailwind.config.js (Roman palette)
  │  ├── Sidebar             │◄── @layer base (Nextra CSS prop overrides)
  │  ├── Footer              │◄── Lucide React (all icons)
  │  └── CodeBlock           │
  └──────────────────────────┘
                    │
                    ▼
         Browser: zero visible Nextra base styles
         Lighthouse ≥ 90 · Search < 200 ms · LaTeX no-overflow
```

### Why shadow components instead of pure CSS overrides

Nextra v2 renders several components (e.g., the mobile menu toggle, search input, TOC arrows) with inline styles or non-Tailwind class names that `@layer base` cannot reach. For these surfaces, the component is re-exported from `theme/config.tsx` using the `DocsThemeConfig` component-override slots (`navbar`, `sidebar`, `footer`). This avoids forking Nextra while guaranteeing zero base-style leakage.

---

## Tech Stack

New packages introduced:

| Package               | Version   | Justification                                                                 |
| --------------------- | --------- | ----------------------------------------------------------------------------- |
| `tailwindcss`         | `>=3.4`   | Utility-first styling for Roman palette; JIT keeps CSS bundle minimal         |
| `autoprefixer`        | `>=10.4`  | Required PostCSS plugin for Tailwind                                          |
| `postcss`             | `>=8.4`   | PostCSS pipeline required by Tailwind                                         |
| `@tailwindcss/typography` | `>=0.5` | Prose styling for MDX article body; overridden to Roman typography        |
| `lucide-react`        | `>=0.400` | Lightweight, tree-shakeable icon set; replaces all Nextra default icons       |
| `@playwright/test`    | `>=1.44`  | Mobile screenshot regression test at 375 px viewport; CI-integrated           |

---

## Implementation Details

### Modules / Files

| File                                         | Action | Description                                                                                  |
| -------------------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| `the-codex/tailwind.config.js`                     | Create | JIT config: Roman palette tokens, project-only content paths (`theme/`, `pages/`, `rehype/`), `@layer base` overrides |
| `the-codex/postcss.config.js`                      | Create | PostCSS config enabling Tailwind and Autoprefixer                                                                      |
| `the-codex/styles/globals.css`                     | Modify | Add `@tailwind base/components/utilities`; define Roman CSS custom properties                                          |
| `the-codex/theme/index.tsx`                        | Modify | Replace stub with full `Layout` component wrapping Nextra's content slot                                               |
| `the-codex/theme/config.tsx`                       | Modify | Add Lucide icon injections, `search.component` pointing to `Search`, and other override slots                          |
| `the-codex/theme/components/Search.tsx`            | Create | Custom FlexSearch component: fetches `nextra-data-${locale}.json`, builds Document index with title-boosting, renders results |
| `the-codex/theme/components/Navbar.tsx`            | Create | Roman navbar: logo, nav links, search trigger; all icons via `lucide-react`                                            |
| `the-codex/theme/components/Sidebar.tsx`           | Create | Roman sidebar: collapsible navigation tree; chevron icons via `lucide-react`                                           |
| `the-codex/theme/components/Footer.tsx`            | Create | Roman footer: copyright, repo link                                                                                     |
| `the-codex/theme/components/CodeBlock.tsx`         | Create | Roman-styled syntax-highlighted code block with copy button via `lucide-react`                                         |
| `the-codex/rehype/katexOverflow.ts`                | Create | Rehype plugin: wraps every `.katex-display` element in `<div class="overflow-x-auto">`                                |
| `the-codex/next.config.mjs`                        | Modify | Add `katexOverflow` to `rehypePlugins` after `rehype-katex`                                                            |
| `the-codex/tests/mobile-screenshot.spec.ts`        | Create | Playwright: navigate to Black-Scholes page at 375 px, assert no horizontal scroll                                     |
| `the-codex/tests/snapshots/` (Linux-generated)     | Create | Playwright baseline screenshots committed from CI Ubuntu runner; never regenerated on macOS                            |
| `.github/workflows/ci.yml`                         | Modify | Add `playwright install --with-deps` + screenshot test step; add one-time `update-snapshots` job                       |

---

### Key Functions

```tsx
// the-codex/rehype/katexOverflow.ts
export default function katexOverflow(): (tree: Root) => void
// Unified/rehype plugin that wraps every `.katex-display` div produced by
// rehype-katex in a scroll-container div.
//
// Returns:
//   A rehype transformer function. Mutates the hast tree in place; no return value.
//
// How it works:
//   Visits every `element` node where node.properties.className includes
//   'katex-display', wraps it in a new <div class="overflow-x-auto"> parent,
//   and splices the wrapper into the parent's children array.
```

```tsx
// the-codex/theme/index.tsx
export default function Layout({ children, pageOpts, themeConfig }: NextraThemeLayoutProps): JSX.Element
// Root layout component for the custom Nextra theme.
//
// Renders the full page shell: Navbar at the top, Sidebar on the left,
// main content area (children) in the center, and Footer at the bottom.
// All Roman palette classes are applied here via Tailwind utilities.
//
// Args:
//   children: The compiled MDX page content passed by Nextra.
//   pageOpts: Nextra page metadata (title, frontmatter, headings, etc.).
//   themeConfig: The resolved DocsThemeConfig from theme/config.tsx.
//
// Returns:
//   A fully rendered page shell with Roman aesthetic applied.
```

```tsx
// the-codex/theme/components/Search.tsx
export function Search({ className, directories }: { className?: string; directories: Item[] }): JSX.Element
// Custom search component injected via DocsThemeConfig.search.component.
//
// On first keystroke: fetches /_next/static/chunks/nextra-data-${locale}.json
// (same endpoint as Nextra's built-in search), builds two FlexSearch.Document
// indexes — pageIndex and sectionIndex — with a `boost` function that returns
// 2 for the title field and 1 for content, prioritising h1/h2 headings.
// Subsequent searches reuse cached indexes.
//
// FlexSearch is already bundled by nextra-theme-docs; import it directly:
//   import FlexSearch from 'flexsearch'  (no entry in package.json needed)
//
// Args:
//   className: Optional CSS class forwarded to the search container div.
//   directories: Flat directory list from Nextra, used to resolve page titles
//                for results that lack a stored title in the index.
//
// Returns:
//   A controlled input with a dropdown results list rendered in Roman palette
//   Tailwind classes. Keyboard navigation (ArrowUp/Down, Enter, Escape) mirrors
//   the behaviour of Nextra's built-in Flexsearch component.
```

---

### CLI Parameters

Not applicable — this task delivers a Next.js theme module and rehype plugin, not a CLI tool.

---

### Data Models / Schemas

```ts
// Roman color palette tokens (tailwind.config.js extend.colors)
interface RomanPalette {
  obsidian: string      // '#1A1A2E' — page background
  parchment: string     // '#F5F0E8' — primary text / article background
  terracotta: string    // '#C0553A' — accent / active nav item
  gold: string          // '#B8860B' — headings / hover states
  stone: string         // '#8B8680' — muted text / sidebar borders
}

// Custom FlexSearch index options used inside Search.tsx.
// nextra-theme-docs hardcodes its own index; these options are used
// only in the custom Search component's local FlexSearch.Document calls.
// FlexSearch is imported from 'flexsearch' (bundled by nextra-theme-docs —
// no separate install needed).
interface CustomIndexOptions {
  cache: number               // 100 — matches Nextra default
  tokenize: 'full'            // substring match for partial financial terms
  document: {
    id: string
    index: Array<{
      field: string
      boost?: (doc: Record<string, string>, value: string) => number
    }>
    store: string[]
  }
  context: {
    resolution: number        // 9 — maximum ranking precision
    depth: number             // 2
    bidirectional: boolean    // true
  }
}
```

---

### Testing Strategy

**Visual regression (Playwright)** (`the-codex/tests/mobile-screenshot.spec.ts`):

- Viewport: 375 × 812 px (iPhone SE baseline)
- Navigate to `/finance/black-scholes` (the sample article with block LaTeX)
- Assert `document.documentElement.scrollWidth === document.documentElement.clientWidth` — confirms no horizontal overflow
- Assert no element with class `nextra-` is visible without a Tailwind override applied (check via `getComputedStyle`)
- Capture baseline screenshot; subsequent CI runs compare with `expect(page).toHaveScreenshot()` within a 0.1% pixel-diff threshold

**Manual integration checklist** (run against `docker-compose up` before PR merge):

- [ ] Open `/finance/black-scholes` at 375 px, 768 px, and 1280 px — no horizontal LaTeX overflow at any breakpoint
- [ ] Type "Black-Scholes" in search — results appear in under 200 ms (Chrome DevTools Network → no search XHR; measured via `performance.now()` in console)
- [ ] Inspect every page surface for any element using a Nextra base style not overridden by Tailwind (`grep -r "nx-" .next/` should return zero matches)
- [ ] Run `lhci autorun` against the production build — Performance score ≥ 90
- [ ] Confirm all icon slots show Lucide icons (no SVG from Nextra's bundled icon set remains)

**Edge cases:**

- Very long formula (> 100 chars) on a 320 px viewport → must scroll horizontally within the `overflow-x-auto` container without pushing page layout
- Search query with a stopword only (e.g., "the") → must return zero results gracefully, not throw
- `tailwind.config.js` content path missing Nextra output → utility classes purged in production build → catches misconfig in CI via Lighthouse score drop

---

### Open Questions / Risks

- [x] **Nextra v2 search API surface — RESOLVED:** The `search` key in `DocsThemeConfig` is validated by a strict Zod schema (`index.d.mts`) and only accepts UI-layer props (`component`, `emptyResult`, `error`, `loading`, `placeholder`). **FlexSearch index options are not exposed** — the full index configuration is hardcoded inside `nextra-theme-docs/dist/index.js` in the `loadIndexesImpl()` closure. The existing hardcoded config already uses `tokenize: "full"`, `resolution: 9`, `depth: 2`, bidirectional context — no further tuning is reachable without forking. **Required change to spec:** Replace the "FlexSearch configuration" deliverable with a custom search component injected via `search.component` in `DocsThemeConfig`. The component receives `directories: Item[]` and `className?: string` and must: (1) fetch `/_next/static/chunks/nextra-data-${locale}.json` directly, (2) initialize a `FlexSearch.Document` with a custom `document.index` `boost` function giving `title` fields a 2× weight, (3) implement the search UX. The `FlexSearch` package is already bundled by Nextra — import it as `import FlexSearch from 'flexsearch'` without adding it to `package.json`.
- [x] **Tailwind + Nextra class purging — RESOLVED:** The concern was unfounded. Nextra's own class names use the `nx-` prefix and are **not** Tailwind utility classes — scanning Nextra's `node_modules` would be useless and wasteful. The correct `tailwind.config.js` content paths are only the project's own source files: `./theme/**/*.{js,ts,jsx,tsx}`, `./pages/**/*.{js,ts,jsx,tsx,mdx}`, and `./rehype/**/*.{js,ts}`. No Nextra node_modules path is needed, so there is zero impact on Tailwind scan time.
- [x] **Playwright CI flakiness on screenshot diffs — RESOLVED:** Playwright's canonical solution for cross-platform rendering differences is to generate and commit baseline snapshots on the CI runtime (Linux), never on macOS. Steps: (1) Add a one-time `update-snapshots` CI job that runs `playwright test --update-snapshots` on Ubuntu and commits the resulting `*.png` files to `the-codex/tests/snapshots/`. (2) All subsequent CI runs compare against those Linux-generated baselines. (3) Set `maxDiffPixelRatio: 0.02` in `playwright.config.ts` as a permissive tolerance for sub-pixel anti-aliasing differences. macOS dev runs will show expected diff warnings — this is acceptable and explicitly documented in the test README.
