# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
