# 02 — New Repo Audit & Conventions

**Repo:** `Sonder` (working directory `/Users/krishdembla/Documents/DSAIL/Sonder`)  
**Branch audited:** `migration/audit` (HEAD `5565108`)  
**Audit date:** 2026-10-13  
**Files reviewed:** 24 of 28 non-binary, non-generated source files  
**Skipped:** `app/favicon.ico` (binary), `public/.gitkeep`, `hooks/.gitkeep`, `components/.gitkeep`, `lib/.gitkeep` (empty markers — no logic), `.env` (forbidden by audit rules — only `.env.example` permitted; no `.env.example` exists), `next-env.d.ts` (generated), `pnpm-lock.yaml` (lockfile), `.agents/skills/**`, `.claude/skills/**`, `.windsurf/skills/**` (AI-tool skill definitions, not app code)

---

## 1. Template Identity

**This is a plain Next.js + shadcn/ui scaffold — not an Open WebUI fork.**

Evidence:
- `README.md:1` — "This is a Next.js template with shadcn/ui."
- `components.json:2` — `"$schema": "https://ui.shadcn.com/schema.json"`, `"style": "base-nova"`
- `app/page.tsx:3` — placeholder copy: "Project ready! You may now add components and start building."
- `app/layout.tsx:18` — metadata title: `"Clerk Next.js Quickstart"` (still the Clerk quickstart default)
- No chat routes, no WebSocket code, no Open WebUI files anywhere in the tree.

The one non-trivial addition on top of a bare scaffold is **Clerk auth** wired into the layout and a misnamed middleware file (see §5.2).

---

## 2. Exact Stack Versions

All versions from `package.json`.

| Package | Version (package.json) | Notes |
|---|---|---|
| `next` | `16.3.4` | Pinned exact version |
| `react` / `react-dom` | `19.2.8` | Pinned exact version |
| `typescript` | `^5` | devDep |
| `tailwindcss` | `^4` | Tailwind v4 — different config model from v3 |
| `@tailwindcss/postcss` | `^4` | devDep; replaces old PostCSS plugin |
| `prisma` | `8.1.0-dev.7` | **Pre-release dev build — devDep** |
| `@clerk/nextjs` | `^7.9.7` | Auth provider (see §5 — conflict with plan) |
| `@base-ui/react` | `^1.8.0` | Headless UI primitives used by shadcn "base-nova" style |
| `class-variance-authority` | `^0.7.1` | CVA for variant styling |
| `cn` | `^0.4.0` | Utility package (replaces the usual `clsx + tailwind-merge`) |
| `lucide-react` | `^1.48.0` | Icon library |
| `next-themes` | `^0.4.6` | Dark/light mode |
| `shadcn` | `^4.21.0` | CLI for adding components |
| `tw-animate-css` | `^1.4.0` | Tailwind animation utilities |
| `eslint` | `^10` | devDep |
| `eslint-config-next` | `16.3.4` | devDep; pinned to match Next.js |
| `prettier` | `^3.9.6` | devDep |
| `prettier-plugin-tailwindcss` | `^0.8.1` | devDep |
| **Package manager** | pnpm (see `pnpm-workspace.yaml`, `pnpm-lock.yaml`) | Not npm or yarn |

---

## 3. Folder Structure

