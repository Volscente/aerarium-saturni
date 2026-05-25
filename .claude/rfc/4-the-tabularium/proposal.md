---
title: "Multi-Pillar Architecture: Introducing Tabularium and Welcome Layout"
project: "Aerarium Saturni"
author: "Simone Porreca"
deadline: "2026-06-07"
notion-page: "https://www.notion.so/4-The-Tabularium-3685cc6c0f078031b25bfeb9085d7a2b"
github-repo: "https://github.com/Volscente/aerarium-saturni"
milestone: [4-the-tabularium](https://github.com/Volscente/aerarium-saturni/milestone/2)
tech-stack:
  - "Next.js 15"
  - "Nextra 4"
  - "Tailwind CSS"
  - "Lucide React"
scope-in:
  - "Refactoring root-level routing layout to serve a universal, clean welcome interface at `/`"
  - "Integrating a global top navigation bar with 3 entries: Home, Codex, and Tabularium"
  - "Scaffolding a dedicated, sidebar-free placeholder landing spot for `/tabularium` displaying the title 'Tabularium'"
  - "Restructuring the content tree layout to isolate the financial wiki under a distinct workspace layer"
scope-out:
  - "Functional portfolio management layer utility utilities (inputs, charts, analysis computations): future phase"
  - "Database connectivity or state preservation layers for live portfolio inputs: out of scope"
milestones:
  - "Root structural tree layout rearrangement and universal page meta mapping"
  - "Home welcome area layout deployment"
  - "Tabularium section view initialization"
context-paths:
  - "the-codex/README.md"
---

## Problem

The Aerarium Saturni platform is currently configured entirely as an isolated financial theory wiki. While it provides an exceptional structural environment for mathematical rendering and documentation, it lacks the broader application shell, architectural landing ground, and core entry infrastructure necessary to introduce live portfolio management utilities. To launch the next operational layer of the application—**Tabularium**—the project layout must be refactored from a single-purpose knowledge base into a cohesive multi-pillar navigation system.

## Approach direction

Leverage the native top-level page tab layout architecture provided by Nextra 4. The root structure of the `the-codex/content/` workspace directory will be re-arranged to host global main views at the top layer (`content/index.mdx` for Home, and `content/tabularium.mdx` for the placeholder). The existing documentation layout directories will be neatly nested inside a dedicated `content/codex/` directory.

A root `content/_meta.js` will define the primary navigation entries mapping (**Home**, **Codex**, **Tabularium**) to populate a clean global top header. Custom page configurations will be introduced inside the metadata object to deactivate the documentation sidebar and Table of Contents panels for the Home and Tabularium components, establishing zero visual overhead on non-wiki landing zones.

## Success criteria

- **Universal Navigation Mapping:** The top global layout bar displays interactive active highlights tracking routing choices for Home, Codex, and Tabularium seamlessly.
- **Root URL Experience:** Navigating to `/` displays a clean, generic, centered welcome interface with wiki sidebars entirely hidden.
- **Codex Integrity:** All historical financial theory notes, mathematical expressions, and Roman system assets remain accessible and structurally pristine.
- **FlexSearch Stability:** The production automated text indexing system continues to crawl and execute search logic across both the restructured wiki assets and newly introduced layers under 200ms response latencies.
- **Tabularium Placeholder Groundwork:** Navigating to `/tabularium` serves a clear page structure presenting solely the layout header title "Tabularium".

## Constraints

- **Theme Cohesion:** All fresh shell structures must seamlessly inherit the repository's custom Tailwind color palette primitives (`obsidian`, `parchment`, `terracotta`, `gold`, `stone`) and global style sheets without leaking raw defaults.
- **Lighthouse performance Score:** Production performance configurations must continuously enforce scores $\ge 90$ upon pipeline evaluation steps.
- **Build Cap Ceiling:** Build compilation pipelines must terminate execution completely in less than 3 minutes inside the automated multi-stage GitHub Actions matrix.

## Desired tech

No external utilities or dependencies are requested for this foundational phase. The implementation details will rely exclusively on native Next.js 15 routing mechanics and declarative Nextra 4 page layouts to maintain a highly optimized, zero-overhead bundle footprint.

## Integration context

The restructured content tree directory layout must comfortably preserve the configuration guarantees of the multi-stage `Dockerfile` standalone bundle schema and align beautifully with the automated Playwright mobile visual testing assertions.

## Known risks / concerns

- **Relative Page Link Breaking:** Shifting existing wiki paths down into a sub-folder layer alters their destination paths. An analysis must verify that cross-linked references inside the MDX document inventory do not throw broken route errors; any explicit root links found must be updated to target the new routing layout cleanly.
