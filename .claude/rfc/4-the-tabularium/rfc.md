# [RFC] Multi-Pillar Architecture: Introducing Tabularium and Welcome Layout — Aerarium Saturni

| Author              | Simone Porreca                                                                                    |
| :------------------ | :------------------------------------------------------------------------------------------------ |
| **Project**         | Aerarium Saturni                                                                                  |
| **RFC status**      | Draft                                                                                             |
| **Review deadline** | 2026-06-07                                                                                        |
| **Notion page**     | [4 — The Tabularium](https://www.notion.so/4-The-Tabularium-3685cc6c0f078031b25bfeb9085d7a2b)   |
| **GitHub repo**     | [Volscente/aerarium-saturni](https://github.com/Volscente/aerarium-saturni)                      |
| **Milestone**       | [4-the-tabularium](https://github.com/Volscente/aerarium-saturni/milestone/2)                    |

### Timeline

| Date       | Status | Note         |
| :--------- | :----- | :----------- |
| 2026-05-25 | Draft  | RFC authored |

### Table of contents

[Motivation](#motivation)

[Objectives](#objectives)

[Scope](#scope)

[Multi-Pillar Architecture](#multi-pillar-architecture)

[Tech Stack](#tech-stack)

[Effort Estimations](#effort-estimations)

[FAQs](#faqs)

[Risks & Open Questions](#risks--open-questions)

[References](#references)

---

## Motivation {#motivation}

The Aerarium Saturni platform is currently configured entirely as an isolated financial theory wiki. While it provides an exceptional structural environment for mathematical rendering and documentation, it lacks the broader application shell, architectural landing ground, and core entry infrastructure necessary to introduce live portfolio management utilities. To launch the next operational layer of the application — **Tabularium** — the project layout must be refactored from a single-purpose knowledge base into a cohesive multi-pillar navigation system. For full context, see the [Notion initiative page](https://www.notion.so/4-The-Tabularium-3685cc6c0f078031b25bfeb9085d7a2b).

## Objectives {#objectives}

- **Deploy global multi-pillar navigation**: Introduce a persistent top navigation bar surfacing three distinct pillars — Home, Codex, and Tabularium — with active route highlighting, using Nextra 4's native top-level tab layout as the organizing mechanism.
- **Establish a clean Home entry point**: Render a sidebar-free, ToC-free welcome interface at `/` that inherits the repository's custom Tailwind color palette without exposing any wiki-specific chrome.
- **Relocate the Codex under a dedicated namespace**: Move all existing financial wiki content into a `content/codex/` subdirectory, making it accessible under the `/codex/**` URL namespace while preserving every article, LaTeX expression, and internal link.
- **Scaffold the Tabularium placeholder**: Deliver a sidebar-free, zero-overhead page at `/tabularium` that presents the section title and nothing else — establishing the routing slot and layout contract for the future portfolio management layer.
- **Validate end-to-end structural integrity**: Confirm that no cross-links are broken after the path migration, Lighthouse performance score remains ≥ 90, and the CI build pipeline completes within 3 minutes.

## Scope {#scope}

**In-Scope:**

- Refactoring root-level routing layout to serve a universal, clean welcome interface at `/`
- Integrating a global top navigation bar with 3 entries: Home, Codex, and Tabularium
- Scaffolding a dedicated, sidebar-free placeholder landing spot for `/tabularium` displaying the title "Tabularium"
- Restructuring the content tree layout to isolate the financial wiki under a distinct workspace layer

**Out-of-Scope:**

- **Functional portfolio management layer utility utilities (inputs, charts, analysis computations)**: future phase
- **Database connectivity or state preservation layers for live portfolio inputs**: out of scope

**Constraints:**

- **Theme Cohesion**: All new shell structures must seamlessly inherit the repository's custom Tailwind color palette primitives (`obsidian`, `parchment`, `terracotta`, `gold`, `stone`) and global stylesheets without leaking raw framework defaults.
- **Lighthouse Performance Score**: Production configuration must continuously enforce a score ≥ 90 upon pipeline evaluation; enforced by `lhci autorun` in CI.
- **Build Cap Ceiling**: Build compilation pipelines must complete in less than 3 minutes inside the automated multi-stage GitHub Actions matrix.

---

# **Multi-Pillar Architecture** {#multi-pillar-architecture}

## Approach Overview {#approach-overview}

This RFC adopts the approach direction stated in the proposal: Nextra 4's native top-level page tab layout serves as the structural backbone for the multi-pillar system. The content tree is migrated from the current flat `pages/` directory into a hierarchical `content/` structure. At the root of `content/` two new global views are introduced: `index.mdx` (Home) and `tabularium.mdx` (Tabularium placeholder). All existing financial wiki content is relocated under `content/codex/`, mapping it to the `/codex/**` URL namespace. A root-level `_meta.js` file declares the three top-level navigation entries — `Home`, `Codex`, `Tabularium` — and embeds per-page `theme` configuration objects for Home and Tabularium that disable the sidebar and Table of Contents, leaving the Codex subtree with its full documentation layout intact.

Per-page layout suppression relies on Nextra 4's page theme configuration API: setting `{ sidebar: false, toc: false }` inside the `_meta.js` entry for a given page removes the wiki chrome entirely. Home and Tabularium pages are therefore rendered as raw, full-width surfaces styled exclusively with the repository's Tailwind palette. No custom layout wrapper component is required for this milestone; if the Nextra 4 theme API proves insufficient (see Risks), a minimal wrapper component is the designated fallback.

### Integration {#integration}

The **multi-stage Dockerfile** is content-structure-agnostic: the builder stage calls `next build` against the project root; the standalone output is unaffected by content directory rearrangement. No Dockerfile changes are required.

The **Nginx reverse-proxy configs** (`subdomain.conf`, `path-based.conf`) route all traffic to the Next.js container and require no modification; URL routing is handled entirely by Next.js file-system conventions.

**Lighthouse CI** (`.lighthouserc.js`) currently targets a single URL. After restructuring, the Home (`/`), Tabularium (`/tabularium`), and at least one Codex article (`/codex/finance/black-scholes`) must be added as assertion targets to keep coverage meaningful.

**Playwright visual regression tests** reference URLs that will change: `/finance/black-scholes` becomes `/codex/finance/black-scholes`. All affected test fixtures must have their URL strings updated and their baseline screenshots regenerated against the new layout before the CI suite is considered green.

**FlexSearch** builds its index automatically from the compiled MDX content; relocating articles under `content/codex/` changes their indexed href values but requires no explicit re-configuration. Post-restructure, a search-result smoke test should confirm that Codex articles are still discoverable and that their result links resolve correctly under the `/codex/**` namespace.

## M1 — Root Structural Tree Layout Rearrangement and Universal Page Meta Mapping {#m1}

This milestone establishes the new content directory hierarchy and the global navigation contract. The `pages/` directory (or existing `content/`) is reorganized:

```
content/
  _meta.js               ← global nav: Home, Codex, Tabularium
  index.mdx              ← Home (sidebar: false, toc: false)
  tabularium.mdx         ← Tabularium placeholder (sidebar: false, toc: false)
  codex/
    _meta.js             ← Codex subtree nav (existing structure preserved)
    finance/
      black-scholes.mdx  ← relocated from pages/finance/
```

The root `_meta.js` defines three entries. The `Home` and `Tabularium` entries carry `theme: { sidebar: false, toc: false }` to suppress all wiki chrome. The `Codex` entry points to the `codex/` subtree and inherits the standard documentation layout. Absolute cross-links inside any MDX file are audited and updated to target the new `/codex/**` paths. The build pipeline and CI checks are run to confirm no compilation errors and no Lighthouse regressions.

## M2 — Home Welcome Area Layout Deployment {#m2}

With the routing contract in place, this milestone delivers the Home page content. `content/index.mdx` is populated with a centered welcome composition using the Tailwind palette primitives and — where applicable — Lucide React icons as decorative anchors. The page renders without sidebar, ToC, or any Nextra documentation chrome. Lighthouse CI is run against `/` to confirm the score ≥ 90. Playwright baseline screenshots for the Home page are captured.

## M3 — Tabularium Section View Initialization {#m3}

`content/tabularium.mdx` is fleshed out to display the section title "Tabularium" in a typographically deliberate, centered layout consistent with the Home page aesthetic. No functional content is added; this milestone solely establishes the visual contract for the `/tabularium` route. Lighthouse CI is extended to assert against `/tabularium`. Playwright baselines are captured.

## Tech Stack {#tech-stack}

- **Next.js 15**: Core framework; provides file-system-based routing that maps the new `content/` hierarchy directly to URL paths, and produces the `.next/standalone` output consumed by the multi-stage Dockerfile.
- **Nextra 4**: Documentation framework layered on Next.js; its top-level tab layout is the mechanism for the multi-pillar navigation bar, and its `_meta.js` per-page theme config is the mechanism for disabling sidebar and ToC on non-wiki pages.
- **Tailwind CSS**: Utility-first CSS framework; the repository's custom design tokens (`obsidian`, `parchment`, `terracotta`, `gold`, `stone`) are already registered and are the sole styling primitives used across the new Home and Tabularium shells.
- **Lucide React**: Icon set used as decorative anchors on the Home welcome interface; chosen for its tree-shakable ESM build to maintain the zero-overhead bundle footprint.

## Effort Estimations {#effort-estimations}

Total estimated effort: **2 sessions**.

| Milestone | Description                                                                 | Est. effort | GitHub Issue |
| :-------- | :-------------------------------------------------------------------------- | :---------- | :----------- |
| M1        | Content tree restructure, `_meta.js` nav mapping, cross-link audit          | 1.0 session   | #9{issue}     |
| M2        | Home page layout and Playwright baseline capture                            | 0.5 session   | #10{issue}     |
| M3        | Tabularium placeholder layout and Lighthouse/Playwright coverage extension  | 0.5 session   | #11{issue}     |

### Recommended Order

1. M1 — Root Structural Tree Layout Rearrangement (foundation; M2 and M3 cannot start until routing contract is validated)
2. M2 — Home Welcome Area Layout Deployment (establishes the primary entry point aesthetic before the secondary pillar)
3. M3 — Tabularium Section View Initialization (builds on Home aesthetic, closes the milestone)

---

# **FAQs** {#faqs}

**Q: Why must the wiki content move to `/codex/**` rather than staying at the root URL namespace?**

A: Nextra 4's tab layout maps top-level `content/` entries directly to URL segments. To give Codex its own navigation tab and preserve the Home and Tabularium routes as siblings, the wiki subtree must live inside a `content/codex/` directory — which Nextra resolves to `/codex/**`. There is no mechanism in Nextra 4 to keep wiki content at the root while also rendering a multi-pillar tab bar for separate pillars at the same level.

**Q: How exactly does Nextra 4 suppress the sidebar and Table of Contents for specific pages?**

A: Nextra 4 supports a `theme` key per entry in `_meta.js`. Setting `theme: { sidebar: false, toc: false }` on the `index` and `tabularium` entries instructs the Nextra layout renderer to omit those panels for those pages. If this API does not behave as documented for the version pinned in the project, the fallback is a minimal custom layout component exported from the page file via Next.js's `getLayout` pattern.

**Q: Why is Lucide React listed in the tech stack if this RFC only scaffolds placeholder pages?**

A: Lucide React is listed because M2 (Home) uses icons as decorative anchors on the welcome interface. Its tree-shakable ESM build means only the imported icons are bundled, so adding it has no measurable Lighthouse impact. If the Home design during M2 ends up icon-free, the dependency can be deferred to a future phase without affecting M1 or M3.

**Q: What happens to the FlexSearch index after content is relocated to `/codex/**`?**

A: FlexSearch is rebuilt at compile time from the MDX content tree. After restructuring, the indexed hrefs will change from `/finance/black-scholes` to `/codex/finance/black-scholes`. No re-configuration is needed; however, any client-side code or Playwright test that constructs search-result URLs by concatenating a hard-coded prefix must be updated. A post-restructure smoke test is included in M1's acceptance criteria.

**Q: Terminology?**

A: Acronyms and domain terms used in this RFC:

- **Tabularium** → The planned portfolio management pillar of Aerarium Saturni; the name derives from the Roman archive building. In this RFC it refers to the new top-level routing slot and its placeholder page.
- **Codex** → The existing financial theory wiki; the name derives from the Roman bound-manuscript format. After this RFC its URLs move to the `/codex/**` namespace.
- **MDX** → Markdown with embedded JSX; the content format used throughout the Nextra content tree.
- **ToC** → Table of Contents; the in-page navigation panel rendered by Nextra on the right side of documentation pages.
- **LHCI** → Lighthouse CI; the automated performance scoring tool configured in `.lighthouserc.js`.

---

## Risks & Open Questions {#risks--open-questions}

| Risk / Question                                                                               | Likelihood | Mitigation / Answer                                                                                                                                                                          |
| :-------------------------------------------------------------------------------------------- | :--------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Broken cross-links**: relocating wiki content to `/codex/**` invalidates any absolute hrefs (`/finance/black-scholes`) present in MDX files | Medium     | Audit all MDX files for absolute links before merging M1; update to `/codex/**` paths. Add a dead-link check step to CI (e.g., `next-link-checker` or a grep-based assertion). |
| **Nextra 4 `_meta.js` theme API discrepancy**: the per-page `{ sidebar: false, toc: false }` config may not behave as documented for the pinned Nextra version | Medium     | Prototype the config override in a local branch before committing to M1 structure; if the API is insufficient, implement a custom `getLayout` wrapper component as fallback. |
| **Playwright visual regression test breakage**: URL changes and new pages invalidate existing baseline screenshots | Low        | Update all affected URL strings in test fixtures during M1; regenerate baselines for all three routes (`/`, `/codex/finance/black-scholes`, `/tabularium`) before enabling screenshot comparison in CI. |
| **FlexSearch indexing under new paths**: search results link to old `/finance/**` hrefs if the index is cached or the build is not fully invalidated | Low        | Force a clean build (no `.next/` cache) on the first post-restructure CI run; run a search smoke test asserting that result hrefs begin with `/codex/` for all wiki articles. |

## References {#references}

- [Nextra 4 Documentation — Page Configuration](https://nextra.site/docs/guide/page-configuration)
- [Next.js 15 — App Router File Conventions](https://nextjs.org/docs/app/api-reference/file-conventions)
- [4 — The Tabularium (Notion)](https://www.notion.so/4-The-Tabularium-3685cc6c0f078031b25bfeb9085d7a2b)
- [Aerarium Saturni — Milestone 2](https://github.com/Volscente/aerarium-saturni/milestone/2)
