---
title: ""               # Short RFC title
project: ""             # Project or repo name
author: "Simone Porreca"
deadline: ""            # YYYY-MM-DD; leave blank to default to 14 days from today
notion-page: ""         # URL of the Notion initiative page; omit row in RFC if blank
github-repo: ""         # owner/repo (e.g. simone/recipe-app); omit row in RFC if blank
milestone: ""           # GitHub Milestone name; omit row in RFC if blank
tech-stack:
  - ""                  # e.g. Python, Flask, whoosh
scope-in:
  - ""                  # Each line is one in-scope capability
scope-out:
  - ""                  # Format: "Item: reason" (e.g. "Fuzzy matching: future phase")
milestones:
  - ""                  # Ordered milestone names; each maps to a GitHub Issue
context-paths:
  - ""                  # Optional: paths to module README.md files Claude should read for design context.
                        # Paths are relative to the root of the target project repo.
                        # E.g. "src/auth/README.md", "src/api/README.md"
---

## Problem

<!-- Required. Describe the technical gap or pain point driving this initiative.
     Write as much as needed — one sentence or several paragraphs.
     No personal motivation here — that lives in the Notion page above. -->

## Approach direction

<!-- Optional. Your initial idea or preferred high-level approach.
     Leave blank if you want Claude to propose the approach freely. -->

## Success criteria

<!-- Optional. How will you know this initiative is done?
     List measurable outcomes (e.g. "users can search by ingredient name in < 300 ms").
     Used to generate the Objectives section in the RFC. -->

## Constraints

<!-- Optional. Hard requirements the solution must satisfy.
     Examples: SLA targets, banned technologies, budget caps, compliance rules.
     Claude will not relax these when designing the approach. -->

## Desired tech

<!-- Optional. Technologies you want to experiment with or strongly prefer.
     Separate from the tech-stack YAML field (which lists the existing stack);
     this is for new tools you want to try — include your reasoning if useful. -->

## Integration context

<!-- Optional. How should the solution integrate with the current system?
     E.g. "must reuse the existing auth middleware", "expose a REST endpoint consumed by the mobile app".
     Used to shape integration subsections in the RFC. -->

## Known risks / concerns

<!-- Optional. Doubts about your approach or technical uncertainties.
     Used to seed the Risks & Open Questions table in the RFC. -->
