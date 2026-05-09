# [RFC] The Codex: Integrated Financial Documentation & Wiki — Aerarium Saturni

| Author              | Simone Porreca                                                          |
| :------------------ | :---------------------------------------------------------------------- |
| **Project**         | Aerarium Saturni                                                        |
| **RFC status**      | Draft                                                                   |
| **Review deadline** | 2026-06-21                                                              |
| **GitHub repo**     | [Volscente/aerarium-saturni](https://github.com/Volscente/aerarium-saturni) |

### Timeline

| Date       | Status | Note |
| :--------- | :----- | :--- |
| 2026-05-09 | Draft  |      |

### Table of contents

[Motivation](#motivation)

[Objectives](#objectives)

[Scope](#scope)

[The Codex: Integrated Financial Documentation & Wiki](#the-codex)

[Tech Stack](#tech-stack)

[Effort Estimations](#effort-estimations)

[FAQs](#faqs)

[Risks & Open Questions](#risks--open-questions)

[References](#references)

---

## Motivation {#motivation}

The Aerarium Saturni platform lacks a centralized, authoritative source for financial theory and platform-specific logic. Financial documentation requires high-precision mathematical rendering — Greeks, yield curves, derivatives pricing — that standard CMS or Markdown editors cannot handle without significant formatting breakage, and the current absence of such a resource leaves a persistent gap between the platform's analytical tools and the user's understanding of the underlying financial mechanics.

## Objectives {#objectives}

- **Build a production-ready MDX documentation site**: Deliver a Nextra-powered documentation platform where financial analysts can author articles in MDX with full component and LaTeX formula support.
- **Enable pixel-perfect KaTeX rendering**: Integrate `remark-math` and `rehype-katex` so all mathematical formulas render via KaTeX with zero overflow or clipping on any viewport size.
- **Implement a bespoke Roman-aesthetic theme**: Fully override Nextra's default styling using the Aerarium Saturni color palette, Tailwind CSS, and Lucide React icons — leaving no generic Nextra UI visible.
- **Deliver sub-200ms search**: Configure FlexSearch with header-prioritized indexing so that financial terms return results in under 200 ms without any backend dependency.
- **Containerize for one-command deployment**: Package the documentation service in Docker Compose behind Nginx, supporting both subdomain (`docs.aerariumsaturni.com`) and path-based (`/wiki`) routing.

## Scope {#scope}

**In-Scope:**

- Full MDX support for financial articles
- LaTeX rendering for complex mathematical formulas
- Roman-inspired custom UI/UX theme
- Optimized header-based search indexing
- Containerized deployment via Docker Compose

**Out-of-Scope:**

- **User Authentication**: The Codex is public-facing/read-only for now
- **Real-time market data**: Restricted to static/calculated examples

**Constraints:**

- The Lighthouse performance score must remain above 90 at all times.
- No standard Nextra styling may be visible; the site must feel like a bespoke part of Aerarium Saturni.
- Documentation builds must complete in under 3 minutes, even as the MDX content library grows.

---

# **The Codex: Integrated Financial Documentation & Wiki** {#the-codex}

## Approach Overview {#approach-overview}

The Codex is built as an independent Next.js application powered by Nextra, deployed as a sub-service alongside the main Aerarium Saturni platform. The architecture follows a "Documentation-as-Code" model: financial articles are authored as `.mdx` files within a structured content directory, processed at build time by a remark/rehype plugin pipeline (`remark-math` → `rehype-katex`), and statically generated into a highly optimized site. Nextra's bundled FlexSearch provides client-side, header-prioritized search without any external backend service, satisfying both the sub-200ms latency criterion and the Lighthouse performance constraint.

The custom theme is implemented as a dedicated configuration layer that fully replaces `nextra-theme-docs` defaults. All visual tokens — colors, spacing, typography, icon set — are derived from the Aerarium Saturni design system (Tailwind CSS configuration, Lucide React icon subset), ensuring no visual leakage from Nextra's base styles. Any Nextra base component that cannot be overridden via Tailwind utility classes is replaced by a custom same-name component exported from the theme layer. The proposal's approach direction is adopted in full; this RFC extends it by specifying the theme override strategy and the Nginx deployment topology in detail.

### Integration {#integration}

The Codex runs as a standalone Docker container exposed via an Nginx reverse proxy. Two routing topologies are supported:

- **Subdomain routing** (`docs.aerariumsaturni.com`): Nginx routes all traffic for the subdomain to the Codex container on its internal port. This is the preferred topology — it fully isolates the documentation URL space and avoids `basePath` complications in Next.js/Nextra configuration.
- **Path-based routing** (`/wiki`): Nextra's `basePath` is set to `/wiki`; Nginx proxies `/wiki/*` to the container. This topology requires consistent internal link handling and is treated as a secondary option.

If a shared header/footer with the main application is required in a future phase, the recommended approach is a shared design-token package (Tailwind config + Lucide icon subset) rather than an iframe or server-side include, which would introduce coupling and latency.

## Foundation — Nextra Setup & Docker Deployment {#foundation}

Establishes the runnable skeleton of The Codex:

- Initialise a Next.js project with Nextra and configure `next.config.js` with the `nextra` wrapper pointing to the custom theme entry point.
- Wire the remark/rehype plugin chain: `remark-math` → `rehype-katex`, with KaTeX CSS loaded globally.
- Scaffold the content directory with at least one sample financial article demonstrating inline and block LaTeX.
- Write the `Dockerfile` (multi-stage: builder + runner) and `docker-compose.yml` with Nginx service, health checks, and environment variable injection for both routing topologies.
- Add a CI build-time guard that fails if the build exceeds 3 minutes and a Lighthouse check enforcing performance ≥ 90.

## Roman Theme & Content Polish {#theme-content}

Finalises the visual identity and search tuning:

- Implement the custom Nextra theme: override layout, navbar, sidebar, footer, and code block components with Tailwind CSS classes derived from the Roman color palette.
- Replace all default Nextra icons with Lucide React equivalents; audit every surface for residual Nextra base styles.
- Configure FlexSearch index options (token weighting, stopwords, field priority) to prioritise `h1`/`h2` headings and financial term synonyms, validating against the sub-200ms search latency criterion.
- Add CSS scroll-container wrappers for wide LaTeX blocks (`$$...$$`) to prevent overflow on narrow viewports.
- Run end-to-end validation against all four success criteria before the review deadline.

## Tech Stack {#tech-stack}

- **Next.js**: Application framework underlying Nextra; provides static generation, image optimisation, and the `basePath` configuration needed for path-based deployment.
- **Nextra**: Documentation framework built on Next.js; handles MDX compilation, sidebar/navbar generation, and FlexSearch integration — the core engine of The Codex. Chosen over Docusaurus or GitBook to stay within the existing Next.js ecosystem and reuse Tailwind/Lucide tooling.
- **Tailwind CSS**: Utility-first CSS framework used to implement the Roman-aesthetic theme; its JIT compiler keeps the CSS bundle minimal, directly supporting the Lighthouse performance constraint.
- **Lucide React**: Lightweight, tree-shakeable icon library that replaces all Nextra default icons and maintains visual cohesion with the Aerarium Saturni brand.
- **Docker**: Containerisation runtime; a multi-stage Dockerfile ensures the production image contains only built static assets and the Node.js runner, keeping image size small.
- **Nginx**: Reverse proxy that terminates TLS and routes traffic to the Codex container, supporting both subdomain and path-based topologies without modifying application code.

**Desired / experimental:**

- **remark-math & rehype-katex**: Unified pipeline plugins that parse `$...$` and `$$...$$` delimiters in MDX and render them via KaTeX at build time. KaTeX is preferred over MathJax for its rendering speed and minimal Lighthouse impact. Enables expressions such as the Black-Scholes formula: $$C = S_0 N(d_1) - K e^{-rT} N(d_2)$$.
- **FlexSearch** (via Nextra): Client-side full-text search with header-prioritized indexing and zero-backend footprint. The open question is whether the index size will remain manageable as content scales — see Risks.

## Effort Estimations {#effort-estimations}

Total estimated effort: **{N} sessions**.

| Milestone                         | Description                                                                           | Est. effort | GitHub Issue |
| :-------------------------------- | :------------------------------------------------------------------------------------ | :---------- | :----------- |
| M1 — Foundation & Deployment      | Nextra scaffold, LaTeX pipeline, Docker Compose + Nginx, CI build/Lighthouse guards   | {N}         | #{issue}     |
| M2 — Roman Theme & Search Polish  | Custom theme override, FlexSearch tuning, mobile LaTeX scroll containers, QA pass     | {N}         | #{issue}     |

### Recommended Order

1. M1 — Foundation & Deployment (unblocks all content and theme work; validates build and deployment pipeline early)
2. M2 — Roman Theme & Search Polish (depends on a running M1 environment for visual and performance QA)

---

# **FAQs** {#faqs}

**Q: Why Nextra instead of Docusaurus or GitBook?**

A: Nextra is built on Next.js, which is already the framework for Aerarium Saturni. Sharing the same runtime avoids introducing a second framework ecosystem, simplifies the Docker image strategy, and allows direct reuse of the Tailwind CSS configuration and Lucide React icon set. Docusaurus adds a separate webpack pipeline; GitBook is SaaS and cannot host a fully custom theme. Both introduce more friction for the LaTeX pipeline and Roman theme override than Nextra's extension model does.

**Q: Why client-side FlexSearch instead of a server-side search backend?**

A: A server-side backend (e.g., Algolia, Meilisearch) would add an external runtime dependency, operational cost, and potential cold-start latency. At the current scale of The Codex, FlexSearch's in-browser index satisfies the sub-200ms criterion with zero backend overhead. If the index eventually grows beyond a manageable transfer size, migrating to a server-side solution is identified as an explicit future concern (see Risks).

**Q: How will the Roman aesthetic be enforced without Nextra base styles leaking through?**

A: The Tailwind configuration will scan Nextra's output paths and use `@layer base` overrides for all Nextra CSS custom properties. Any Nextra component that cannot be fully overridden via Tailwind will be shadowed by a custom same-name component from the theme layer. A visual regression screenshot test will be added to CI to catch base-style regressions before they reach production.

**Q: Can LaTeX formulas be authored safely in MDX without JSX escaping issues?**

A: Yes. `remark-math` intercepts `$...$` and `$$...$$` delimiters before the MDX compiler processes the content, so LaTeX is never parsed as JSX. Authors must escape `{` and `}` as `\{` and `\}` within formula blocks — standard KaTeX practice. A custom remark lint rule can be added to catch unescaped braces during the build.

**Q: Terminology?**

A:

- **MDX** → Markdown + JSX: a format that embeds React components in Markdown, enabling interactive documentation pages.
- **KaTeX** → A fast client/server-side LaTeX renderer for the web, used here via the `rehype-katex` plugin.
- **FlexSearch** → A lightweight, high-performance client-side full-text search library bundled with Nextra.
- **Nextra** → A Next.js-based documentation framework providing MDX compilation, navigation scaffolding, and search.

---

## Risks & Open Questions {#risks--open-questions}

| Risk / Question                                                                                                           | Likelihood | Mitigation / Answer                                                                                                                                    |
| :------------------------------------------------------------------------------------------------------------------------ | :--------- | :----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Client-side search index bloat**: As the Wiki grows, the FlexSearch index may become too large to load efficiently      | Medium     | Monitor index size per build. If it exceeds ~2 MB transfer, migrate to a server-side search solution (e.g., Meilisearch) as a future phase.            |
| **LaTeX overflow on narrow screens**: Long formulas may break the Roman-style layout on mobile viewports                  | Medium     | Wrap all block LaTeX in CSS scroll-container divs; add mobile-viewport screenshot tests to CI to catch regressions automatically.                      |
| **Nextra major version breaking changes**: Nextra is actively developed; a major version bump could break the custom theme | Low        | Pin Nextra to a minor version range in `package.json`; review the Nextra changelog as part of each dependency update cycle before upgrading.           |
| **Nginx path-based routing complexity**: Serving at `/wiki` requires consistent `basePath` in all internal links and assets | Low–Medium | Prefer subdomain routing as the primary deployment topology; validate path-based routing in a staging environment before enabling it in production.     |

## References {#references}

- [Nextra Documentation](https://nextra.site)
- [remark-math](https://github.com/remarkjs/remark-math)
- [rehype-katex](https://github.com/remarkjs/remark-math/tree/main/packages/rehype-katex)
- [KaTeX](https://katex.org)
- [FlexSearch](https://github.com/nextapps-de/flexsearch)
