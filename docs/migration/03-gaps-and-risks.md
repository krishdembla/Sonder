# 03 — Gaps, Risks, and Open Questions

**Audit date:** 2026-10-13  
**Prerequisite:** Read `01-old-system-inventory.md` for the full old-system inventory and `02-new-repo-conventions.md` for the (currently non-existent) new stack description.

---

## 0. The Foundational Gap

**The new repo does not exist.** The task prompt assumed the current directory is the new Next.js stack, but it is the old Chainlit system. Before any migration work can begin, the new repo must be bootstrapped — a `create-next-app` (or equivalent) with Next.js, Tailwind, Prisma, and Supabase configured. Until that exists, every item below is a forward-looking mapping of "what needs to be built in the new stack," not a comparison of two existing codebases.

---

## 1. Feature-by-Feature Port Map

### 1.1 Auth (old: `auth/auth.py` + `data/users.db`)

| Old | New (target) | Gap |
|---|---|---|
| Hand-rolled bcrypt SQLite store | Supabase Auth (email+password) | Supabase Auth replaces the custom SQLite store. Password hashing, sessions, and JWT management all move to Supabase's managed service. |
| Log In / Sign Up split via `__signup__:` prefix injected at network layer (`public/app.js:454–513`) | Native Supabase `signUp()` vs `signIn()` calls | The network-layer prefix hack is Chainlit-specific. In Next.js, `supabase.auth.signUp()` and `supabase.auth.signInWithPassword()` are separate calls — no workaround needed. |
| `users(id, username UNIQUE, hashed_password, createdAt)` in `data/users.db` | Supabase Auth `auth.users` table (managed) | Existing test accounts in `data/users.db` cannot be migrated to Supabase; users must re-register. |
| `cl.User.identifier` scopes the Thread History Sidebar | Supabase user UUID scopes conversations in Prisma | Equivalent — scoping by authenticated user is standard in both systems. |
| `CHAINLIT_AUTH_SECRET` (JWT) | Supabase project URL + anon key + service role key | Different env var shape but same purpose. |

**Risk:** If the prototype window extends before the new stack is ready, the old SQLite auth has a known-open-signup posture — the Jetstream2 security group is the only gate. This is acceptable per `claude_code_context.md:207–209`, but must not carry into the therapist pilot.

---

### 1.2 Conversation History (old: `utils/history.py` + `data/chainlit.db`)

| Old | New (target) | Gap |
|---|---|---|
| `cl.user_session["message_history"]` (in-memory) | React state + Supabase real-time or server fetch | No direct equivalent of `cl.user_session`. Each Next.js request is stateless; in-memory history must be re-fetched from Supabase on each page load or maintained in a client-side state manager. |
| `sanitize()` + `coalesce()` transforms before model call | Port as TypeScript utilities | The logic is pure functions with no Chainlit dependency — straightforward to port. |
| `rebuild_from_thread()` from Chainlit step types | Fetch messages from Prisma by conversation ID | Equivalent. The step-type filtering logic (`user_message` / `assistant_message`) maps to message `role` field. |
| `clear()` on session end | Clear React state on sign-out or navigation | Simpler in Next.js — React state is per-component. |
| **Full history sent every turn** (spec 6.3) | Must be preserved — fetch all messages in conversation before each model API call | Critical requirement: do not implement "last N messages" truncation without careful thought. This is a mental health app where prior context matters. |

---

### 1.3 Model Routing (old: `models/registry.py`)

| Old | New (target) | Gap |
|---|---|---|
| Python `MODELS` dict + `stream_for()` dispatch | TypeScript model registry + Next.js API route | Same pattern, different language. A `POST /api/chat` route in Next.js reads `model` from the request body and calls the appropriate handler. |
| `cl.ChatSettings` + `cl.Select` dropdown | Custom React UI component | No Chainlit equivalent. Build a `<ModelSelector>` component; persist choice to Supabase conversation metadata. |
| Model choice stored in Chainlit thread metadata | Store in Prisma `conversations.metadata` (JSON column) | Equivalent. |
| `resolve()` coerces unknown IDs to default | Port to TypeScript | Direct port. |
| Legacy `chat_profile` thread metadata support | Can be dropped — new stack has no legacy threads | Old Chainlit threads are not migrated. |

---

### 1.4 LLaMA Handler (old: `models/llama/handler.py`)

