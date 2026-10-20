# CLAUDE.md: Sonder (MHAI-Pal web app)

Read this fully at the start of every session. Then read `docs/migration/04-build-spec.md` and work only on the slice you are told to.

## What this is
A research prototype from the IU DSAIL lab: a web interface that exposes the lab's mental health LLMs. It has a patient side (AI companion chat) and a clinician side (review, summaries, risk alerts). It replaces an older Python/Chainlit app. The old app's behavior is documented in `docs/migration/01-old-system-inventory.md` and `03-gaps-and-risks.md`. The old code is the source of truth for exact strings and logic (see "Porting").

This is research software with a mental health audience. Prototype data only: synthetic or test conversations, never real patient or client data, until the lab confirms IRB sign-off (the old docs cite IRB protocol 22721).

## Stack (decided)
- Next.js 16 App Router, React 19, TypeScript strict, ESM only, pnpm only.
- Tailwind v4 (CSS-first, tokens in `app/globals.css`), shadcn "base-nova" style (Base UI primitives, NOT Radix).
- Auth: Clerk (`@clerk/nextjs`). Roles live in our own database, not in Clerk.
- Database: Supabase Postgres accessed ONLY through Prisma (`DATABASE_URL`). Do not add `@supabase/supabase-js` or `@supabase/ssr`.
- Models: plain `fetch` to Ollama and vLLM from server route handlers. No AI SDK, no hosted model APIs.
- Tests: Vitest.
- Jetstream2 hosts the models only. No app code runs there.

## Hard rules (do not break; if a task seems to require it, stop and ask)
1. Model endpoints are server-only. `OLLAMA_HOST`, `VLLM_HOST` and similar are never `NEXT_PUBLIC_*`, never reach the browser, and are called only from `app/api/**` route handlers. Model servers bind to localhost on Jetstream2, never 0.0.0.0.
2. Crisis check first. In the chat route handler, `isCrisis()` runs on the RAW user text before rewriting, before history is built, and before any model call.
3. Raw user messages are always stored and shown. Query rewrites are model input only. Never mutate the shared history array; build a copy for the model.
4. Verbatim strings. The Mistral system prompt, the V4 query-rewriter prompt, `CRISIS_PHRASES`, `CRISIS_RESPONSE` and `CRISIS_FOLLOWUP` are copied byte-for-byte from the old repo. A test must assert exact equality (or a SHA-256 of the old string). Never "improve" them.
5. The rewriter fails safe: any error or timeout returns the original message.
6. Preserve vLLM request details: `continue_final_message: true` when prefilling the assistant turn, stop tokens `[INST]` and `[/INST]`, the CJK language-matching prefill.
7. Send the full conversation history to the model each turn. Do not truncate to the last N messages unless the spec says so.
8. No third-party model, moderation, analytics or session-replay service may receive message content.
9. Never log message content (no `console.log` of user text, no error reports containing it).
10. Authorization: never trust the client for role or ownership. Every route handler and server action checks (a) signed in, (b) role from the `profiles` table, (c) ownership: a patient reaches only their own conversations; a clinician reaches only assigned patients. Default role is `patient`. A user cannot choose or change their own role.
11. Secrets: never commit `.env*` (only `.env.example`), never print env values, never put keys in client code.

## Process rules
- One slice at a time. At the end of a slice: run `pnpm typecheck`, `pnpm lint` and `pnpm test`; fix failures; commit with message `slice N: <summary>`; then STOP and report. Do not start the next slice.
- Your final report for each slice lists: what changed (files), what you verified and how, what you could not verify (mark UNVERIFIED), and any decision you need from me.
- Do not guess. If something cannot be confirmed from files, docs or a test, mark it UNVERIFIED.
- Next.js and Prisma versions here are newer than most documentation. Before using or "fixing" a Next.js or Prisma API, read the installed docs (`node_modules/next/dist/docs/`, and the Prisma docs for the installed version). The audit's claims about `proxy.ts` vs `middleware.ts`, a missing Prisma datasource `url`, and the `prisma7.config.ts` file name are UNVERIFIED. Test them; do not apply them on the audit's say-so.
- Add a dependency only with a stated reason. No new auth, UI or state libraries without asking.
- Never modify the old repo. It is read-only reference.
- When unsure about intended behavior, read `docs/migration/01-old-system-inventory.md` first, then the old code, then ask.

## Porting from the old repo
Old repo (read-only): `/Users/krishdembla/Documents/DSAIL/dsail-mhLLM-interface`, branch `feat/mistral-integration`. If you need exact strings or logic, ask me to restart you with `claude --add-dir <that path>`, then copy constants verbatim. File map is in `01-old-system-inventory.md` (for example `utils/guardrails.py`, `models/mistral_mental_health/query_rewriter.py:58-65`, `utils/history.py`, `utils/streaming.py`).

## Conventions
- Prettier: no semicolons, double quotes, 2 spaces, LF, trailing commas es5, 80 columns. Run `pnpm format` before committing.
- Imports use the `@/` alias (`@/components`, `@/lib`, `@/hooks`). Use `cn` from `@/lib/utils`; do not add `clsx` or `tailwind-merge`.
- Add UI components with `npx shadcn@latest add <name>`.
- Pages and layouts in `app/`, API routes in `app/api/`.
- Suggested layout: `lib/guardrails/`, `lib/history/`, `lib/streaming/`, `lib/models/` (registry, handlers, prompts, rewriter), `lib/auth/` (profile and role helpers), `lib/db/` (Prisma client), `components/chat/`, `components/safety/`, `components/clinician/`.
- Tests sit next to the code as `*.test.ts`. Pure logic gets unit tests; model servers are mocked, so tests never need a GPU.
- No em dashes in user-facing copy or docs; write in plain, calm language, especially in anything a patient sees.

## Environment
Variables (names only; values live in `.env.local`, listed in `.env.example`): `DATABASE_URL` (pooled), `DIRECT_URL` (migrations, if needed by the installed Prisma setup), `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `OLLAMA_HOST`, `MODEL_NAME`, `VLLM_HOST`, `VLLM_MODEL_NAME`, `MISTRAL_MAX_TOKENS`, `MISTRAL_TEMPERATURE`, `REWRITER_MODEL`, `REWRITE_TIMEOUT`, `MIN_CHUNK_DELAY`, `PER_CHAR_DELAY`, `CHUNK_DELAY_JITTER`, `CRISIS_FOLLOWUP_DELAY`.

In development, model endpoints are reached through an SSH tunnel to the Jetstream2 instance, forwarding local ports to 11434 (Ollama) and 8001 (vLLM). Hosting for deployed use is not decided yet; keep every model URL in env so it can change without code changes.