```
Sonder/
├── app/                        # Next.js App Router root
│   ├── globals.css             # Tailwind v4 + shadcn CSS variables (single source of truth)
│   ├── layout.tsx              # Root layout; ClerkProvider wraps everything
│   ├── page.tsx                # Placeholder home page
│   └── favicon.ico
├── components/
│   ├── ui/
│   │   └── button.tsx          # Only shadcn component added so far
│   └── theme-provider.tsx      # Dark-mode wrapper (NOT yet wired into layout)
├── hooks/                      # Empty (.gitkeep)
├── lib/
│   └── utils.ts                # Exports cn from the "cn" npm package
├── prisma/
│   └── schema.prisma           # Skeleton only; no models, no migrations
├── public/                     # Empty (.gitkeep)
├── docs/
│   └── migration/
│       ├── 01-old-system-inventory.md
│       ├── 02-new-repo-conventions.md   ← this file
│       └── 03-gaps-and-risks.md
├── proxy.ts                    # MISNAMED: contains Clerk middleware (see §5.2)
├── prisma7.config.ts           # MISNAMED: uses Prisma 8 config API (see §5.3)
├── next.config.ts              # Empty config object
├── tsconfig.json               # Strict mode, "bundler" resolution, @/* paths alias
├── eslint.config.mjs           # next/core-web-vitals + next/typescript
├── .prettierrc                 # LF, no semis, 2-space, trailing commas, TW plugin
├── postcss.config.mjs          # @tailwindcss/postcss only
├── components.json             # shadcn CLI config
├── pnpm-workspace.yaml         # Single-package workspace; blocks Prisma native builds
├── AGENTS.md                   # AI-agent warning: "read next docs before writing code"
├── skills-lock.json            # Prisma skill definitions for AI tools
└── package.json
```

No `app/api/` directory exists. There are no API routes, no server actions, and no route handlers.

---

## 4. Tailwind Setup

**Version:** Tailwind v4 — CSS-first configuration, no `tailwind.config.js`.

| File | Role |
|---|---|
| `app/globals.css` | Single config file. Uses `@import "tailwindcss"`, `@import "tw-animate-css"`, `@import "shadcn/tailwind.css"`. Theme tokens defined with `@theme inline {}`. All color/radius/sidebar tokens expressed as CSS custom properties via `oklch()`. |
| `postcss.config.mjs` | Plugin: `@tailwindcss/postcss` only. |
| `.prettierrc` | `prettier-plugin-tailwindcss` active; auto-sorts class names; uses `app/globals.css` as the stylesheet reference; `tailwindFunctions: ["cn", "cva"]`. |

**shadcn style: `"base-nova"`** (`components.json:3`)

This is a newer shadcn style that uses **`@base-ui/react`** (Base UI by MUI) for headless primitives, not Radix UI. The `button.tsx` component imports `ButtonPrimitive` from `@base-ui/react/button`. Contributors expecting the standard Radix-based shadcn pattern will find unfamiliar APIs. All future `shadcn add` commands will scaffold Base UI–based components.

**Dark-mode:** `next-themes` via `ThemeProvider` (`components/theme-provider.tsx`). The `d` key toggles dark/light mode. **`ThemeProvider` is defined but is NOT wrapped in `app/layout.tsx`** — dark mode is currently non-functional.

---

## 5. Bugs and Misconfigurations Found

### 5.1 `app/layout.tsx` — stale template metadata

`app/layout.tsx:18` — metadata title is `"Clerk Next.js Quickstart"`, description is `"Generated by create next app"`. These are placeholder values from the Clerk quickstart template and must be replaced.

### 5.2 `proxy.ts` — Clerk middleware is in the wrong file at the wrong path

`proxy.ts` (root) contains `clerkMiddleware()` and exports a `config.matcher`. **Next.js only recognizes middleware at `middleware.ts` (or `middleware.js`) in the project root.** A file named `proxy.ts` is not loaded as middleware. As a result:

- Clerk auth is NOT protecting any routes.
- `app/layout.tsx` wraps in `<ClerkProvider>` and renders `SignInButton`/`UserButton`, but no server-side auth enforcement is active.
- This file must be renamed to `middleware.ts`.

### 5.3 `prisma7.config.ts` — misnamed and uses Prisma 8 API

The file is named `prisma7.config.ts` but imports from `prisma/config` and calls `defineConfig()` — which is the **Prisma 8** configuration API (not Prisma 7). The name is misleading. Additionally:

- It imports `"dotenv/config"` (`prisma7.config.ts:3`), but `dotenv` is not in `package.json`. Running `prisma migrate` with this config will fail unless dotenv is installed.
- The datasource `url` is read from `process.env["DATABASE_URL"]`, but `prisma/schema.prisma` has no `url` field in the datasource block (see §6).

