# The Codex — High-Level Planning

**Project:** Aerarium Saturni
**GitHub repo:** [Volscente/aerarium-saturni](https://github.com/Volscente/aerarium-saturni)
**Total estimated effort:** 4 FTE-days (1 FTE = 1 day)

---

## Overview

The Codex is a standalone Nextra/Next.js documentation service that gives Aerarium Saturni a centralized, authoritative wiki for financial theory and platform-specific logic. It introduces a full MDX authoring pipeline with KaTeX LaTeX rendering, a bespoke Roman-aesthetic theme built on the existing Tailwind CSS and Lucide React stack, client-side FlexSearch with header-prioritized indexing, and a Docker Compose + Nginx deployment layer that supports both subdomain and path-based routing topologies.

### Dependency Order

```txt
TASK-1 ──► TASK-2
```

---

## TASK-1 — Foundation & Deployment

**GitHub Issue:** [Foundation & Deployment](https://github.com/Volscente/aerarium-saturni/issues/2)
**Effort estimate:** 2 FTE-days

### Scope

Bootstrap the runnable Nextra application skeleton, wire the remark/rehype LaTeX plugin chain, scaffold the content directory with a sample financial article, and containerize the service with Docker Compose and Nginx. Add CI guards enforcing both the 3-minute build ceiling and Lighthouse performance ≥ 90.

### Goal

Deliver a deployed, containerized Nextra site that correctly renders LaTeX via KaTeX and passes all CI quality gates — providing the stable foundation on which TASK-2 theme and search work can be built and visually validated.

### Deliverables

- `next.config.js` — Nextra wrapper configured with the custom theme entry point
- `pages/_meta.json` + content directory — structured MDX content tree with at least one sample financial article demonstrating inline (`$...$`) and block (`$$...$$`) LaTeX
- `remark-math` + `rehype-katex` plugin chain — LaTeX parse-and-render pipeline; KaTeX CSS loaded globally
- `Dockerfile` — multi-stage build (builder stage produces static assets; runner stage is minimal Node.js image)
- `docker-compose.yml` — Codex container + Nginx service with health checks, TLS termination, and environment variable injection for subdomain and path-based topologies
- CI configuration — build-time guard failing on > 3 minutes; Lighthouse CI step enforcing performance score ≥ 90

### Technical Overview

The Next.js project is initialized with Nextra's `nextra` wrapper in `next.config.js`, pointing to a custom theme entry file. The remark/rehype pipeline is declared in the Nextra plugin options: `remark-math` intercepts LaTeX delimiters before MDX compilation, and `rehype-katex` renders them server-side at build time. KaTeX CSS is imported globally in `_app.tsx` (or equivalent). The Dockerfile uses a multi-stage pattern: `node:alpine` builder runs `next build`, the runner stage copies only `.next/standalone` and `public/`. Docker Compose declares two services (`codex` on an internal port, `nginx`) with a `depends_on` health check. Nginx config ships two `server` block templates — one for subdomain routing (preferred) and one for `basePath=/wiki` path-based routing. CI adds a `timeout-minutes: 3` guard on the build step and a `lhci autorun` step against the production-build output.

---

## TASK-2 — Roman Theme & Search Polish

**GitHub Issue:** [Roman Theme & Search Polish](https://github.com/Volscente/aerarium-saturni/issues/3)
**Effort estimate:** 2 FTE-days

### Scope

Implement the full Roman-aesthetic Nextra theme override (layout, navbar, sidebar, footer, code blocks), replace all Nextra default icons with Lucide React equivalents, tune FlexSearch for header-prioritized financial-term indexing, add CSS scroll containers for wide LaTeX blocks on narrow viewports, and run end-to-end validation against all four success criteria before the review deadline.

### Goal

Deliver a visually complete Codex site where no Nextra base styling is visible, search returns financial terms in under 200 ms, and LaTeX formulas render without overflow on any viewport — fully satisfying the RFC's four objectives and Lighthouse ≥ 90 constraint.

### Deliverables

- Custom Nextra theme module — overridden `Layout`, `Navbar`, `Sidebar`, `Footer`, and `CodeBlock` components styled exclusively with Aerarium Saturni's Tailwind CSS Roman color palette
- `tailwind.config.js` update — content paths extended to cover Nextra output; `@layer base` overrides for all Nextra CSS custom properties
- Lucide React icon replacements — every default Nextra icon swapped; audit log confirming zero residual Nextra icons
- FlexSearch configuration — token weighting, stopword list, and field priority boosting `h1`/`h2` headings and financial term synonyms, validated against sub-200 ms latency
- CSS scroll-container wrappers — applied to all `$$...$$` block LaTeX elements; mobile-viewport screenshot test added to CI
- QA report — end-to-end validation confirming: KaTeX rendering correctness, Lighthouse score ≥ 90, search latency < 200 ms, zero visible Nextra base styles

### Technical Overview

The Nextra custom theme is a Next.js module that exports a default `Layout` component and a `useTheme`-compatible config object. Tailwind's JIT compiler scans Nextra's `node_modules` output paths so utility classes applied to overriding components are not purged. Any Nextra component that resists Tailwind override is shadowed by a same-name custom component re-exported from the theme index. FlexSearch options are set in the Nextra config's `search` key: `tokenize: "full"`, custom `stopwords`, and a `fields` priority map giving `h1`/`h2` a 2× relevance weight. Block LaTeX overflow is resolved by wrapping `rehype-katex` output in a `<div class="overflow-x-auto">` container via a custom rehype plugin inserted after `rehype-katex` in the pipeline. The Lighthouse CI step and a Playwright screenshot comparison test (mobile 375 px viewport) are added to the CI matrix to prevent regressions.

---

## GitHub Issues

### Milestone 1 — Foundation & Deployment

**Tasks:** TASK-1
**Effort:** 2 FTE-days

#### Scope

Bootstrap the Next.js/Nextra application with a working LaTeX pipeline, a scaffolded content directory, and a fully containerized Docker Compose + Nginx deployment. Establish CI quality gates for build time and Lighthouse performance.

#### Goal

A deployed, CI-gated Nextra instance that renders KaTeX formulas correctly and serves traffic via Nginx in both subdomain and path-based routing topologies — unblocking all downstream theme and search work.

#### Deliverables

- Nextra project scaffold with `next.config.js` and custom theme entry point
- `remark-math` + `rehype-katex` plugin chain with global KaTeX CSS
- Sample financial MDX article demonstrating inline and block LaTeX
- Multi-stage `Dockerfile` and `docker-compose.yml` with Nginx and health checks
- CI build-time guard (3-minute ceiling) and Lighthouse CI step (score ≥ 90)

---

### Milestone 2 — Roman Theme & Search Polish

**Tasks:** TASK-2
**Effort:** 2 FTE-days

#### Scope

Implement and validate the full Roman-aesthetic Nextra theme override, replace all Nextra icons with Lucide React equivalents, tune FlexSearch for financial-term retrieval, resolve LaTeX overflow on narrow viewports, and complete end-to-end QA against all success criteria.

#### Goal

A visually complete, performant Codex site with no visible Nextra base styles, sub-200 ms search, mobile-safe LaTeX rendering, and a passing Lighthouse score — ready for the review deadline of 2026-06-21.

#### Deliverables

- Custom Nextra theme module (Layout, Navbar, Sidebar, Footer, CodeBlock) using Roman color palette
- Tailwind configuration extended with Nextra output paths and `@layer base` overrides
- Lucide React icon replacements audited across all UI surfaces
- FlexSearch tuned with header priority weighting and financial term synonyms
- CSS scroll-container wrappers for block LaTeX; mobile screenshot regression test in CI
- End-to-end QA report confirming all four RFC success criteria
