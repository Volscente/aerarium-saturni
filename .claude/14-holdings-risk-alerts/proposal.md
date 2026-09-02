---
title: "Holdings Risk Alerts"
project: "Aerarium Saturni"
author: "Simone Porreca"
deadline: ""
notion-page: ""
github-repo: "Volscente/aerarium-saturni"
milestone: ""
tech-stack:
  - "Next.js (App Router / Server Components)"
  - "FastAPI"
  - "SQLAlchemy (async)"
  - "PostgreSQL"
  - "Pydantic v2"
scope-in:
  - "Concentration Risk alert rule: a single stock's total look-through weighted exposure exceeds 10%"
  - "Data Freshness Risk alert rule: any held ETF's latest holdings snapshot_date is more than 60 days old"
  - "Automatic re-evaluation of both rules on transaction changes (Event A), price changes (Event B), and holdings CSV/XLSX uploads (Event C)"
  - "In-app warning banners and alert badges surfaced on the /tabularium/portfolio dashboard"
scope-out:
  - "Email/push/Slack notifications: Notification Delivery is explicitly in-app only for this phase"
  - "User-configurable thresholds: the 10% and 60-day limits are fixed constants per the given rule definitions, not settings"
  - "Historical alert log or audit trail of past breaches: not requested; a future phase if needed"
milestones:
  - "Risk Rule Evaluation Engine"
  - "Dashboard Alert Banners & Badges"
context-paths:
  - "backend/README.md"
  - "frontend/README.md"
---

## Problem

Portfolios drift over time due to market price swings, new buy/sell transactions, or periodic ETF index rebalances — a stock that was a safe 4% of the combined portfolio can silently cross a risky concentration threshold, or a holdings snapshot can quietly become stale, and today nothing on the dashboard tells the user this happened without them re-checking the numbers themselves. There is no automated mechanism that evaluates risk conditions against the already-computed look-through exposure data and proactively surfaces them; the user must remember to look.

## Approach direction

Rules should re-evaluate automatically on each of the three named trigger events (transaction changes, price changes, holdings uploads) rather than on a fixed polling schedule. The concrete mechanism for how that re-evaluation reaches the dashboard (recomputed inline on next page render vs. a background job vs. a client-side push) is left open — this app's existing architecture is Next.js Server Components fetching fresh per request, with `revalidateTag` cache invalidation already wired into every one of those three trigger events; there is no WebSocket or polling infrastructure today.

## Success criteria

- Concentration Risk rule fires whenever any single stock's total look-through weighted exposure (`total_weight_percentage` from the existing holdings-exposure aggregation) exceeds 10%.
- Data Freshness Risk rule fires whenever any held ETF's latest holdings `snapshot_date` is more than 60 days old.
- Both rules are re-evaluated automatically after Event A (buy/sell transaction), Event B (ETF/stock price refresh), and Event C (new holdings CSV/XLSX upload) — no manual refresh or separate "check risk" action required.
- Active warnings are visible on `/tabularium/portfolio` as both a non-intrusive banner and a compact alert badge, without the user needing to open the Detailed Table or hover over any chart.

## Constraints

- Notification delivery is in-app only (warning banners + alert badges) — no email, push, or external notification channel, per the initiative's own Notification Delivery definition.
- Thresholds are fixed at 10% (concentration) and 60 days (freshness) exactly as specified — not user-configurable in this phase.
- No new persistent infrastructure dependency (message queue, WebSocket server, cron scheduler) unless the "real-time re-evaluation" requirement genuinely cannot be met by recomputing on the existing request/cache-invalidation model already in place.

## Desired tech

## Integration context

- Concentration Risk should reuse the already-computed `GET /portfolio/holdings/exposure` look-through aggregation (`total_weight_percentage` per stock) from the Holdings Data Visualisation initiative rather than recomputing exposure separately.
- Data Freshness Risk should reuse each ETF's latest `EtfHolding.snapshot_date`, already surfaced per-contribution by that same endpoint.
- Alert banners/badges should render on the existing `/tabularium/portfolio` page (`PortfolioPageClient.tsx`), alongside the Concentration Dashboard UI already shipped there (see `.claude/13-holdings-data-visualisation/`).
- The three named trigger events already call `revalidateTag('portfolio-overview')` and/or `revalidateTag('holdings-exposure')` today: transaction Server Actions (`actions.ts`), ETF/price Server Actions (`etf-actions.ts`), and the holdings upload route (`app/api/etfs/[id]/holdings/upload/route.ts` → backend `upload_holdings`). Alert re-evaluation should hook into the same invalidation points rather than introducing a parallel mechanism.

## Known risks / concerns

- "Real-time re-evaluation" is ambiguous in a Server-Component/on-request architecture with no live push channel today — needs a concrete definition of what "real-time" means here (e.g. always-fresh on next render/navigation vs. actually pushed to a tab the user has left open).
- A stock's total exposure blends multiple ETFs, each with its own `snapshot_date` — the Data Freshness rule needs a defined behavior for when only some of a stock's contributing ETFs are stale (per-ETF alert vs. per-stock rollup).
- Where alert evaluation should live (backend, as part of the existing aggregation response, vs. frontend, derived client-side from already-fetched data) affects both reusability (e.g. future notification channels) and testability, and isn't yet decided.
