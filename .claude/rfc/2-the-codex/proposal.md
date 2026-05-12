---
title: "The Codex: Integrated Financial Documentation & Wiki"
project: "Aerarium Saturni"
author: "Simone Porreca"
deadline: "2026-06-21"
github-repo: "https://github.com/Volscente/aerarium-saturni"
tech-stack:
  - "Next.js"
  - "Nextra"
  - "Tailwind CSS"
  - "Lucide React"
  - "Docker"
  - "Nginx"
scope-in:
  - "Full MDX support for financial articles"
  - "LaTeX rendering for complex mathematical formulas"
  - "Roman-inspired custom UI/UX theme"
  - "Optimized header-based search indexing"
  - "Containerized deployment via Docker Compose"
scope-out:
  - "User Authentication: The Codex is public-facing/read-only for now"
  - "Real-time market data: Restricted to static/calculated examples"
milestones:
  - ""
context-paths:
  - ""
---

## Problem

The Aerarium Saturni platform lacks a centralized, authoritative source for financial theory and platform-specific logic. Financial documentation requires high-precision mathematical rendering (Greeks, yield curves, derivatives pricing) that standard CMS or Markdown editors cannot handle without significant formatting breakage. Currently, there is a gap between the platform's tools and the user's understanding of the underlying financial mechanics.

## Approach direction

Leverage **Nextra** as the engine to provide a high-performance, SEO-friendly documentation site. The architecture will use a "Documentation-as-Code" workflow where financial analysts can write in MDX. We will implement a custom theme layer on top of `nextra-theme-docs` to reflect the "Aerarium Saturni" brand identity (Roman aesthetic) and use specialized remark/rehype plugins to ensure LaTeX formulas are treated as first-class citizens.

## Success criteria

- **Rendering Accuracy:** All LaTeX formulas must render via KaTeX with zero overflow issues on mobile.
- **Search Latency:** Search results for key financial terms (e.g., "Collateral") should appear in under 200ms.
- **Design Alignment:** The interface must utilize the specific "Roman" color palette and Lucide icons consistently.
- **DevOps Efficiency:** A single `docker-compose up` command should spin up the entire documentation environment behind an Nginx proxy.

## Constraints

- **Performance:** The lighthouse score for performance must remain above 90.
- **Visual Integrity:** No "standard" Nextra styling should be visible; it must feel like a bespoke part of Aerarium Saturni.
- **Build Time:** Documentation builds must not exceed 3 minutes, even with a growing library of `.mdx` files.

## Desired tech

- **remark-math & rehype-katex:** To enable the rendering of equations such as the Black-Scholes model:
  $$C = S_0 N(d_1) - K e^{-rT} N(d_2)$$
- **FlexSearch:** (Via Nextra) for the heavy lifting of header-prioritized indexing.

## Integration context

The Codex will be deployed as a sub-service. The Nginx configuration must handle the reverse proxying to allow it to sit at either `docs.aerariumsaturni.com` or `/wiki` while maintaining shared header/footer consistency with the main application if possible.

## Known risks / concerns

- **Search Index Size:** As the "Wiki" grows, the client-side search index may become large; we may eventually need to move to a server-side search.
- **LaTeX Complexity:** Extremely long formulas may require custom CSS "scroll-containers" to avoid breaking the Roman-style layout on narrow screens.
