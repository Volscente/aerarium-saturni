# #10: Home Welcome Area Layout Deployment

**GitHub Issue:** [#10 — Home Welcome Area Layout Deployment](https://github.com/Volscente/aerarium-saturni/issues/10)
**GitHub Milestone:** [4-the-tabularium](https://github.com/Volscente/aerarium-saturni/milestone/2)
**Notion page:** [4 — The Tabularium](https://www.notion.so/4-The-Tabularium-3685cc6c0f078031b25bfeb9085d7a2b)

---

## Technical Scope

**In scope:**

- `the-codex/content/index.mdx` — Replace the `# Home` stub with a fully styled, centered welcome composition using Tailwind `roman-*` tokens and Lucide React icon anchors
- `the-codex/tests/mobile-screenshot.spec.ts` — Add a Playwright visual snapshot test capturing the Home page (`/`) at 375 px viewport

**Out of scope:**

- `the-codex/content/_meta.js` — No changes; sidebar/ToC suppression (`theme: { sidebar: false, toc: false }`) is already in place from TASK-1
- `the-codex/.lighthouserc.js` — No changes; `http://localhost:3000/` assertion target is already included from TASK-1
- `the-codex/styles/globals.css` — No changes; `roman-*` Tailwind tokens and base styles are already defined
- Functional portfolio content (charts, data inputs, computations) — future Tabularium phase
- Tabularium page layout — TASK-3

---

## Architecture

```txt
the-codex/content/index.mdx
   (MDX source: JSX + Tailwind roman-* tokens + Lucide icon imports)
          │
          │  Nextra MDX compilation — next build
          │  _meta.js: index entry has theme: { sidebar: false, toc: false }
          ▼
the-codex/app/[[...slug]]/page.tsx
   (Next.js App Router catch-all; no sidebar, no ToC injected)
          │
          ▼
GET /  →  full-width centered welcome surface
          │
          ├── Platform icon anchor     (Lucide — individually imported)
          ├── Platform heading         (font-roman, text-roman-gold)
          ├── Tagline / descriptor     (text-roman-stone)
          └── Pillar icon anchors      (Codex · Tabularium, text-roman-stone)
```

### Sidebar and ToC suppression

Nextra 4 reads the `theme` key on the `index` entry in `content/_meta.js`. Setting `{ sidebar: false, toc: false }` removes those panels from the rendered page without requiring a custom layout component. This config was delivered by TASK-1 and requires no changes here.

---

## Tech Stack

No new packages required.

`lucide-react@^0.400.0` is already present in `the-codex/package.json` under `devDependencies`. Icons are imported individually per component to exploit tree-shaking; no barrel import.

---

## Implementation Details

### Modules / Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `the-codex/content/index.mdx` | Modify | Replace `# Home` stub with centered welcome composition; JSX layout with Tailwind `roman-*` tokens and individually imported Lucide icons |
| `the-codex/tests/mobile-screenshot.spec.ts` | Modify | Append a `test.describe` block for the Home page (`/`) Playwright visual snapshot at 375 px viewport |

---

### Content Structure

Skeleton for `the-codex/content/index.mdx`:

```mdx
import { BookOpen, TrendingUp } from 'lucide-react'

<div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6 gap-6">

  <div className="text-roman-gold">
    <BookOpen size={48} strokeWidth={1.5} />
  </div>

  <h1 className="font-roman text-5xl text-roman-gold tracking-wide">
    Aerarium Saturni
  </h1>

  <p className="text-roman-stone text-lg max-w-xl leading-relaxed">
    A personal platform for financial theory, portfolio analysis,
    and long-term wealth architecture.
  </p>

  <div className="flex gap-8 mt-2 text-roman-stone text-sm">
    <span className="flex items-center gap-2">
      <BookOpen size={16} strokeWidth={1.5} /> Codex
    </span>
    <span className="flex items-center gap-2">
      <TrendingUp size={16} strokeWidth={1.5} /> Tabularium
    </span>
  </div>

</div>
```

Constraints:
- All classes use `roman-*` tokens registered in `globals.css` via Tailwind 4's `@theme` block; no raw hex values in markup
- Lucide icons imported individually — never via a barrel import — to keep the bundle footprint zero-overhead
- No `prose` or Nextra typography wrapper around the composition; if Nextra injects a prose container, it must be neutralised with `not-prose` (see Open Questions)
- Dark-mode colour inversion is handled by `globals.css` `html.dark` overrides — no inline dark-mode classes needed in the MDX

---

### Playwright Test Addition

Append to `the-codex/tests/mobile-screenshot.spec.ts`:

```typescript
test.describe('Home page visual regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('visual snapshot — Home page at 375 px', async ({ page }) => {
    await expect(page).toHaveScreenshot('home-mobile.png', {
      fullPage: true,
    })
  })
})
```

Baselines are generated on Linux CI via the `update-snapshots` job. macOS dev runs will produce expected diff warnings — this is acceptable (matches the existing convention for the mathematics snapshot).

---

### Testing Strategy

**Visual regression (Playwright):**

- New `test.describe` block appended to `tests/mobile-screenshot.spec.ts`
- Captures `home-mobile.png` fullPage at 375 px on first `--update-snapshots` CI run
- Subsequent runs assert no visual drift against the captured baseline

**Performance (Lighthouse CI):**

- `http://localhost:3000/` is already listed in `.lighthouserc.js` URL targets — no config change required
- Run `npx lhci autorun` locally from `the-codex/` before pushing to confirm `categories:performance` score ≥ 0.9

**Manual integration:**

```bash
cd the-codex
npm run dev
# → http://localhost:3000/
```

Verify:
- No sidebar or ToC visible on `/`
- Platform heading, tagline, and Lucide icons render with correct `roman-*` colours
- No horizontal overflow at 375 px viewport width
- Dark mode toggle (Navbar) correctly switches between `roman-obsidian` and `roman-parchment` backgrounds
- Top navigation bar shows `Home` tab as active when on `/`

**Edge cases:**

- `html.dark` active → background `#1A1A2E` (roman-obsidian), text `#F5F0E8` (roman-parchment); headings remain `roman-gold` (#B8860B) per `globals.css` `h1` rule
- Nextra prose styles leaking max-width or margin into the JSX container → apply `not-prose` class on the outer `<div>` if DOM inspection reveals unwanted constraints

---

### Open Questions / Risks

- [ ] **Nextra prose wrapper leak:** The Nextra MDX content area may wrap rendered output in a `prose` container from `@tailwindcss/typography`, adding unwanted `max-w-prose`, margin, or line-height overrides that fight the centered layout. **Mitigation:** inspect the rendered DOM in dev; add `not-prose` to the outer `<div>` if prose styles are detected. **Target:** implementation
- [ ] **Lucide React import in MDX:** Named icon imports at the top of an MDX file must resolve through Nextra's MDX compilation pipeline without a babel or webpack alias conflict. **Mitigation:** test a single `import { BookOpen } from 'lucide-react'` in dev before committing the full composition. **Target:** implementation