| Old | New (target) | Gap |
|---|---|---|
| Async Python generator → Chainlit `msg.stream_token()` | Server-Sent Events (SSE) from Next.js API route → browser via `ReadableStream` | The streaming mechanism changes completely. Old: Python async generator piped through Chainlit's WebSocket. New: SSE or streaming `Response` from a Next.js Route Handler consumed by the browser. |
| `httpx.AsyncClient` POST to `OLLAMA_HOST/api/chat` | Node.js `fetch()` POST to `OLLAMA_HOST/api/chat` | Same Ollama API, different HTTP client. Wire format (NDJSON lines) is identical. |
| `paced()` word-boundary buffering + delay | Port `paced()` logic to TypeScript | The algorithm is pure (no async I/O of its own) — straightforward port. The `asyncio.sleep` call becomes `await new Promise(r => setTimeout(r, ms))`. |
| `SYSTEM_PROMPT` (warm companion tone) | TypeScript constant | Direct port. |

---

### 1.5 Mistral Handler (old: `models/mistral_mental_health/handler.py`)

| Old | New (target) | Gap |
|---|---|---|
| Async Python generator → vLLM SSE | SSE from Next.js API route → browser | Same structural change as LLaMA handler. |
| `httpx.AsyncClient` POST to `VLLM_HOST/v1/chat/completions` | Node.js `fetch()` POST to `VLLM_HOST/v1/chat/completions` | Same OpenAI-compatible API, different HTTP client. SSE format identical. |
| `_drop_until_first_user()` (Mistral chat template constraint) | Port to TypeScript | Direct port. |
| `_rewritten_copy()` (local copy, no history mutation) | Port to TypeScript | Critical: must preserve the invariant that shared history is never mutated. |
| `_looks_chinese()` + CJK prefill for output language | Port to TypeScript | The `_CJK_PATTERN` regex and prefill logic port directly. |
| `continue_final_message: True` vLLM parameter | Preserve exactly | This is vLLM-specific; must not be dropped or the prefill becomes a prior turn instead of a continuation. |
| Stop tokens `[INST]`/`[/INST]` | Preserve exactly | Prevents self-simulated model continuation. |

---

### 1.6 Query Rewriter (old: `models/mistral_mental_health/query_rewriter.py`)

| Old | New (target) | Gap |
|---|---|---|
| Async Python function → Ollama `/api/chat` (non-streaming) | TypeScript async function → `OLLAMA_HOST/api/chat` | Direct port. |
| Fail-safe: return original on any error | **Must be preserved** | Non-negotiable — a failed rewrite must never lose the user's message. |
| `_clean()` preamble/quote stripping | Port to TypeScript | Direct port. |
| V4 system prompt (verbatim) | **Must be preserved byte-for-byte** | Metrics are tied to this exact wording. |
| `REWRITE_TIMEOUT`, `REWRITER_MODEL` env vars | Port as Next.js env vars | Direct port. |

---

### 1.7 Crisis Detection (old: `utils/guardrails.py`)

| Old | New (target) | Gap |
|---|---|---|
| `is_crisis()` + `CRISIS_PHRASES` (56 phrases) | Port to TypeScript | Pure function, no Chainlit dependency. |
| `_normalize()` (lowercase, apostrophe/hyphen/whitespace) | Port to TypeScript | Direct port. |
| `CRISIS_RESPONSE` + `CRISIS_FOLLOWUP` strings | Port as TypeScript constants | Direct port. |
| Crisis check runs **before model routing** in `on_message` | Must run **before** any API route calls the model | Critical ordering constraint. In Next.js: run `iscrisis(content)` at the top of the POST handler before any model call. |
| `crisis_active` flag suppresses model-switch notice | Port as React state | Direct port in UI logic. |
| Proactive follow-up watcher (`_crisis_followup_watcher`) | Server-Sent Events keep-alive or WebSocket | The 45-second watcher currently runs as a Python `asyncio` task on the server, sending into an open Chainlit WebSocket session. In a stateless Next.js architecture this is harder: requires either a persistent server-side connection (WebSocket), a push notification mechanism, or a client-side timer polling for "go quiet" state. **This is the hardest individual feature to port.** |

---

### 1.8 Safety UI Affordances (old: `public/app.js`, `public/app.css`)

