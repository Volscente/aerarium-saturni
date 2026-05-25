# Multi-Pillar Architecture: Introducing Tabularium and Welcome Layout — High-Level Planning

**Project:** Aerarium Saturni
**GitHub repo:** [Volscente/aerarium-saturni](https://github.com/Volscente/aerarium-saturni)
**GitHub Milestone:** [4-the-tabularium](https://github.com/Volscente/aerarium-saturni/milestone/2)
**Notion page:** [4 — The Tabularium](https://www.notion.so/4-The-Tabularium-3685cc6c0f078031b25bfeb9085d7a2b)
**Total estimated effort:** 2.0 FTE-days (1 FTE = 1 day)

---

## Overview

This initiative refactors the Aerarium Saturni platform from a single-purpose financial wiki into a three-pillar navigation system (Home, Codex, Tabularium) by migrating the content tree from a flat `pages/` layout to a hierarchical `content/` structure driven by Nextra 4's native top-level tab layout. The existing wiki is relocated under a dedicated `/codex/**` URL namespace, two new sidebar-free global shells are introduced at `/` and `/tabularium`, and a root `_meta.js` file binds the three pillars into a persistent top navigation bar. CI coverage (Lighthouse, Playwright visual regression) is extended to cover all three routes.

### Dependency Order

```txt
TASK-1 ──► TASK-2 ──► TASK-3
```

TASK-1 establishes the routing contract that TASK-2 and TASK-3 depend on. TASK-2 must precede TASK-3 because the Tabularium layout inherits the aesthetic established on the Home page.

---

## TASK-1 — Root Structural Tree Layout Rearrangement and Universal Page Meta Mapping

**GitHub Issue:** #{issue}
**Effort estimate:** 1.0 FTE-days

### Scope

Migrate the content directory from the current flat `pages/` structure to a hierarchical `content/` layout. Introduce stub MDX files for Home and Tabularium at the root level, relocate all existing wiki content under `content/codex/`, author the root `_meta.js` with per-page theme overrides, and update all integration touchpoints: cross-links in MDX files, Playwright test URL fixtures, and the Lighthouse CI config.

### Goal

Establish the validated routing contract and navigation structure so that the build compiles cleanly, CI passes (no Lighthouse regressions, no broken cross-links), and the global top navigation bar renders correctly before any page content is populated.

### Deliverables

- `content/_meta.js` — root navigation config; entries: `index` (Home), `tabularium`, `codex`; `index` and `tabularium` entries carry `theme: { sidebar: false, toc: false }`
- `content/index.mdx` — Home stub (empty body, correct frontmatter)
- `content/tabularium.mdx` — Tabularium stub (empty body, correct frontmatter)
- `content/codex/_meta.js` — Codex subtree navigation preserving existing structure
- `content/codex/finance/black-scholes.mdx` — relocated from `pages/finance/`
- `.lighthouserc.js` — extended with assertion targets for `/`, `/tabularium`, and `/codex/finance/black-scholes`
- Playwright test fixtures — URL strings updated from `/finance/**` to `/codex/finance/**`

### Technical Overview

The migration pivots on Nextra 4's file-system routing: top-level entries in `content/` map directly to URL segments. The root `_meta.js` must declare `index`, `tabularium`, and `codex` as its three keys. `index` and `tabularium` receive `theme: { sidebar: false, toc: false }` to suppress all wiki chrome; `codex` inherits the standard documentation layout. If the `_meta.js` theme API does not suppress the panels as documented for the pinned Nextra version, the fallback is a minimal custom layout component using Next.js's `getLayout` pattern. All MDX files must be audited for absolute hrefs beginning with `/finance/` and rewritten to `/codex/finance/`. A FlexSearch smoke test after the clean build confirms that search result hrefs resolve under `/codex/**`. The Dockerfile and Nginx configs require no changes.

---

## TASK-2 — Home Welcome Area Layout Deployment

**GitHub Issue:** #{issue}
**Effort estimate:** 0.5 FTE-days

### Scope

Populate `content/index.mdx` with a fully styled, centered welcome composition. Apply the repository's Tailwind palette primitives and add Lucide React icons as decorative anchors where appropriate. Capture Playwright baseline screenshots for `/` and run Lighthouse CI to confirm a score ≥ 90.

### Goal

Deliver a production-ready Home page at `/` that presents a clean, sidebar-free entry point consistent with the platform's Roman aesthetic — establishing the visual language that the Tabularium page (TASK-3) will follow.

### Deliverables

- `content/index.mdx` — populated welcome layout using Tailwind tokens (`obsidian`, `parchment`, `terracotta`, `gold`, `stone`) and Lucide React icon anchors
- Playwright baseline screenshots for `/`
- Lighthouse CI assertion passing for `/` (score ≥ 90)

### Technical Overview

The page renders as a raw, full-width surface because the `_meta.js` theme override from TASK-1 suppresses the sidebar and ToC. Styling is exclusively via Tailwind utility classes using the custom design tokens registered in `globals.css`. Lucide React icons are imported individually to exploit tree-shaking and keep the bundle footprint zero-overhead. No sidebar, navbar secondary items, or documentation chrome should appear. Lighthouse is run locally and via `lhci autorun` to validate the performance constraint.

---

## TASK-3 — Tabularium Section View Initialization

**GitHub Issue:** #{issue}
**Effort estimate:** 0.5 FTE-days

### Scope

Populate `content/tabularium.mdx` with the section title "Tabularium" in a typographically deliberate, centered layout that matches the visual language established in TASK-2. Extend Lighthouse CI to assert against `/tabularium` and capture Playwright baselines for the route.

### Goal

Establish the visual contract and routing slot for the Tabularium pillar, confirming that `/tabularium` serves a sidebar-free placeholder page consistent with the Home aesthetic and that CI coverage extends to the new route.

### Deliverables

- `content/tabularium.mdx` — populated with centered "Tabularium" section title, styled consistently with `content/index.mdx`
- `.lighthouserc.js` — assertion for `/tabularium` active (may already be added in TASK-1; verified and confirmed here)
- Playwright baseline screenshots for `/tabularium`
- Lighthouse CI assertion passing for `/tabularium` (score ≥ 90)

### Technical Overview

Like the Home page, Tabularium renders as a raw full-width surface via the `_meta.js` theme override from TASK-1. No functional portfolio management content is added; this task solely validates the layout contract. The Tailwind tokens and typographic scale from TASK-2 are reused directly. Playwright baselines are captured after confirming the layout is stable to avoid false-positive diffs on subsequent CI runs.

---

## GitHub Issues

### Milestone 1 — Root Structural Tree Layout Rearrangement and Universal Page Meta Mapping

**Tasks:** TASK-1
**Effort:** 1.0 FTE-days

#### Scope

Restructure the content directory, author all navigation metadata, relocate existing wiki content, and update every integration touchpoint (cross-links, Playwright fixtures, Lighthouse CI config) so the build is clean and the global top navigation bar renders correctly.

#### Goal

A validated, compilable multi-pillar routing contract: the top navigation bar displays Home, Codex, and Tabularium with active route highlighting; the Codex articles are accessible under `/codex/**`; no broken links exist; and the CI suite passes without regressions.

#### Deliverables

- `content/_meta.js` with global nav entries and per-page theme overrides
- `content/index.mdx` and `content/tabularium.mdx` (stubs)
- `content/codex/` subtree with relocated wiki content and `_meta.js`
- Updated `.lighthouserc.js` covering all three routes
- Updated Playwright test URL fixtures
- Clean build with passing CI (Lighthouse ≥ 90, build ≤ 3 min, FlexSearch smoke test green)

---

### Milestone 2 — Home Welcome Area Layout Deployment

**Tasks:** TASK-2
**Effort:** 0.5 FTE-days

#### Scope

Deliver the styled Home page at `/` using Tailwind palette primitives and Lucide React icon anchors, with Playwright baselines captured and Lighthouse CI passing.

#### Goal

A production-ready, sidebar-free Home page that establishes the platform's entry-point aesthetic and passes all performance and visual regression gates.

#### Deliverables

- Populated `content/index.mdx` with Tailwind-styled welcome layout
- Lucide React icon anchors integrated where applicable
- Playwright baseline screenshots for `/`
- Lighthouse CI passing for `/` (score ≥ 90)

---

### Milestone 3 — Tabularium Section View Initialization

**Tasks:** TASK-3
**Effort:** 0.5 FTE-days

#### Scope

Deliver the styled Tabularium placeholder at `/tabularium`, consistent with the Home aesthetic, with Playwright baselines captured and Lighthouse CI coverage extended to the route.

#### Goal

A validated Tabularium routing slot: `/tabularium` serves a sidebar-free page displaying the section title, CI covers the route, and the visual regression baseline is captured — establishing the layout contract for the future portfolio management layer.

#### Deliverables

- Populated `content/tabularium.mdx` with centered "Tabularium" section title
- Playwright baseline screenshots for `/tabularium`
- Lighthouse CI assertion active and passing for `/tabularium` (score ≥ 90)
