# 04: Build Spec (Sonder)

Inputs: `01-old-system-inventory.md` (what exists), `02-new-repo-conventions.md` (the scaffold), `03-gaps-and-risks.md` (port map and risks). Standing rules are in `CLAUDE.md`. Work one slice per session. Each slice ends with typecheck, lint and tests passing, a commit, and a report.

## Decisions already made
| Topic | Decision |
|---|---|
| Auth | Clerk. Roles in our own `profiles` table keyed by Clerk user ID. Default role patient. Clinician set by hand by an admin, never by the user. |
| Database | Supabase Postgres via Prisma only. No supabase-js. Enable RLS on all tables with no policies, and turn off the project's Data API in the Supabase dashboard (manual step for Krish) so the public key cannot reach the tables. App code does the real authorization. |
| Prisma | Stable version if one exists for the features needed, with a driver adapter (the pnpm workspace blocks native engine builds). Verify against installed docs, do not trust the audit. |
| Models | Plain `fetch` in route handlers, SSE to the browser. `paced()` ported to TypeScript. |
| Crisis follow-up | Client-side 45 s timer plus the always-visible crisis button. Known limit: does not fire if the tab closes. |
| Feedback (thumbs and comments) | Visual only, as in the old app. No table until IRB documentation covers it. |
| Phase 2 variants | A flags table in our database, read per user or session. No third-party flag service. |
| Hosting | Not decided. Dev uses an SSH tunnel. All model URLs in env. |
| Old test accounts and conversations | Not migrated. Users re-register. |

## Slice 0: Make the scaffold healthy
Goal: a clean base the other slices can trust.
- Run install, `pnpm typecheck`, `pnpm lint`, `pnpm dev`. Report any failures.
- Next.js auth file: read the installed Next.js docs and determine the correct file name for request interception (`proxy.ts` vs `middleware.ts`). Do not rename unless the docs say to. Configure Clerk so that everything except sign-in, sign-up and a public landing page requires a signed-in user. Prove it: add a protected test route; an unauthenticated request must redirect to sign-in.
- Prisma: determine what is installed and what the config file must be called. Pin to a stable release if one works; if only the dev build works, keep it and report. Make `prisma generate` succeed with a driver adapter for Postgres. Add `dotenv` only if the installed setup needs it. Do not add `url` to the schema unless the installed version requires it.
- Create `.env.example` with every variable name in `CLAUDE.md` and short comments. Real values never committed.
- Mount `ThemeProvider` in `app/layout.tsx`. Replace the Clerk quickstart title and description with "Sonder" metadata.
- Add Vitest with one smoke test and a `pnpm test` script.
- Commit `CLAUDE.md` and `docs/migration/*`.
Acceptance: typecheck, lint, test pass; unauthenticated access to the protected test route redirects; `prisma generate` runs. Report how each of the audit's five "bugs" turned out (real, not real, or UNVERIFIED).
Out of scope: any feature.

## Slice 1: Profiles and roles
- Prisma model `Profile` (id = Clerk user ID, `role` enum `PATIENT | CLINICIAN | ADMIN` default `PATIENT`, optional display name, createdAt).
- `lib/auth`: `getCurrentProfile()` that creates the profile on first sign-in, `requireRole(...)`, and an ownership helper. No webhook needed yet.
- Route groups for the patient area and the clinician area; role guards on both. Clerk sign-in and sign-up on separate pages, matching the old Log In / Sign Up split.
- Admin role changes happen by direct database edit for now; no UI.
- Note for Krish (manual): in the Clerk dashboard, enable username and password sign-in; email optional if available.
Acceptance: unit tests for the role guard; manual check that a patient cannot open clinician pages and the reverse.

## Slice 2: Database schema
- Models: `Conversation` (id, userId to Profile, title, model id, `setup` JSON for avatar, name and userName, createdAt, updatedAt), `Message` (id, conversationId, role `USER | ASSISTANT`, content, model id, createdAt), `ClinicianAssignment` (clinicianId, patientId, createdAt).
- First migration. Enable RLS on every table via SQL in the migration.
- Query helpers that always take the acting profile and enforce ownership (patient: own rows only; clinician: assigned patients only).
Acceptance: migration applies to a dev database; tests on the ownership helpers (using a test database or mocks) prove cross-user access fails.

## Slice 3: Port the pure logic, with tests
Port from the old repo, copying constants verbatim, and port the old tests:
- `lib/guardrails`: `CRISIS_PHRASES` (56), `normalize`, `isCrisis`, `matchedPhrases`, `CRISIS_RESPONSE`, `CRISIS_FOLLOWUP`.
- `lib/history`: `sanitize`, `coalesce`, `forModel`.
- `lib/streaming`: `flushBoundary`, `paced` (use `await new Promise(r => setTimeout(r, ms))`; pacing env vars).
- `lib/models/prompts`: Llama system prompt, Mistral system prompt, V4 rewriter prompt.
- `lib/models/rewriter`: `clean`, fail-safe behavior, timeout.
- `lib/models/registry`: model ids, labels, `resolve()` falling back to the default.
Acceptance: all ported tests pass; a test asserts exact equality (or SHA-256) of the three prompts against the old repo's text; no Chainlit-style session state anywhere.