### 5.4 `prisma/schema.prisma` — incomplete datasource, no models, no migrations

```prisma
datasource db {
  provider = "postgresql"
  // url field is missing
}
```

- No `url` field. Prisma requires a `url` to connect. The value lives in `prisma7.config.ts`, not in the schema, because Prisma 8's external config file can supply it — but the schema file as written is incomplete and will produce errors with Prisma 7 or any older tooling.
- No models defined.
- No `prisma/migrations/` directory — zero migrations have been run.
- Prisma client output path: `../lib/generated/prisma` (`schema.prisma:8`). This path is gitignored (`.gitignore:38`).

### 5.5 `pnpm-workspace.yaml` — Prisma native binary builds are blocked

```yaml
allowBuilds:
  '@prisma/engines': false
  prisma: false
```

`pnpm-workspace.yaml:5–8` explicitly prevents pnpm from building Prisma's native engine binaries. This means `pnpm install` will not compile the native query engine. This is intentional for environments that use Prisma's WASM engine or a driver adapter, but no driver adapter is configured yet. Running `prisma generate` or `prisma migrate` may fail until this is resolved.

### 5.6 `ThemeProvider` defined but not mounted

`components/theme-provider.tsx` exists and renders the dark-mode hotkey, but it is never imported or used in `app/layout.tsx`. The theme system is wired up but dormant.

---

## 6. Prisma Schema and Migrations

| Item | Status |
|---|---|
| Schema file | `prisma/schema.prisma` — skeleton only |
| Provider | `postgresql` |
| URL | Not in schema; supplied via `prisma7.config.ts` → `process.env.DATABASE_URL` |
| Models | None defined |
| Migrations | None — `prisma/migrations/` directory does not exist |
| Client output | `lib/generated/prisma` (gitignored) |
| Prisma version | `8.1.0-dev.7` (pre-release dev build) |

No database schema has been designed for the new application.

---

## 7. Auth / Supabase

**Auth provider present: Clerk** (`@clerk/nextjs@^7.9.7`), NOT Supabase.

| File | What it does |
|---|---|
| `proxy.ts` | `clerkMiddleware()` — **inactive** because the file is misnamed (see §5.2) |
| `app/layout.tsx` | `<ClerkProvider>` wraps the entire app; renders `SignInButton`, `SignUpButton`, `UserButton` conditionally via Clerk's `<Show>` component |

**There is no Supabase dependency in the repo.** `@supabase/supabase-js` and `@supabase/ssr` are not in `package.json`. No Supabase client code exists anywhere.

**RLS policies:** None — Supabase is not installed, so there are no Supabase tables and no RLS policies. UNVERIFIED whether a Supabase project has been created externally.

**Conflict with the migration plan:** `docs/migration/03-gaps-and-risks.md §1.1` describes porting auth to **Supabase Auth**. The template as built uses Clerk instead. Before any auth work begins, the team must decide: keep Clerk (and revise the plan in `03`), or remove Clerk and add Supabase.

---

## 8. Environment Variables

**No `.env.example` exists.** `.gitignore:24` ignores all `.env*` files, and no example template was committed.

Variables referenced in source:

| Variable | Where referenced | Required for |
|---|---|---|
| `DATABASE_URL` | `prisma7.config.ts:12` | Prisma DB connection |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Expected by `@clerk/nextjs` (UNVERIFIED — not found in source scan but required by Clerk SDK) | Clerk client-side key |
| `CLERK_SECRET_KEY` | Expected by `@clerk/nextjs` server SDK (UNVERIFIED) | Clerk server-side key |

Variables from the old system that must be added for model integration (not yet present):

| Variable | Purpose (from `01-old-system-inventory.md §B11`) |
|---|---|
| `OLLAMA_HOST` | LLaMA endpoint (`http://localhost:11434` on Jetstream2) |
| `VLLM_HOST` | Mistral/vLLM endpoint (`http://localhost:8001` on Jetstream2) |
| `MODEL_NAME` | Ollama model tag |
| `VLLM_MODEL_NAME` | vLLM served model name |