| Old | New (target) | Gap |
|---|---|---|
| Vanilla JS injected via Chainlit's `custom_js` mechanism | React components in the Next.js layout | Much cleaner in React. `CrisisButton`, `QuickExitButton`, `DisclaimerModal` become proper components with state. |
| MutationObserver polling to add/remove elements on Chainlit re-renders | Not needed — React manages DOM | The entire MutationObserver pattern is a workaround for Chainlit's compiled React bundle. Disappears in Next.js. |
| Login-page detection hides safety buttons | Route-based conditional rendering | In Next.js, show buttons only on `/chat` routes, not `/login`. |
| `companion:open_resources` window message from Python backend | Custom React event or state | In Next.js, the backend SSE stream can send a special event type (`crisis_open_modal`) that the React client handles. |
| Feedback row (copy + thumbs) injected via MutationObserver | React component rendered per-message | Much cleaner. State (selected rating, comment) lives in React. |
| Bottom-anchor layout via `:has()` CSS selector hack | Flexbox layout in a React component | Straightforward in React — `justify-content: flex-end` on the message list, no CSS selector hack needed. |
| Animated typing dots loader injected into empty bubbles | React component with conditional render | Render `<TypingIndicator />` when streaming state is active. |

---

### 1.9 Conversation Setup Flow (old: `public/elements/ConversationSetup.jsx` + `utils/conversation_setup.py`)

| Old | New (target) | Gap |
|---|---|---|
| `cl.CustomElement` sent as a Chainlit message | React component rendered as part of the chat UI or as a modal/onboarding step | No Chainlit equivalent needed. The setup card becomes a regular React component. |
| `callAction({name: "create_conversation", payload: {...}})` | `fetch('/api/conversations', {method: 'POST', body: ...})` | Chainlit's action callback system replaced by a standard API call. |
| Avatar images in `public/avatars/` | `public/avatars/` in Next.js `public/` | Direct move — same path convention. |
| `build_greeting_message()` + `greeting_text()` | React `<Greeting>` component | Direct port. |

---

### 1.10 Streaming Delivery (old: `utils/streaming.py` + `app.py._generate()`)

| Old | New (target) | Gap |
|---|---|---|
| Python async generator → `msg.stream_token()` → Chainlit WebSocket | TypeScript generator → `ReadableStream` → SSE → browser `EventSource` or `fetch` with streaming body | Complete rewrite of the transport layer, but the buffering algorithm (`paced()`) is a direct port. |
| `app.py._generate()` abort on `msg_seq` change or `is_typing` | Client-side `AbortController` on new user message | Different mechanism, same goal. Old: server-side `asyncio.Queue` + seq check. New: `AbortController` passed to `fetch()` that the client cancels when the user types. |
| `QUIET_WINDOW = 2.5s` typing coalesce | Client-side debounce before sending | Port as a client-side debounce (e.g. 2.5s `setTimeout` cleared on each keystroke). |
| `HOLD_AFTER_COMPLETE = 0.3s` grace after stream done | Port as a `setTimeout` after stream close event | Direct port. |
| Background `_responder` task keeps composer unlocked | Next.js streaming responses naturally keep the UI free | In Next.js, streaming responses are non-blocking by design — the "return immediately" trick is not needed. |

---

## 2. Old Features with No Obvious New-Stack Equivalent

| Feature | Reason it's hard | Recommended approach |
|---|---|---|
| **Thread History Sidebar** | Chainlit provides this as a native UI element with rename/delete/resume built in | Build a custom `<ConversationList>` sidebar fetching from Prisma. Implement delete (already a Prisma `DELETE`) and rename (Prisma `UPDATE`). |
| **`@cl.on_chat_resume`** | Chainlit automatically calls this when a user clicks a thread in the sidebar, injecting the full thread object | In Next.js, navigating to `/chat/[conversationId]` fetches history from Supabase/Prisma and hydrates state. Same concept, different mechanism. |
| **`cl.user_session`** (server-side per-session dict) | Chainlit maintains a Python object alive for the session duration | Not available in stateless HTTP. Session data lives in: (1) JWT claims, (2) Supabase Auth session, (3) React state, (4) Prisma. No global dict. |
| **Proactive crisis follow-up watcher** | An `asyncio` task that wakes up 45s after a crisis message and sends into an open session | Requires a persistent server-side connection. Options: (a) WebSocket connection from the chat page; (b) client-side timer that polls `/api/crisis-followup` after 45s of inactivity; (c) skip for now and rely on the persistent SOS button. |
| **`context.session.has_first_interaction`** | Internal Chainlit bookkeeping to suppress thread auto-naming | Not needed — Next.js doesn't have this constraint. |
| **`context.emitter.init_thread()`** | Names the thread in the Chainlit sidebar in real time | In Next.js, `PATCH /api/conversations/:id` with the name immediately after the user submits the setup card. |
| **`context.emitter.send_toast()`** | Chainlit's native toast API | Build a `<Toast>` component or use a library (shadcn/ui toast, react-hot-toast). |
| **`auto_tag_thread = false`** workaround | Chainlit tried to store tags as a Postgres array but the SQLite schema is TEXT | Not needed — Prisma schema can model tags correctly from the start. |

