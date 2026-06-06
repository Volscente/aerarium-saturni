# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-06-05

### Fixed

- **Search**: Restored FlexSearch search bar in Codex routes (`/codex/**`). The `<Layout>` component was receiving a custom `navbar` prop that replaced the entire default Nextra navbar — including its embedded `<Search />` component. Fix imports `Search` from `nextra/components` and passes it explicitly as the `search` prop to `<Layout>`, keeping `CustomNavbar` framework-agnostic.

## [0.1.0] - 2026-06-01

### Added

- **Frontend**: New `app/(tabularium)/tabularium/layout.tsx` — Tabularium layout shell with `CustomNavbar` + `CustomFooter`, full-width content area, no Nextra chrome.
- **Frontend**: New `app/(tabularium)/tabularium/page.tsx` — Tabularium landing page using `roman-*` Tailwind tokens.
- **Frontend**: New `app/(tabularium)/tabularium/portfolio/page.tsx` — empty placeholder establishing `/tabularium/portfolio` sub-route.
- **Frontend**: New `app/(tabularium)/tabularium/transactions/page.tsx` — empty placeholder establishing `/tabularium/transactions` sub-route.
- **Frontend**: New `app/[[...slug]]/layout.tsx` — Nextra `<Layout>` wrapper scoped exclusively to Home and Codex catch-all routes.

### Changed

- **Infrastructure**: Renamed workspace directory from `the-codex/` to `frontend/`; all internal paths unchanged.
- **Frontend**: `app/layout.tsx` stripped to minimal shell — `<html>`, `<body>`, `ThemeProvider` (`next-themes`, `defaultTheme=dark`), global CSS; Nextra `<Layout>` moved to `app/[[...slug]]/layout.tsx`.
- **Frontend**: `theme/components/Navbar.tsx` refactored to framework-agnostic `'use client'` component — data-driven `NavLink[]` array (Home, Tabularium, Codex); `usePathname()` prefix-matching active state; Nextra `<Navbar>` wrapper removed; Providentia placeholder commented out for future extension.
- **Frontend**: `content/_meta.js` — `tabularium` entry removed; Nextra page map now drives only Home and Codex tabs.
- **Frontend**: `content/tabularium.mdx` — deleted; removes Nextra's claim on `/tabularium`.
- **Infrastructure**: `justfile` — renamed `codex-rebuild` → `frontend-rebuild`, `codex-dev` → `frontend-dev`; updated all `the-codex/` path references to `frontend/`.

## [0.0.5] - 2026-05-26

### Added

- **The Codex / Content**: `content/index.mdx` — Home page welcome composition; centered layout with `BookOpen` Lucide icon anchor, platform heading ("Aerarium Saturni"), tagline, and Codex / Tabularium pillar icon anchors, styled exclusively with Tailwind `roman-*` tokens.
- **The Codex / Tests**: `tests/mobile-screenshot.spec.ts` — `Home page visual regression` test block capturing `home-mobile.png` fullPage screenshot at 375 px viewport.

## [0.0.4] - 2026-05-25

### Added

- **The Codex / Content**: `content/tabularium.mdx` — Tabularium section stub; sidebar-free, ToC-free placeholder establishing the `/tabularium` routing slot for the future portfolio management pillar.
- **The Codex / Content**: `content/codex/_meta.js` — Codex subtree navigation config mapping the six wiki section directories (fundamentals, instruments, portfolio, personal, infrastructure, library).

### Changed

- **The Codex / Content**: Migrated all wiki section directories from flat `content/` into `content/codex/` — all Codex articles now served under `/codex/**` URL namespace.
- **The Codex / Content**: Updated `content/_meta.js` to three-pillar navigation: `index` (Home), `tabularium`, `codex`; Home and Tabularium entries carry `theme: { sidebar: false, toc: false }` to suppress wiki chrome.
- **The Codex / Content**: Replaced `content/index.mdx` Codex wiki landing with a clean Home stub for TASK-2 styling.
- **The Codex / Infrastructure**: Updated `.lighthouserc.js` from `staticDistDir` to URL-based LHCI collection with `startServerCommand: 'npm run start'`; added explicit assertion targets for `/`, `/tabularium`, and `/codex/fundamentals`.
- **The Codex / Tests**: Updated `tests/mobile-screenshot.spec.ts` URL fixture from stale `/finance/black-scholes` to `/codex/fundamentals/mathematics`; renamed snapshot to `fundamentals-mathematics-mobile.png`.

## [0.0.3] - 2026-05-13

### Added