**Action required:** Create `.env.example` with all of the above (values redacted/documented), commit it, and add `.env.local` to `.gitignore` (it is already covered by `.env*`).

---

## 9. Lint / Typecheck / Test / Dev / Build Commands

From `package.json:6–12`:

| Command | What it runs |
|---|---|
| `pnpm dev` | `next dev` — starts dev server (Turbopack is not explicitly enabled but Next.js 16 may default to it) |
| `pnpm build` | `next build` |
| `pnpm start` | `next start` |
| `pnpm lint` | `eslint` (uses `eslint.config.mjs`; checks `next/core-web-vitals` + TypeScript rules) |
| `pnpm format` | `prettier --write "**/*.{ts,tsx}"` |
| `pnpm typecheck` | `tsc --noEmit` (strict mode via `tsconfig.json`) |

**No test framework.** There is no `test` script, no Jest/Vitest config, and no test files. The old system had 6 test files covering guardrails, history, auth, registry, query rewriter, and streaming. All of those need to be re-created in TypeScript.

---

## 10. Deployment Target and Configuration

**No deployment configuration exists.** None of the following files are present:

| File | Status |
|---|---|
| `vercel.json` / `vercel.ts` | Absent |
| `Dockerfile` / `docker-compose.yml` | Absent |
| `.github/workflows/` | Absent (no `.github` dir in the repo root) |
| Heroku / Railway / Render config | Absent |

`docs/migration/03-gaps-and-risks.md §6.1` lists the deployment host as **UNVERIFIED**: "Vercel? A VM? The same Jetstream2 allocation?"

