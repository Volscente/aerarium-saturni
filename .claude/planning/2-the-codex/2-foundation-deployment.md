# #2: Foundation & Deployment

**GitHub Issue:** [#2 — Foundation & Deployment](https://github.com/Volscente/aerarium-saturni/issues/2)
**GitHub Milestone:** [Milestone 1 — Foundation & Deployment](https://github.com/Volscente/aerarium-saturni/milestone/1)
**Notion page:** N/A

---

## Technical Scope

**In scope:**

- `the-codex/next.config.js` — Nextra wrapper with remark/rehype plugin chain and custom theme entry point
- `the-codex/package.json` — project dependencies (Next.js, Nextra, remark-math, rehype-katex, KaTeX)
- `the-codex/pages/_app.tsx` — global KaTeX CSS import and Next.js custom App wrapper
- `the-codex/pages/_meta.json` — top-level content tree navigation structure
- `the-codex/pages/index.mdx` — documentation landing page
- `the-codex/pages/finance/black-scholes.mdx` — sample financial article with inline and block LaTeX
- `the-codex/pages/finance/_meta.json` — navigation entries for the finance section
- `the-codex/theme/index.tsx` — custom theme entry point stub (Layout wrapper; full override in TASK-2)
- `the-codex/styles/globals.css` — global stylesheet including KaTeX CSS import
- `the-codex/Dockerfile` — multi-stage Docker build (builder + runner)
- `the-codex/docker-compose.yml` — `codex` + `nginx` services with health checks
- `the-codex/nginx/subdomain.conf` — Nginx server block for `docs.aerariumsaturni.com` (preferred topology)
- `the-codex/nginx/path-based.conf` — Nginx server block for `/wiki` path-based routing (secondary topology)
- `.github/workflows/ci.yml` — build-time guard (3-minute ceiling) and `lhci autorun` Lighthouse check (score ≥ 90)

**Out of scope:**

- Roman-aesthetic Nextra theme overrides (Layout, Navbar, Sidebar, Footer, CodeBlock) — TASK-2
- FlexSearch configuration and financial-term synonym tuning — TASK-2
- CSS scroll-container wrappers for wide block LaTeX — TASK-2
- Lucide React icon replacements — TASK-2
- User authentication — RFC out-of-scope
- Real-time market data — RFC out-of-scope

---

## Architecture

```txt
MDX Source Files (.mdx)
    │  inline: $...$   block: $$...$$
    │
    ▼
remark-math  (parse LaTeX delimiters before MDX/JSX compilation)
    │
    ▼
rehype-katex  (render parsed nodes to KaTeX HTML at build time)
    │
    ▼
next build  [timeout-minutes: 3, CI guard]
    │  → .next/standalone + public/
    │
    ▼
Docker — builder stage  (node:20-alpine, runs `next build`)
    │
    ▼
Docker — runner stage  (node:20-alpine, copies .next/standalone only)
    │
    ▼
docker compose up
    ├── codex  (internal port 3000, health-checked)
    └── nginx  (ports 80/443)
              │
              ├── subdomain routing:  docs.aerariumsaturni.com → codex:3000  [primary]
              └── path-based routing: /wiki/* → codex:3000 (basePath=/wiki)  [secondary]
```

### Plugin chain runs at build time, not in the browser

`remark-math` and `rehype-katex` execute during `next build`. All LaTeX is pre-rendered to static HTML+CSS — no client-side KaTeX JS bundle is shipped. The KaTeX stylesheet (`katex.min.css`) is loaded globally via `_app.tsx` import, which is the only KaTeX runtime cost.

---

## Tech Stack

New packages introduced:

| Package               | Version   | Justification                                                                   |
| --------------------- | --------- | ------------------------------------------------------------------------------- |
| `nextra`              | `>=2.13`  | Documentation framework on Next.js; MDX compilation, sidebar, FlexSearch        |
| `nextra-theme-docs`   | `>=2.13`  | Required peer for Nextra; used as stub in TASK-1, fully overridden in TASK-2    |
| `remark-math`         | `>=5.0`   | Intercepts `$...$` / `$$...$$` delimiters before MDX JSX compilation            |
| `rehype-katex`        | `>=6.0`   | Renders parsed LaTeX nodes to KaTeX HTML server-side at build time              |
| `katex`               | `>=0.16`  | KaTeX runtime; only its CSS is loaded at runtime — JS runs only at build time   |

---

## Implementation Details

### Modules / Files

| File                                        | Action | Description                                                               |
| ------------------------------------------- | ------ | ------------------------------------------------------------------------- |
| `the-codex/next.config.js`                  | Create | Nextra wrapper: theme entry point + remark-math/rehype-katex plugin chain |
| `the-codex/package.json`                    | Create | Node.js project manifest with all dependencies and build/dev scripts      |
| `the-codex/pages/_app.tsx`                  | Create | Global KaTeX CSS import; Next.js custom App wrapper                       |
| `the-codex/pages/_meta.json`                | Create | Nextra content tree: top-level navigation entries                         |
| `the-codex/pages/index.mdx`                 | Create | Documentation landing page                                                |
| `the-codex/pages/finance/black-scholes.mdx` | Create | Sample article: Black-Scholes with inline and block LaTeX                 |
| `the-codex/pages/finance/_meta.json`        | Create | Navigation entries for the finance section                                |
| `the-codex/theme/index.tsx`                 | Create | Custom theme entry point stub; exports a minimal Layout for TASK-1        |
| `the-codex/styles/globals.css`              | Create | Global stylesheet; imports `katex/dist/katex.min.css` and base resets    |
| `the-codex/Dockerfile`                      | Create | Multi-stage build: builder stage (`next build`) + minimal runner stage    |
| `the-codex/docker-compose.yml`              | Create | `codex` + `nginx` services with `depends_on` health check                 |
| `the-codex/nginx/subdomain.conf`            | Create | Nginx `server` block for subdomain routing (primary topology)             |
| `the-codex/nginx/path-based.conf`           | Create | Nginx `server` block for `/wiki` path-based routing (secondary topology)  |
| `.github/workflows/ci.yml`                  | Create | Build-time guard (`timeout-minutes: 3`) and `lhci autorun` step           |

---

### Key Configurations

**`the-codex/next.config.js`**

```js
const withNextra = require('nextra')({
  theme: 'nextra-theme-docs',
  themeConfig: './theme/config.js',
  mdxOptions: {
    remarkPlugins: [require('remark-math')],
    rehypePlugins: [require('rehype-katex')],
  },
})

module.exports = withNextra({
  output: 'standalone',
  // basePath: '/wiki',  // Uncomment to enable path-based routing topology
})
```

**`the-codex/Dockerfile`**

```dockerfile
# Stage 1: builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: runner — contains only compiled output
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

**`the-codex/docker-compose.yml`**

```yaml
services:
  codex:
    build: .
    expose:
      - "3000"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000"]
      interval: 30s
      retries: 3
    environment:
      - NODE_ENV=production

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/subdomain.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      codex:
        condition: service_healthy
```

**`the-codex/nginx/subdomain.conf`**

```nginx
server {
    listen 80;
    server_name docs.aerariumsaturni.com;

    location / {
        proxy_pass         http://codex:3000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

**`.github/workflows/ci.yml` (relevant steps)**

```yaml
jobs:
  build-and-lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        working-directory: the-codex
        run: npm ci

      - name: Build Codex
        working-directory: the-codex
        timeout-minutes: 3
        run: npm run build

      - name: Lighthouse CI
        working-directory: the-codex
        run: |
          npm install -g @lhci/cli
          lhci autorun
        env:
          LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}
```

**`the-codex/.lighthouserc.js`**

```js
module.exports = {
  ci: {
    collect: { staticDistDir: '.next' },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
      },
    },
  },
}
```

---

### Testing Strategy

**Build validation (CI — automated):**

The `timeout-minutes: 3` guard on the build step is the primary gating check. A clean exit within the window confirms the build ceiling constraint.

**Lighthouse CI (automated):**

`lhci autorun` runs against the static build output. A `performance` score below 0.9 fails the CI step.

**LaTeX rendering (manual):**

Navigate to `http://localhost/finance/black-scholes`. Verify:

- Inline formula `$C = S_0 N(d_1)$` renders as KaTeX HTML without visible `$` delimiters
- Block formula `$$C = S_0 N(d_1) - K e^{-rT} N(d_2)$$` renders as a full-width centred equation
- No `katex.js` bundle appears in the browser Network tab (build-time pre-rendering confirmed)

**Docker Compose smoke test (manual):**

```bash
cd the-codex
docker compose up --build -d
curl -sf http://localhost/finance/black-scholes | grep "katex"
```

Verify: `katex` CSS classes are present in the HTML response, confirming KaTeX rendered at build time.

**Path-based routing validation (manual):**

Uncomment `basePath: '/wiki'` in `next.config.js`, mount `nginx/path-based.conf`, rebuild, and confirm all internal navigation links resolve to `/wiki/*` without 404s.

**Edge cases:**

- Empty finance section — Nextra must not crash if `pages/finance/` contains only `_meta.json`; index page should still build
- `output: 'standalone'` with Nextra — if any MDX content file is read at runtime rather than build time, standalone mode will break; verify all content is embedded in the build output

---

### Open Questions / Risks

- [x] **Nextra major version:** Confirm whether Nextra `2.x` or `3.x` is the stable target before scaffolding — the plugin API and theme contract differ between major versions. Pin the chosen minor version in `package.json`. **Target:** before first commit. **Answer:** Use the version `4.x`.
- [x] **Standalone output + Nextra compatibility:** `output: 'standalone'` copies only `.next/standalone`; verify Nextra does not access MDX source files at runtime (it should not, since MDX compiles to JS at build time). **Target:** after first successful `next build`. **Answer:** Verify after the implementation.
- [x] **Docker health check without `/api/health`:** A statically generated Nextra site has no API routes by default. The health check must use an HTTP HEAD against `index.html` or a dedicated minimal API route must be added. **Target:** during Docker Compose implementation. **Answer:** Ensure an health check in the Docker Compose.
