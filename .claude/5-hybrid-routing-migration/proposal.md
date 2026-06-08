---
title: "Hybrid Routing Migration"
project: "Aerarium Saturni"
author: "Simone Porreca"
deadline: "2026-06-07"
notion-page: "https://app.notion.com/p/5-Hybrid-Routing-Migration-36c5cc6c0f078050b8dae419491a7954"
github-repo: "https://github.com/Volscente/aerarium-saturni"
milestone: [5-hybrid-routing-migration](https://github.com/Volscente/aerarium-saturni/milestone/3)
tech-stack:
  - "Next.js 15"
  - "Nextra 4"
  - "Tailwind CSS"
  - "Lucide React"
  - "Python 3.13"
  - "FastAPI"
  - "UV"
scope-in:
  - "Move Nextra <Layout> from app/layout.tsx to app/[[...slug]]/layout.tsx"
  - "Create app/(tabularium)/tabularium/layout.tsx and page.tsx"
  - "Refactor CustomNavbar to use hard-coded Next.js <Link> + usePathname() active state"
  - "Delete content/tabularium.mdx and remove tabularium entry from content/_meta.js"
  - "Scaffold sub-route directories for portfolio and transactions (empty page.tsx placeholders)"
  - "Create backend/ UV workspace with FastAPI project structure (pyproject.toml, src layout, health endpoint)"
  - "Configure CORS in FastAPI to allow requests from the Next.js dev and prod origins"
  - "Add backend startup script to justfile"
scope-out:
  - "Dashboard content: charts, data tables, forms (future work)"
  - "Database integration and queries"
  - "Any changes to Home (/) or Codex (/codex/**) routes"
  - "Visual or design changes to CustomNavbar or CustomFooter"
  - "Authentication or authorisation"
milestones:
  - ""
context-paths:
  - "the-codex/README.md"
---

## Problem

Nextra is a documentation framework whose value lies in MDX compilation, sidebar generation, full-text search, and static content delivery — all right for the Codex, but creating compounding friction for the Tabularium:

- **No native DB access pattern**: Nextra pages are MDX files; wiring Server Components or Server Actions for DB reads/writes means embedding increasingly complex JSX into a markdown file.
- **Prose wrapper conflict**: Nextra injects a typography container around MDX content that fights dashboard layouts (charts, data tables, forms need full-width, not a constrained prose column).
- **No route granularity**: A dashboard needs sub-routes (`/tabularium/portfolio`, `/tabularium/transactions`) with their own layouts and data-fetching logic — Nextra's file-system routing is designed for documentation trees, not application pages.
- **Theme lock-in**: Nextra controls sidebar, ToC, and navigation tab rendering; suppressing them via `_meta.js` overrides is a workaround, not a design.
- **No Python runtime**: Financial data processing — portfolio valuation, transaction aggregation, currency conversion — benefits from Python's ecosystem (pandas, financial libraries) that is unavailable in the Node.js runtime. The Tabularium needs a Python backend service alongside the Next.js frontend.

## Approach direction

Migrate the Tabularium pillar from a Nextra-managed MDX page (`content/tabularium.mdx`) to a dedicated Next.js App Router route group (`app/(tabularium)/`), while leaving the Home and Codex pillars untouched under Nextra. The migration has three sequential steps:

1. **Lift Nextra Layout out of the root layout** — move the Nextra `<Layout>` wrapper from `app/layout.tsx` into `app/[[...slug]]/layout.tsx`, making the root layout a minimal shell.
2. **Add the Tabularium route group** — create `app/(tabularium)/tabularium/layout.tsx` and `page.tsx`, rendering `CustomNavbar` and `CustomFooter` directly.
3. **Decouple the Navbar from Nextra's page map** — replace the Nextra `<Navbar>` wrapper with an explicit three-link nav using Next.js `<Link>` and `usePathname()` for active state.
4. **Scaffold the Python backend workspace** — create `backend/` as a UV workspace member (already declared in the root `pyproject.toml`) with a FastAPI application: `src/` layout, a `/health` endpoint, and CORS configured for Next.js dev and prod origins. Actual API endpoints and business logic are deferred to future RFCs.

## Success criteria

- `GET /tabularium` and all `GET /tabularium/**` sub-routes are served by the App Router route group with zero Nextra involvement.
- The top navigation bar renders on all three pillars with correct active-route highlighting, driven by `usePathname()` rather than Nextra's page map.
- The Tabularium layout renders without Nextra sidebar, ToC, prose wrapper, or any documentation chrome.
- `GET /` (Home) and all `GET /codex/**` routes continue to work identically — no regressions.
- `content/tabularium.mdx` and the `tabularium` entry in `content/_meta.js` are removed without breaking the build.
- Lighthouse performance score ≥ 90 for `/tabularium`.
- CI build completes within 3 minutes.
- The Tabularium route group is structurally ready to receive dashboard sub-pages (charts, forms, DB queries) without further architectural changes.

## Constraints

- The top navigation bar, design tokens, and global layout must remain visually unified across all three pillars (Home, Codex, Tabularium).
- The Home (`/`) and Codex (`/codex/**`) routes must not regress in any way.
- The solution must remain a single Next.js deployment — no separate app or service for the Tabularium.

## Desired tech

Next.js 15 App Router used directly for the Tabularium (Server Components, Server Actions, route groups, co-located layouts). This is already the underlying framework Nextra runs on, so no new dependency is added — it removes framework overhead rather than adding it.

## Integration context

- `CustomNavbar` and `CustomFooter` are already used by Nextra pages and must be reused in the Tabularium layout without modification to their visual output.
- The Nextra `<Layout>` wrapper moves from `app/layout.tsx` to `app/[[...slug]]/layout.tsx` — this is a structural move, not a functional change for Nextra-served pages.
- The `backend/` workspace is managed by UV; the frontend `the-codex/` workspace is managed by npm. Both live in the same git repository and share CI.
- Tabularium Server Components fetch data from the FastAPI service via HTTP — the FastAPI service owns all data access. No client-side API calls for sensitive financial data.
- The root `pyproject.toml` already declares `members = ["backend"]` in the UV workspace config; the `backend/` directory just needs to be created.

## Known risks / concerns

- **Routing conflict**: If `content/tabularium.mdx` is not deleted, Nextra's `[[...slug]]` catch-all will still match `/tabularium`, creating a conflict with the App Router route group. Deletion is required.
- **Navbar active state**: The current `CustomNavbar` derives tab list from Nextra's page map; once Tabularium is removed from `_meta.js`, the tab count shrinks. The hard-coded `usePathname()` replacement must be validated across all three pillars.
- **Nextra Layout scope**: Moving `<Layout>` to `[[...slug]]/layout.tsx` must be verified not to break any Nextra-specific behavior (sidebar, ToC, search) for the Codex.
- **API contract drift**: Frontend and backend evolve independently with no shared type layer between Python and TypeScript. Mitigation: use the OpenAPI schema generated by FastAPI as the source of truth, consumed by the frontend via codegen or manually maintained types.
- **CORS misconfiguration**: FastAPI must explicitly allowlist the Next.js origin (dev and prod); a misconfiguration silently blocks all frontend data fetches.
- **Mono-repo tooling asymmetry**: Two separate package managers (UV for Python, npm for Node) require the `justfile` to orchestrate both consistently — install, dev, build, and test commands must cover both workspaces.