---

## 3. Should Chainlit Be Replaced or Kept as a Separate Service?

**Recommendation: Replace entirely with the new Next.js stack.**

Reasons from the code:

1. **Every interesting behavior is already in Python, not Chainlit.** The crisis detector, history manager, auth, query rewriter, and model handlers are pure Python with no Chainlit imports. They port to TypeScript directly.

2. **The custom JS/CSS (`public/app.js`, `public/app.css`) exists precisely because Chainlit's React bundle is inaccessible.** The 780-line `app.js` is a workaround for not being able to write real React components — it uses MutationObserver, event delegation, and network-layer interception specifically because the Chainlit frontend is a compiled, opaque bundle. In Next.js, every one of those features becomes a 10-line React component.

3. **The streaming architecture is fighting Chainlit.** The `_responder` background task, `is_typing` signals, `msg_seq` race conditions, the `HOLD_AFTER_COMPLETE` grace window, the empty-bubble cleanup on disconnect — all of this complexity exists because Chainlit's `on_message` handler blocks the composer while it runs. Native Next.js streaming responses are non-blocking by design.

4. **The Sign Up / Log In network-layer hack** (`maybeMarkSignup()` intercepting `window.fetch` and `XMLHttpRequest`) exists entirely because Chainlit's login form is not customizable. In Next.js, the auth form is a React component you control.

5. **There is no "therapist-in-the-loop" mode to share** between old and new. The old system explicitly marks it a non-goal, and nothing in the old code would need to be kept running as a separate service.

**Verdict:** Keep Chainlit running on Jetstream2 only until the Next.js app reaches feature parity. Then decommission it. Do not run both in production simultaneously.

---

## 4. How the New App Reaches Model Endpoints

### Current state (old system)

Both Ollama and vLLM are bound to `127.0.0.1` on the Jetstream2 instance:
- Ollama: `http://localhost:11434` (`scripts/run_vllm.sh:43`, `models/llama/handler.py:10`)
- vLLM: `http://localhost:8001` (`scripts/run_vllm.sh:44`, `models/mistral_mental_health/handler.py:73`)

The rule from `scripts/run_vllm.sh:13`: *"Internal only, same rule as Ollama: --host is pinned to 127.0.0.1 and must never become 0.0.0.0 — never expose a model-serving port to the internet."*

### What is missing in the new stack

The new Next.js app will not run on Jetstream2. It will run on a different host (Vercel, a VPS, or elsewhere — UNVERIFIED). The model endpoints are `localhost`-only on Jetstream2 and are **not reachable from any other host.**

**This is the single largest infrastructure gap in the migration.**

Options (none currently configured):

| Option | How | Risk |
|---|---|---|
| **SSH tunnel** | Persistent tunnel from the Next.js server host to Jetstream2, forwarding ports 11434 and 8001 | Fragile; requires a dedicated persistent process; breaks if the tunnel drops |
| **Reverse proxy on Jetstream2** | Nginx on Jetstream2 proxying `/api/ollama/` and `/api/vllm/` with authentication — **but still only accessible from trusted IPs, NOT 0.0.0.0** | Requires adding an auth header check to prevent open internet access; must not expose ports without auth |
| **Model API as a Next.js backend-for-frontend** | Next.js API routes on a server that has network access to Jetstream2 (e.g. same VPC, or with Tailscale/WireGuard) | Cleanest; keeps browser away from model endpoints entirely; requires VPN or private network setup |
| **Cloudflare Tunnel / Tailscale** | Private network tunnel; no public port required | Best security posture; requires Tailscale installed on both the Next.js server and Jetstream2 |

**In all cases, model endpoints must never be called from the browser directly.** All model calls must go through Next.js API routes (server-side), which are the only code that knows `OLLAMA_HOST` and `VLLM_HOST`.

**Missing env vars in the new stack:** `OLLAMA_HOST` and `VLLM_HOST` (and the token/key for whatever auth protects the tunnel) are not yet defined anywhere.

---

## 5. Privacy and Data Risks

### 5.1 Conversation Data in Supabase

**Who can read it:** Supabase table access is controlled by Row Level Security (RLS) policies. If RLS is not configured, Supabase service-role calls can read all conversations. The same hard-gate from the old system applies:

