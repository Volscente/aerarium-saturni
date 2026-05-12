# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