## Slice 4: Llama chat end to end
- `POST /api/chat`: auth, role and ownership checks; crisis check first (hard rule 2); store the user message; build full history; call Ollama `/api/chat` (streaming NDJSON); `paced()`; stream to the browser over SSE; store the assistant message when the stream completes. On client abort, do not store a partial reply.
- If the message is a crisis: store it and the canned response, return a `crisis` event, make no model call.
- Chat UI: bottom-anchored message list, composer, typing indicator, client-side quiet-window debounce and abort on new input (see `03` section 1.10 for `QUIET_WINDOW` and `HOLD_AFTER_COMPLETE`; propose your approach before coding if the semantics are unclear).
- Friendly error if the model is unreachable; no message content in logs.
Acceptance: end to end against a mocked model server in tests; manual run against the real model over the tunnel.

## Slice 5: Conversations
- Sidebar list (newest first), new conversation, rename, delete, resume at `/chat/[id]` with full history reload.
- Conversation setup card (avatar, name, userName) saved to `Conversation.setup`; greeting message; avatar images copied from the old `public/avatars`.
- Selected model stored per conversation.
Acceptance: a user sees only their own conversations; delete removes messages; reload restores state.

## Slice 6: Mistral path and model selector
- vLLM handler (SSE) with `continue_final_message`, stop tokens, `_drop_until_first_user` equivalent, CJK detection and language-matched prefill, `MISTRAL_*` env vars.
- Query rewriter wired in: crisis check on raw text first, rewrite goes only into a local copy for the model.
- Model selector component; unknown ids resolve to the default; switching mid-conversation keeps history.
- Registry stays extensible for the two remaining lab models.
Acceptance: handler tests with a mocked vLLM stream; rewriter failure path returns the original message; shared history is never mutated (test).

## Slice 7: Safety UI
- Persistent crisis resources button and modal (988, 741741, 911 as in the old app), quick exit button, About/disclaimer modal. Shown on chat routes only, not on sign-in.
- Client-side 45 s follow-up timer after a crisis message; sends `CRISIS_FOLLOWUP` once and opens the resources modal. Suppress the model-switch notice while a crisis is active.
Acceptance: component tests for visibility rules; timer test with fake timers.

## Deferred features (post-current-work)

These features existed in the old app but are intentionally not being built now. Revisit once slices 7 polish and 8 are complete.

| Feature | Old app behavior | Why deferred |
|---|---|---|
| Per-message feedback row (thumbs up/down + copy) | Visual-only in the old app; ratings and comments were never persisted (`public/app.js:229`) | Needs IRB documentation before any comments (which may contain mental health content) are stored; low priority while core chat is still being polished |
| "Account created" toast | Fired once on first sign-in via `context.emitter.send_toast()` | Minor UX nicety; Clerk's own redirect flow is sufficient for now; add when there is a shadcn Toast component in place |

---

## Slice 8: Clinician side
Do not start this slice until Krish and Claude (chat) have written `docs/migration/05-clinician-spec.md` from the Phase 1 matrix. Planned parts, each its own session:
- 8a Assignments and a clinician patient list.
- 8b Session summary: concise, structured, generated for the clinician only (matrix: Kampman 2024, Rollwage 2023, Zou 2026; analogical).
- 8c Reviewing AI replies before they reach the patient (therapist-in-the-loop mode).
- 8d AI rationale shown with each draft, with edit and override.
- 8e Tiered risk alert: interruptive for the highest risk, passive for lower; separate depression and suicide-risk alerts. Needs a `CrisisEvent` model storing a flag and timestamp, not the matched phrases. Evidence for the alert design is analogical; the chatbot-to-clinician handoff has no direct evidence.
- 8f Feature flags for the open matrix cells (avatar, message pacing, alert style) so Phase 2 can compare variants.
Data visibility: show patients a plain statement of what clinicians can see. The rules themselves are an open design question.

## Open decisions
1. Hosting for deployed use, and how the app reaches Ollama and vLLM there (private network such as Tailscale, or a reverse proxy with auth). Ask Sagar or Ryan.
2. Supabase project ownership: should sit on a lab or IU account.
3. Whether Clerk sign-in can be username only; if email is required, say so in the data-flow note for the IRB.
4. Data-flow note for the IRB: Clerk holds identities, Supabase holds conversations, Jetstream2 holds the models.
5. Tighten any cross-origin settings to the deployment domain (the old app allowed all origins).
6. Whether the unnecessary `vllm` and `huggingface_hub` packages in the old `requirements.txt` were intentional (they are not carried over).
