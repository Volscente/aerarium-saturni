# [RFC] Hybrid Routing Migration — Aerarium Saturni

| Author              | Simone Porreca                                                                                                            |
| :------------------ | :------------------------------------------------------------------------------------------------------------------------ |
| **Project**         | Aerarium Saturni                                                                                                          |
| **RFC status**      | Draft                                                                                                                     |
| **Review deadline** | 2026-06-07                                                                                                                |
| **Notion page**     | [5-Hybrid-Routing-Migration](https://app.notion.com/p/5-Hybrid-Routing-Migration-36c5cc6c0f078050b8dae419491a7954)        |
| **GitHub repo**     | [Volscente/aerarium-saturni](https://github.com/Volscente/aerarium-saturni)                                               |
| **Milestone**       | [5-hybrid-routing-migration](https://github.com/Volscente/aerarium-saturni/milestone/3)                                   |

### Timeline

| Date       | Status | Note |
| :--------- | :----- | :--- |
| 2026-05-29 | Draft  |      |

### Table of contents

[Motivation](#motivation)

[Objectives](#objectives)

[Scope](#scope)

[Hybrid Routing Migration](#hybrid-routing-migration)

[Tech Stack](#tech-stack)

[Effort Estimations](#effort-estimations)

[FAQs](#faqs)

[Risks & Open Questions](#risks--open-questions)

[References](#references)

---

## Motivation {#motivation}

The Aerarium Saturni platform is built on a Next.js 15 + Nextra 4 application (`the-codex/`) that currently serves three pillars — Home, Tabularium, and Codex — through a single Nextra catch-all route (`app/[[...slug]]`). Nextra is a documentation framework whose value lies in MDX compilation, sidebar generation, full-text search, and static content delivery: exactly right for the Codex, but a source of compounding friction for the Tabularium. Nextra injects a prose wrapper that fights dashboard layouts, its file-system routing provides no sub-route granularity for application pages, its `_meta.js`-driven navbar couples the Tabularium tab to the documentation pipeline, and it provides no path to Python-side financial data processing without a separate service. Continuing to serve the Tabularium through the Nextra catch-all means fighting the framework on every subsequent feature. For full context, see the [Notion initiative page](https://app.notion.com/p/5-Hybrid-Routing-Migration-36c5cc6c0f078050b8dae419491a7954).

## Objectives {#objectives}

- **Isolate Tabularium from Nextra**: `GET /tabularium` and all `GET /tabularium/**` sub-routes are served exclusively by a Next.js App Router route group with zero Nextra sidebar, ToC, or prose wrapper involvement.
- **Maintain unified navigation**: `CustomNavbar` renders correctly — with the right active tab — on all three pillars using `usePathname()` rather than Nextra's page map.
- **Preserve Codex and Home**: `GET /` and all `GET /codex/**` routes are functionally and visually unchanged; Lighthouse performance score ≥ 90 and CI build ≤ 3 minutes are maintained.
- **Scaffold the Python backend**: A `backend/` UV workspace with a running FastAPI application (CORS configured, `/health` endpoint live) is ready to receive future API endpoints without further architectural changes.
- **Structural readiness for the dashboard**: The Tabularium route group provides a composable layout shell (Navbar, Footer, no Nextra chrome) that future sub-pages can slot into without revisiting the routing architecture.

## Scope {#scope}

**In-Scope:**

- Move Nextra `<Layout>` from `app/layout.tsx` to `app/[[...slug]]/layout.tsx`
- Create `app/(tabularium)/tabularium/layout.tsx` and `page.tsx`
- Refactor `CustomNavbar` to use hard-coded Next.js `<Link>` + `usePathname()` active state
- Delete `content/tabularium.mdx` and remove the `tabularium` entry from `content/_meta.js`
- Scaffold sub-route directories for portfolio and transactions (empty `page.tsx` placeholders)
- Create `backend/` UV workspace with FastAPI project structure (`pyproject.toml`, `src/` layout, `/health` endpoint)
- Configure CORS in FastAPI to allow requests from the Next.js dev and prod origins
- Add backend startup script to `justfile`

**Out-of-Scope:**

- **Dashboard content**: Charts, data tables, and forms are future work; this RFC only scaffolds the route structure and layout shell.
- **Database integration and queries**: Data persistence is a dedicated future initiative; no DB is wired in this RFC.
- **Any changes to Home or Codex routes**: `GET /` and `GET /codex/**` are intentionally untouched; regressions here are a hard failure criterion.
- **Visual or design changes to CustomNavbar or CustomFooter**: The refactor changes the implementation (removes Nextra `<Navbar>` dependency) but must preserve visual output exactly.
- **Authentication or authorisation**: The Tabularium remains unauthenticated at this stage.

**Constraints:**

- The top navigation bar, design tokens, and global layout must remain visually unified across all three pillars.
- The solution must remain a single Next.js deployment — no separate frontend app or service.
- Lighthouse performance score must remain ≥ 90 (enforced by `lhci autorun` in CI); CI build must complete within 3 minutes.

---

# **Hybrid Routing Migration** {#hybrid-routing-migration}

## Approach Overview {#approach-overview}

The approach adopts the author's stated direction in full: move the Nextra `<Layout>` wrapper out of the root layout, introduce a dedicated App Router route group for the Tabularium, refactor `CustomNavbar` to be framework-agnostic, and scaffold the Python backend workspace. No alternative direction was considered — the stated approach is both technically correct and internally consistent.

The core insight is that Next.js 15 App Router — which Nextra already runs on top of — provides all the primitives the Tabularium needs natively: Server Components, route groups, co-located layouts, and Server Actions. Using it directly for the Tabularium removes Nextra's documentation chrome (sidebar, ToC, prose wrapper, page-map-driven nav) while leaving the Codex entirely on Nextra. The two routing paths coexist in a single deployment: `app/[[...slug]]` continues to serve Nextra-compiled MDX for Home and Codex; `app/(tabularium)/` serves the dashboard shell via standard App Router layouts. The Python FastAPI service runs as a separate UV workspace in the same repository, called over HTTP from Tabularium Server Components — no client-side API calls for sensitive financial data.

### Integration

The migration touches four existing files and adds five new ones within `the-codex/`, plus creates the `backend/` workspace. The Codex content tree (`content/codex/`), Nginx configuration, Docker setup, and Lighthouse CI config require no changes — the `/tabularium` URL continues to exist and the performance assertion remains valid. The `CustomNavbar` and `CustomFooter` components in `theme/components/` are reused without visual modification in both the Nextra `[[...slug]]` layout and the new Tabularium layout, making them the visual continuity anchor across the hybrid architecture.

## Frontend Routing Migration {#frontend-routing-migration}

The migration proceeds in three ordered steps that must be applied atomically within M1.

**Step 1 — Lift Nextra Layout.**
The Nextra `<Layout>` wrapper is moved from `app/layout.tsx` into a new `app/[[...slug]]/layout.tsx`. The root `app/layout.tsx` becomes a minimal shell: `<html>`, `<body>`, global CSS imports, and the `NextThemes` provider only. Any route not matched by the `[[...slug]]` catch-all — specifically the Tabularium route group — never enters the Nextra rendering path. This step is the prerequisite for all others and must be verified independently before proceeding.

**Step 2 — Add the Tabularium route group.**
`app/(tabularium)/tabularium/layout.tsx` renders `CustomNavbar` and `CustomFooter` directly with a full-width content area and no Nextra chrome. `app/(tabularium)/tabularium/page.tsx` provides the landing page. Empty `page.tsx` placeholders are created at `app/(tabularium)/tabularium/portfolio/page.tsx` and `app/(tabularium)/tabularium/transactions/page.tsx` to establish the sub-route structure. The route group wrapper `(tabularium)` is invisible to the URL router, avoiding any slug conflict with the Nextra catch-all.

**Step 3 — Decouple the Navbar.**
`content/tabularium.mdx` is deleted and its entry removed from `content/_meta.js` **first**, before the route group page is created, to prevent a routing conflict where both Nextra and the App Router claim `/tabularium`. `CustomNavbar` is then refactored to a `'use client'` component: three explicit `<Link>` components for Home (`/`), Codex (`/codex`), and Tabularium (`/tabularium`), with `usePathname()` supplying active-state logic via prefix matching. Visual output must be identical to the current navbar; only the implementation changes. After this step `CustomNavbar` is framework-agnostic and reusable in both layouts.

**File change summary:**

| File | Change |
| :--- | :----- |
| `app/layout.tsx` | Stripped to minimal shell; Nextra `<Layout>` removed |
| `app/[[...slug]]/layout.tsx` | New file; receives Nextra `<Layout>` |
| `app/(tabularium)/tabularium/layout.tsx` | New file; `CustomNavbar` + `CustomFooter`, no Nextra |
| `app/(tabularium)/tabularium/page.tsx` | New file; Tabularium landing page |
| `app/(tabularium)/tabularium/portfolio/page.tsx` | New file; empty placeholder |
| `app/(tabularium)/tabularium/transactions/page.tsx` | New file; empty placeholder |
| `theme/components/Navbar.tsx` | Refactored; Nextra `<Navbar>` removed, hard-coded links added |
| `content/_meta.js` | `tabularium` entry removed |
| `content/tabularium.mdx` | Deleted |

## Python Backend Workspace Scaffold {#python-backend-workspace-scaffold}

The root `pyproject.toml` already declares `members = ["backend"]` in the UV workspace configuration; the `backend/` directory does not yet exist. This step materialises it.

**Directory structure:**

```
backend/
  pyproject.toml              ← UV workspace member; FastAPI + uvicorn dependencies
  src/
    aerarium_backend/
      __init__.py
      main.py                 ← FastAPI app: CORS middleware + GET /health endpoint
```

**CORS configuration:** `CORSMiddleware` is configured to allow requests from `http://localhost:3000` (Next.js dev server) and the production origin supplied via a `FRONTEND_ORIGIN` environment variable. All API responses include the appropriate `Access-Control-Allow-Origin` header.

**Health endpoint:** `GET /health` returns `{"status": "ok"}` with no database dependency, enabling CI and load-balancer liveness checks before any business logic is implemented.

**justfile integration:** A `backend-dev` recipe is added to the root `justfile`:

```makefile
backend-dev:
    cd backend && uv run uvicorn aerarium_backend.main:app --reload --port 8000
```

**Future data flow** (post-RFC, for context):

```
Browser → GET /tabularium/portfolio
  → app/(tabularium)/tabularium/layout.tsx   (Navbar + Footer shell)
  → app/(tabularium)/tabularium/portfolio/page.tsx   (Server Component)
       └── fetch("http://localhost:8000/portfolio")
              → backend/src/aerarium_backend/routers/portfolio.py   (future)
```

## Tech Stack {#tech-stack}

- **Next.js 15**: Already the runtime for `the-codex/`; App Router route groups, Server Components, and co-located layouts are used directly for the Tabularium without introducing any new dependency — the framework overhead is removed, not added.
- **Nextra 4**: Retained in full for the Codex and Home pillars; scoped to `app/[[...slug]]/` after the migration so its MDX compilation, sidebar, FlexSearch, and KaTeX pipeline continue to function unmodified.
- **Tailwind CSS**: Shared design token system including `roman-*` custom properties defined in `styles/globals.css`; the Tabularium layout shell reuses the same tokens to maintain visual unity.
- **Lucide React**: Icon library used in `CustomNavbar` and `CustomFooter`; reused unchanged in both the Nextra and Tabularium layouts.
- **Python 3.13**: Runtime for the backend service; required by the existing `.python-version` pin and UV workspace configuration; enables access to the Python financial ecosystem (pandas, financial libraries) unavailable in the Node.js runtime.
- **FastAPI**: Async Python web framework; chosen for native OpenAPI schema generation (API contract source of truth for frontend type derivation), async request handling, and built-in `CORSMiddleware`.
- **UV**: Python project and dependency manager; already configured at root as a workspace manager via `pyproject.toml`; the `backend/` workspace member is declared and ready to materialise.

**Desired / experimental:**

- **Next.js App Router (direct use for Tabularium)**: The author explicitly wants to use App Router route groups and Server Components directly for the Tabularium, bypassing the Nextra abstraction layer. This is the underlying runtime already in place — no new package is added; the change removes framework indirection.

## Effort Estimations {#effort-estimations}

Total estimated effort: **4 sessions**.

| Milestone                       | Description                                                                                                                                           | Est. effort | GitHub Issue |
| :------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------- | :---------- | :----------- |
| M1 — Frontend Routing Migration | Lift Nextra Layout, create Tabularium route group and placeholders, refactor CustomNavbar, delete `tabularium.mdx`, update `_meta.js`, verify CI green | 3 sessions  | #{issue}     |
| M2 — Python Backend Scaffold    | Create `backend/` UV workspace, FastAPI app with CORS and `/health`, `justfile` recipe, smoke-test from Next.js dev server                            | 1 session   | #{issue}     |

### Recommended Order

1. M1 — Frontend Routing Migration (self-contained Next.js changes; no external dependency; must complete before any Tabularium data work begins)
2. M2 — Python Backend Scaffold (structurally independent of M1, but logically follows to complete the full architecture described in this RFC)

---

# **FAQs** {#faqs}

**Q: Why use a route group `(tabularium)` instead of a top-level `tabularium/` directory?**

A: Nextra's `[[...slug]]` catch-all matches any URL path, including `/tabularium`. A top-level `app/tabularium/` directory would introduce ambiguity with the catch-all in Next.js's route resolution. A route group `(tabularium)` is invisible to the URL router and introduces no slug conflict, while still allowing a full `app/(tabularium)/tabularium/` nested route structure with its own layout hierarchy.

**Q: Why must `content/tabularium.mdx` be deleted rather than just removed from `_meta.js`?**

A: Nextra's `[[...slug]]` catch-all derives its routes from the `content/` file tree, not solely from `_meta.js`. Even if the `tabularium` entry is removed from navigation, the MDX file still exists and Nextra will still compile and serve `GET /tabularium` through the catch-all. The App Router route group page at the same path would be unreachable. Deletion is the only way to remove Nextra's claim on that URL.

**Q: Why refactor `CustomNavbar` to hard-coded links? Can the Nextra Navbar still be used?**

A: The Nextra `<Navbar>` derives its tab list from `content/_meta.js`. Once `tabularium` is removed from `_meta.js`, only two tabs remain (Home, Codex). The Tabularium tab must come from somewhere, and the Nextra page map no longer owns it. Hard-coding three `<Link>` components with `usePathname()` for active state makes `CustomNavbar` framework-agnostic and reusable in both the Nextra layout and the Tabularium layout shell without any page-map dependency.

**Q: Why FastAPI over a Node.js API (Express, Hono)?**

A: The motivation for a separate backend is Python's financial ecosystem — pandas, financial calculation libraries — which is unavailable in Node.js. A Node.js API would duplicate what Next.js Server Actions already provide natively (typed, co-located, no round-trip overhead for server-side logic). FastAPI is chosen because Python is the right runtime for the data layer; its async model and OpenAPI schema generation are additional benefits.

**Q: Terminology?**

A:

- **App Router** → Next.js 15's file-system router under `app/`; supports Server Components, Server Actions, nested layouts, and route groups natively.
- **Route group** → A directory wrapped in `()` (e.g. `(tabularium)`) that segments the route tree without affecting the URL.
- **Server Component** → A React component rendered exclusively on the server; can call internal APIs directly without exposing data to the client bundle.
- **UV** → Astral's Python package and project manager; used here as a workspace manager hosting both root-level config and `backend/` as a member workspace.
- **CORS** → Cross-Origin Resource Sharing; browser security policy requiring the FastAPI service to explicitly allowlist the Next.js origin before browser-initiated requests succeed.

---

## Risks & Open Questions {#risks--open-questions}

| Risk / Question | Likelihood | Mitigation / Answer |
| :-------------- | :--------- | :------------------ |
| **Routing conflict**: `content/tabularium.mdx` not deleted before the route group is created; Nextra catch-all continues to serve `/tabularium` and shadows the App Router page | Medium | Delete `tabularium.mdx` and its `_meta.js` entry as the first atomic change in M1; verify the route returns 404 from Nextra before creating the route group page |
| **Navbar active state regression**: `usePathname()` prefix-matching logic incorrectly flags Codex or Home as active when navigating within the Tabularium | Low | Extend existing Playwright screenshot tests to capture navbar active state at `/`, `/codex/fundamentals`, and `/tabularium`; assert correct active class on each |
| **Nextra Layout scope leak**: Moving `<Layout>` to `[[...slug]]/layout.tsx` inadvertently breaks sidebar, ToC, or FlexSearch for Codex routes | Low | Run `lhci autorun` and Playwright tests against `/codex/fundamentals` post-migration; confirm sidebar renders and search returns results |
| **API contract drift**: FastAPI and Next.js evolve independently with no shared type layer between Python and TypeScript | Low (at scaffold stage) | FastAPI's generated OpenAPI schema (`/openapi.json`) is the contract source of truth; frontend types are derived from it via codegen or manually maintained |
| **CORS misconfiguration**: FastAPI does not allowlist the Next.js dev origin; all Server Component fetches to the backend are silently blocked | Low | Smoke-test `GET /health` from the Next.js dev server immediately after wiring CORS; add a CI integration test before M2 is closed |

## References {#references}

- [Next.js App Router: Route Groups](https://nextjs.org/docs/app/building-your-application/routing/route-groups)
- [Next.js App Router: Layouts](https://nextjs.org/docs/app/building-your-application/routing/layouts-and-templates)
- [Nextra 4 Documentation](https://nextra.site/docs)
- [FastAPI Documentation](https://fastapi.tiangolo.com)
- [UV Workspaces](https://docs.astral.sh/uv/concepts/projects/workspaces/)
