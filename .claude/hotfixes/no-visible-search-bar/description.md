---
title: "No Visible Search Bar"
project: "Aerarium Saturni"
author: "Simone Porreca"
severity: "Critical"                                                 # critical | high | medium
affected-versions:
  - "0.0.2"
environments:
  - "Production"                                                     # Production | Staging
  - "Staging"                                                        # Production | Staging 
github-issue: ""                                                     # URL or issue number; omit row in hotfix doc if blank
github-repo: "https://github.com/Volscente/aerarium-saturni"
tech-stack:
  - "Next.js 15"
  - "Nextra 4"
  - "FlexSearch"
  - "Tailwind CSS"
context-paths:
  - "frontend/README.md"
---

## Symptom

The search bar is not visible in the Codex pillar (routes under `/codex/**`). Users cannot search for content within the Codex area.

## Root cause

The 2026-06-01 layout restructuring stripped `app/layout.tsx` to a minimal shell and moved the Nextra `<Layout>` to `app/[[...slug]]/layout.tsx`. During the same migration, `CustomNavbar` was refactored into a framework-agnostic component. The Nextra search bar is rendered by the Nextra `<Layout>` itself; a misconfigured layout prop, a missing theme option, or a CSS override in `styles/globals.css` introduced during this migration is likely suppressing it.

## Fix approach

<!-- Optional. Your initial idea or preferred fix strategy.
     Leave blank if you want Claude to propose the approach freely. -->


## Verification steps

1. Navigate to `/codex` or any `/codex/**` page in a browser and confirm the search bar is visible in the page header.
2. Type at least 2 characters and verify search results populate (minimum-2-character constraint).
3. Confirm the search index loads successfully: `/_next/static/chunks/nextra-data-en-US.json` returns HTTP 200.
4. Verify search bar is visible in both light and dark modes.
5. Confirm no standard Nextra styling has become newly visible elsewhere on the page.
6. Run `lhci autorun` and confirm Lighthouse performance score remains ≥ 90 for `/codex/fundamentals`.

## Scope

**In scope:**
- Restoring search bar visibility in the Codex pillar (`/codex/**`)

**Out of scope:**
- Tabularium search: the Tabularium has no Nextra chrome by design
- Home page search: not affected by this bug
- Search behavior or ranking changes: separate initiative

## Known risks

- CSS changes to restore the search bar could inadvertently expose other standard Nextra styling currently suppressed by overrides in `styles/globals.css` (invariant: no standard Nextra styling may be visible in the final site).
- Changes to the Nextra `<Layout>` props in `app/[[...slug]]/layout.tsx` could affect other Nextra chrome elements (sidebar, ToC) on Codex pages.