- **The Codex / Theme**: `theme/components/Navbar.tsx` — Roman-aesthetic navbar with `BookOpen` and `Github` Lucide icons; injected via `DocsThemeConfig.navbar.component`.
- **The Codex / Theme**: `theme/components/Sidebar.tsx` — `SidebarTitle` component with `Folder`, `FileText`, and `ChevronRight` Lucide icons; injected via `DocsThemeConfig.sidebar.titleComponent`.
- **The Codex / Theme**: `theme/components/Footer.tsx` — Roman footer with `Scale` Lucide icon and year auto-fill; injected via `DocsThemeConfig.footer.component`.
- **The Codex / Theme**: `theme/components/CodeBlock.tsx` — Styled `<pre>` wrapper with copy-to-clipboard button using `Copy`/`Check` Lucide icons; injected via `DocsThemeConfig.components.pre`.
- **The Codex / Theme**: `theme/components/Search.tsx` — Custom FlexSearch component fetching `nextra-data-${locale}.json` directly and building a Document index with 2× title-field boost for h1/h2 heading prioritization; injected via `DocsThemeConfig.search.component`. Includes keyboard navigation (ArrowUp/Down, Enter, Escape) and 150 ms debounce.
- **The Codex / Theme**: `theme/index.tsx` — Full `Layout` component wrapping `nextra-theme-docs`'s Layout; applies Roman palette Tailwind classes to the outer page shell.
- **The Codex / Styles**: `tailwind.config.js` — Tailwind JIT config with Roman color palette (`obsidian`, `parchment`, `terracotta`, `gold`, `stone`); content paths cover project source only (`theme/`, `pages/`, `rehype/`).
- **The Codex / Styles**: `postcss.config.js` — PostCSS config enabling Tailwind and Autoprefixer.
- **The Codex / Styles**: Updated `styles/globals.css` — Tailwind directives, Roman CSS custom properties, `@layer base` overrides for Nextra sidebar, navbar, headings, links, and TOC surfaces.
- **The Codex / Rehype**: `rehype/katexOverflow.ts` — Typed rehype plugin that wraps every `.katex-display` div in an `overflow-x-auto` scroll container, preventing LaTeX overflow on narrow viewports. Registered inline in `next.config.mjs` after `rehype-katex`.
- **The Codex / Tests**: `tests/mobile-screenshot.spec.ts` — Playwright tests at 375 × 812 px: no-horizontal-overflow assertion, `overflow-x-auto` wrapper verification for all `.katex-display` elements, and visual snapshot comparison.
- **The Codex / Tests**: `playwright.config.ts` — Playwright config with iPhone SE device, `maxDiffPixelRatio: 0.02` tolerance, and `webServer` for `next start`.
- **Infrastructure**: Updated `.github/workflows/ci.yml` — Added `playwright` job (installs Chromium, runs mobile screenshot tests, uploads HTML report). Added `update-snapshots` workflow-dispatch job for generating Linux baseline screenshots.

### Changed

- **The Codex**: Updated `theme/config.tsx` — Replaced minimal stub config with full `DocsThemeConfig`: Lucide icons for project/chat slots, forced dark mode (`forcedTheme: 'dark'`), `primaryHue: 18` (terracotta), all component override slots wired.
- **The Codex**: Updated `next.config.mjs` — Added `katexOverflow` rehype plugin (inlined from `rehype/katexOverflow.ts`) after `rehype-katex` in the MDX plugin pipeline.
- **The Codex**: Bumped `package.json` version to `0.0.3`; added `tailwindcss`, `autoprefixer`, `postcss`, `@tailwindcss/typography`, `lucide-react`, and `@playwright/test` to devDependencies.

## [0.0.2] - 2026-05-12

### Added

- **The Codex**: New `the-codex/` Next.js/Nextra documentation service providing a centralized financial wiki for Aerarium Saturni.
- **The Codex**: `next.config.mjs` — Nextra wrapper with remark-math → rehype-katex plugin chain; all LaTeX pre-rendered to KaTeX HTML at build time with no client-side JS bundle.
- **The Codex**: MDX content tree with `pages/index.mdx` (landing page) and `pages/finance/black-scholes.mdx` (sample financial article demonstrating inline and block LaTeX).
- **The Codex**: `theme/config.tsx` — Nextra theme configuration; `theme/index.tsx` — custom theme entry point stub for TASK-2 override.
- **The Codex**: `Dockerfile` — multi-stage Docker build (node:20-alpine builder + minimal runner copying `.next/standalone` only).
- **The Codex**: `docker-compose.yml` — service orchestration for `codex` + `nginx` with health-checked `depends_on`.
- **The Codex**: `nginx/subdomain.conf` — Nginx server block for subdomain routing (`docs.aerariumsaturni.com`); `nginx/path-based.conf` — server block for `/wiki` path-based routing.
- **The Codex**: `.lighthouserc.js` — Lighthouse CI assertion enforcing performance score ≥ 0.9.
- **Infrastructure**: `.github/workflows/ci.yml` — CI pipeline with 3-minute build guard (`timeout-minutes: 3`) and `lhci autorun` Lighthouse step.