`README.md` mentions no deployment instructions. The only deployment signal is that the `pnpm-workspace.yaml` blocks native binary builds (compatible with Vercel's serverless environment, which prefers WASM Prisma engines), but this is circumstantial.

**AGENTS.md note:** `AGENTS.md:4` warns AI agents to read `node_modules/next/dist/docs/` before writing code, signaling that this Next.js version has breaking-change APIs.

---

## 11. TypeScript Configuration

`tsconfig.json`:

| Setting | Value | Implication |
|---|---|---|
| `strict` | `true` | All strict checks enabled |
| `noEmit` | `true` | Build output via Next.js only, not `tsc` |
| `module` | `esnext` | ESM only (aligns with `"type": "module"` in `package.json`) |
| `moduleResolution` | `bundler` | Next.js/Turbopack resolution semantics |
| `target` | `ES2017` | |
| `paths` | `@/* → ./*` | Root-relative imports; `@/components`, `@/lib`, etc. |
| `plugins` | `[{ name: "next" }]` | Next.js LSP plugin for route/type generation |
| `incremental` | `true` | `.tsbuildinfo` cache (gitignored) |

---

## 12. ESLint and Prettier Conventions

**ESLint** (`eslint.config.mjs`):
- Flat config format (ESLint v10).
- Rule sets: `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`.
- Ignores: `.next/`, `out/`, `build/`, `next-env.d.ts`.

**Prettier** (`.prettierrc`):
- No semicolons (`"semi": false`)
- Double quotes (`"singleQuote": false`)
- 2-space indent
- LF line endings
- Trailing commas: `"es5"`
- 80-character print width
- `prettier-plugin-tailwindcss` auto-sorts Tailwind classes
- `tailwindFunctions: ["cn", "cva"]` — class sorting applies inside these calls

`.prettierignore` excludes `dist/`, `node_modules/`, `.next/`, `.turbo/`, `coverage/`, `pnpm-lock.yaml`, `.pnpm-store/`.

---

## 13. Path Aliases and Import Conventions

The `@/*` alias resolves to the project root (`tsconfig.json:22`). Established aliases from `components.json:15–21`:

| Alias | Resolves to |
|---|---|
| `@/components` | `components/` |
| `@/components/ui` | `components/ui/` |
| `@/lib` | `lib/` |
| `@/lib/utils` | `lib/utils.ts` |
| `@/hooks` | `hooks/` |

`lib/utils.ts` currently only re-exports `cn` from the npm package `cn`. This is different from the common shadcn boilerplate (`clsx` + `tailwind-merge`); the `cn` package bundles both.

---

## 14. Conventions a New Contributor Must Follow

1. **Package manager: pnpm only.** Use `pnpm add`, `pnpm install`, `pnpm dev`. Do not use npm or yarn — `pnpm-lock.yaml` tracks the lockfile.

2. **Next.js App Router.** All pages go in `app/`. No `pages/` directory. API routes go in `app/api/`.

3. **Tailwind v4.** No `tailwind.config.js`. All custom tokens are CSS custom properties in `app/globals.css`. Add theme tokens inside `@theme inline {}`.

4. **shadcn "base-nova" style.** Add components with `npx shadcn@latest add <component>`. Primitives come from `@base-ui/react`, not Radix. Do not mix Radix-based components from older shadcn docs.

5. **`cn` import.** Import the class-name utility as `import { cn } from "cn"`, or via the alias `import { cn } from "@/lib/utils"`. Do not add `clsx` or `tailwind-merge` separately — they are bundled inside `cn`.

6. **Strict TypeScript.** `strict: true` is enforced. `pnpm typecheck` must pass before merging.

7. **No semicolons.** Prettier enforces `"semi": false`. Let Prettier format — `pnpm format` before committing.

8. **ESM only.** `"type": "module"` in `package.json`. Use `import`/`export` — no `require()`.

9. **Clerk auth.** `app/layout.tsx` wraps in `<ClerkProvider>`. The Clerk middleware file needs to be at `middleware.ts` (currently broken — see §5.2). Server components can call `await currentUser()` or `await auth()` from `@clerk/nextjs/server`.

10. **Prisma client output.** Generated to `lib/generated/prisma` (gitignored). Run `pnpm prisma generate` after schema changes.

11. **Model calls are server-only.** Following the rule from the old system and `03-gaps-and-risks.md §4`: `OLLAMA_HOST` and `VLLM_HOST` are server-only env vars. Model endpoints must be called from Next.js Route Handlers in `app/api/`, never from client components or browser fetch.

12. **AGENTS.md warning applies to human contributors too.** Next.js 16 has API changes from earlier versions. Check `node_modules/next/dist/docs/` for current behavior before using APIs known from Next.js 14/15.

---

## 15. Conflicts With the Planned Work

| # | Conflict | Location | Required Decision |
|---|---|---|---|
| 1 | **Auth provider mismatch.** Template uses **Clerk**; migration plan (`03 §1.1`) targets **Supabase Auth**. These are incompatible. Keeping both would require a custom Prisma auth layer on top of one of them. | `app/layout.tsx`, `proxy.ts`, `package.json` | Choose one: Clerk (revise `03`) or Supabase Auth (remove Clerk, add `@supabase/ssr`). |
| 2 | **Middleware is broken.** `proxy.ts` contains Clerk middleware but is not at `middleware.ts`. No routes are protected. | `proxy.ts` | Rename `proxy.ts` → `middleware.ts`. |
| 3 | **Prisma 8 pre-release.** `prisma@8.1.0-dev.7` is a dev build. Prisma 8 is a different major version from Prisma 7 (referenced in `prisma7.config.ts`). The team must decide which version to commit to — Prisma 8 (accept pre-release risk) or Prisma 7 (downgrade, remove the dev build). | `package.json`, `prisma7.config.ts` | Pin a stable version or explicitly accept the dev build. |
| 4 | **`dotenv` missing.** `prisma7.config.ts` imports `"dotenv/config"` but `dotenv` is not in `package.json`. `prisma migrate` will throw `Cannot find module 'dotenv/config'`. | `prisma7.config.ts:3`, `package.json` | Add `dotenv` as a devDependency, or rewrite the config to not need it. |
| 5 | **Prisma datasource has no `url`.** `prisma/schema.prisma` is missing the `url` field. This is valid only if the external config file always supplies it — but that's a Prisma 8–only feature. | `prisma/schema.prisma:12–14` | Add `url = env("DATABASE_URL")` to the datasource block for compatibility. |
| 6 | **No `.env.example`.** Contributors cannot know which env vars to set. | Root | Create `.env.example`. |
| 7 | **No API routes.** No `app/api/` directory, no `/api/chat` route, no model proxy. All model integration work starts from zero. | `app/` | Expected — this is day one. Just document it. |
| 8 | **No tests.** The old system had 6 pure-unit test files. No test runner is configured in the new stack. | `package.json` | Add Vitest or Jest before porting logic. |
| 9 | **`ThemeProvider` not mounted.** Dark mode is wired but not active. | `app/layout.tsx`, `components/theme-provider.tsx` | Wrap `children` in `<ThemeProvider>` inside `app/layout.tsx`. |
| 10 | **Deployment target unknown.** No CI, no `vercel.json`, no Dockerfile. The model-endpoint connectivity problem (`03 §4`) cannot be solved until the hosting platform is decided. | — | Decide and document the hosting target. |

---

## Summary of Findings

The new repo is a **bare Next.js 16 + shadcn/ui scaffold** with Clerk auth partially wired and Prisma added but unconfigured. It is not a fork of anything — it is a fresh template, confirmed by placeholder text and the absence of any chat UI, API routes, or database models. 24 of 28 reviewable files were read; 4 skipped (binary or empty markers).

**Five bugs need fixing before any feature work can begin:**

1. Rename `proxy.ts` → `middleware.ts` so Clerk actually protects routes.
2. Add `dotenv` to devDependencies (or rewrite `prisma7.config.ts`).
3. Add `url = env("DATABASE_URL")` to `prisma/schema.prisma`.
4. Add `ThemeProvider` to `app/layout.tsx`.
5. Create `.env.example`.

**Two architectural decisions block all further work:**

1. **Auth provider:** Clerk (in the template) vs. Supabase Auth (in the migration plan). Pick one before writing any auth code.
2. **Deployment host:** Vercel / VM / Jetstream2? This determines how the Next.js server reaches Ollama and vLLM, which are `127.0.0.1`-only on Jetstream2 and not reachable from any other host without a tunnel or VPN.

---

## Open Questions for the Team

1. **Clerk or Supabase Auth?** The template ships Clerk; the migration plan assumed Supabase. Is Clerk acceptable, or should it be replaced?

2. **Prisma 8 dev build or downgrade?** `8.1.0-dev.7` is pre-release. Is the team comfortable shipping on a dev build, or should it be pinned to the latest stable Prisma 7 or Prisma 8 GA?

3. **Where will the Next.js app be hosted?** Vercel is implied by the stack and pnpm workspace config (blocks native Prisma binaries, consistent with Vercel's serverless environment), but nothing is configured. This must be resolved before model integration begins.

4. **How does the Next.js server reach Ollama and vLLM?** Both are `127.0.0.1`-only on Jetstream2. If the Next.js app runs on Vercel, a Tailscale/WireGuard VPN or SSH tunnel is required. This is the single largest infrastructure gap (carried over from `03 §4`).

5. **Prisma 8 WASM engine or driver adapter?** The `pnpm-workspace.yaml` blocks native Prisma engine builds. This implies the team intends to use Prisma's WASM query engine or a driver adapter (e.g. `@prisma/adapter-neon`). Which database is the Postgres target — Supabase-hosted Postgres, Neon, or something else?

6. **Is `dotenv` intentional in `prisma7.config.ts`?** In a Next.js project, env vars are loaded automatically by Next.js. Loading `dotenv/config` manually in the Prisma config is only needed when running Prisma CLI commands outside the Next.js runtime. If that's the intent, add `dotenv` as a devDependency. If not, remove the import.

7. **Should Supabase be added for RLS-protected storage even if Clerk handles auth?** The migration plan calls for Supabase Postgres with RLS for conversation data. This could co-exist with Clerk auth (Clerk for sessions, Supabase Postgres as the database via Prisma). Confirm whether Supabase is the Postgres target or whether a different Postgres host is intended.