> "This database is for test and prototype conversations only... must never be used to store real patient, client, or therapist conversation data."  
> — `utils/persistence.py:6–8`, `auth/auth.py:26–31`, `docs/PROJECT_OVERVIEW.md §11`

**New risks introduced by Supabase vs. SQLite:**
- SQLite: single local file, `chmod 600`, accessible only via SSH to the Jetstream2 instance  
- Supabase: cloud-hosted PostgreSQL accessible via HTTPS from anywhere with the service role key. The data is more accessible than the old SQLite file.
- The Supabase project URL and anon key will be in the repo's `.env.local` / deployment environment. A leaked service role key exposes all conversation data.
- Supabase's data residency (where the PostgreSQL server physically runs) is not yet configured — UNVERIFIED.

**Required before any real data:** IRB protocol 22721 sign-off from Dr. Samtani and Dr. Pescosolido; encrypted-at-rest confirmation from Supabase; access-control audit of RLS policies.

### 5.2 Model Input Data

Every user message is sent to:
1. `OLLAMA_HOST/api/chat` (LLaMA, or query rewriter)
2. `VLLM_HOST/v1/chat/completions` (Mistral)

Both are `localhost` endpoints on Jetstream2. In the new stack, these calls go from the Next.js API routes to Jetstream2 over whatever tunnel is configured. The content of user messages (which may include mental health disclosures) travels over that tunnel. The tunnel must be encrypted (TLS or VPN).

**No third-party model API should be used.** The old system's `ROADMAP.md §1` explicitly prohibits hosted moderation APIs (OpenAI, Azure, Google) for the same reason — mental health messages must not leave the on-instance infrastructure.

### 5.3 Feedback Data

The old system's feedback row (thumbs up/down + comment) is visual-only — `app.js:229` explicitly states "Demo-scope: copy-to-clipboard is real; the rating and any comment are visual-only (not sent anywhere or persisted)." In the new stack, if feedback is wired to Supabase, it becomes real persistent data. That means comments expressing mental health distress could be stored alongside conversation content. This must be documented for IRB review.

---

## 6. Open Questions

1. **Where will the Next.js app be hosted?** Vercel? A VM? The same Jetstream2 allocation? This determines which model-access option (§4) is feasible.

2. **How will the Next.js app reach Ollama and vLLM?** This must be resolved before any model integration work begins. The endpoints are `127.0.0.1`-only on Jetstream2 and cannot be called from a different host without network infrastructure changes.

3. **Will Supabase data residency satisfy IRB requirements?** The old system used a local SQLite file. Supabase is a cloud-hosted database. Dr. Samtani and Dr. Pescosolido need to confirm whether Supabase's data location and access controls satisfy IRB protocol 22721.

4. **What replaces the proactive crisis follow-up watcher?** The 45-second caring-contact behavior (`app.py:334–364`) is a server-side asyncio task that fires into an open session. The cleanest replacement in Next.js is a client-side timer — but that means the behavior disappears if the user closes the tab before 45 seconds. Should the timer behavior be dropped, kept client-side, or implemented as a proper WebSocket?

5. **Will there be a multi-model selector at launch of the new stack?** Both models are live in the old system. If the new stack launches with only LLaMA first, the Mistral/vLLM integration (including query rewriting, prefill, CJK detection, and the LoRA adapter path) is a second milestone.

6. **What happens to existing test accounts and conversations in the old system?** The old `data/users.db` has test accounts. The old `data/chainlit.db` has test conversations. Per `claude_code_context.md:314`, these were planned to be wiped when real auth landed. They should be wiped (not migrated) when the new stack goes live, since the data is test-only.

7. **Who is doing UI/UX for the new stack?** Abdullah owns final UI sign-off (`docs/PROJECT_OVERVIEW.md §2`). The color palette in `public/theme.json` is provisional. The new stack is an opportunity to implement finalized design comps if Abdullah has produced them.

8. **Should the feedback row store data in the new stack?** Currently visual-only in the old system. If made persistent in Supabase, it needs IRB documentation as user-generated content linked to mental health conversations.

9. **Is `allow_origins = ["*"]` intentional?** The old Chainlit config (`config.toml:21`) allows all CORS origins. This should be tightened in the new stack to only the deployment domain.

10. **Does `vllm` in `requirements.txt` actually need to be there?** The old repo's `requirements.txt` lists `vllm` and `huggingface_hub`. vLLM runs on the instance, not in the app's own process — including it in `requirements.txt` creates a large, GPU-dependent install that fails on CPU. This is likely a mistake and should not be carried into the new stack.
