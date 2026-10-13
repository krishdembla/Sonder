# 01 — Old System Inventory

**Repo:** `krishdembla/dsail-mhLLM-interface`  
**Branch audited:** `feat/mistral-integration` (HEAD `a2354de`)  
**Files reviewed:** 27 of 27 non-git, non-binary source files  
**Skipped:** `public/avatars/*.png` (binary images), `public/login-bg.svg`, `public/logo_*.svg`, `public/favicon.svg` (static assets, no logic), `.chainlit/translations/*.json` (Chainlit-supplied i18n files, no project code), `chainlit.md` (static welcome-screen markdown)

---

## ⚠️ Critical Finding

The task prompt describes **"the current directory is the NEW repo (Next.js/Tailwind/Supabase/Prisma)"** and refers to the old Chainlit system at `<old-repo-path>`. That path was never filled in because **there is no separate new repo.** The current working directory `/Users/krishdembla/Documents/DSAIL/dsail-mhLLM-interface` **IS the old Chainlit system.** No Next.js files (`package.json`, `next.config.js`, `.tsx` components, etc.) exist anywhere in this repository. The inventory below therefore documents the one system that exists — the old stack — in full.

---

## A. SERVING — How Models Are Launched

*Document only; not ported. These components run on Jetstream2, not in the app repo.*

### A1. Ollama — LLaMA 3.1 8B

| Item | Value |
|---|---|
| Runtime | Ollama (llama.cpp-based) |
| Model | `llama3.1:8b` (GGUF, quantized) |
| Port | `127.0.0.1:11434` — **internal only, never 0.0.0.0** |
| Config | Managed as a systemd service by Ollama's own installer |
| Endpoint used by app | `POST /api/chat` (streaming NDJSON), `GET /api/tags` (health) |
| Env var | `OLLAMA_HOST=http://localhost:11434` (`.env.example:1`), `MODEL_NAME=llama3.1:8b` (`.env.example:2`) |
| Quantization | Ollama default for `llama3.1:8b` (Q4_K_M or similar); no override in repo |

### A2. vLLM — Mistral 7B + LoRA Adapter

| Item | Value |
|---|---|
| Runtime | vLLM |
| Base model | `mistralai/Mistral-7B-Instruct-v0.2` (bf16) |
| LoRA adapter | `/home/exouser/models/mistral_mental_health/adapter_rewritten` — on-instance **outside** the repo, never committed (`scripts/run_vllm.sh:37–38`) |
| LoRA rank | `r=8`, `lora_alpha=16` (`claude_code_context.md:350`) |
| Served name | `mistral-mental-health` |
| Port | `127.0.0.1:8001` — **internal only** (`scripts/run_vllm.sh:43–44`) |
| GPU utilization cap | `--gpu-memory-utilization 0.5` to share the A100 with Ollama (`scripts/run_vllm.sh:17–18`) |
| Instance | Jetstream2 g3.xl — NVIDIA A100 40GB (`claude_code_context.md:328–332`) |
| Launch script | `scripts/run_vllm.sh` — nohup background run |
| Systemd unit | `scripts/vllm.service` — `Restart=always`, `RestartSec=5`, `User=exouser` |
| Extra env | `VLLM_USE_FLASHINFER_SAMPLER=0` — disables JIT FlashInfer sampler because no system CUDA toolkit is installed (`scripts/run_vllm.sh:34`) |
| Env vars | `VLLM_HOST=http://localhost:8001` (`.env.example:6`), `VLLM_MODEL_NAME=mistral-mental-health` (`.env.example:7`) |

### A3. Adapter Files (on-instance, outside repo)

| Path | Description |
|---|---|
| `/home/exouser/models/mistral_mental_health/adapter_rewritten` | **Active** — trained on query-rewritten dataset; better ROUGE-L/BLEU-4/BERTScore |
| `/home/exouser/models/mistral_mental_health/adapter_original` | Baseline comparison adapter |

---

## B. APP — Features to Port

### B1. UI Modes

**What it does:** Single AI-companion chat mode only. Therapist-in-the-loop mode is an explicit non-goal for this iteration (`docs/CLAUDE_CODE_CONTEXT.md §8`).  
**File:** `app.py` (overall structure)  
**Depends on Chainlit:** Yes — the entire UI layer is Chainlit's React frontend. The app provides no standalone web server.

---

### B2. Model Selection and Routing

**What it does:** A `cl.ChatSettings` dropdown (not Chat Profiles — those restart the thread) lets users switch models mid-conversation without losing history. The registry pattern ensures `app.py` never branches on model identity.

**File:** `models/registry.py` (lines 1–72)  
- Two registered models: `llama3.1-8b` (default) and `mistral-7b-mental-health`
- Each entry: `{label, description, stream: async generator, available: bool}`
- `SELECT_ITEMS` dict is the shape `cl.Select.items` expects
- `resolve(id)` coerces any unknown/legacy id to the default (backwards-compatible with old Chat Profile `"Llama 3.1 8B Instruct"` thread metadata)

**File:** `app.py:72–86` (`_model_settings()`), `app.py:115–131` (`on_chat_start`), `app.py:199–228` (`on_settings_update`)  
- Model stored in `cl.user_session` AND in `data_layer.update_thread` metadata so it survives resume  
- Model switch notice suppressed when `crisis_active` is True (spec 6.5 anti-pattern rule, `app.py:222–228`)

**Depends on Chainlit:** Yes — `cl.ChatSettings`, `cl.input_widget.Select`, `cl.user_session`, `@cl.on_settings_update`

---

### B3. System Prompts and Adapter/Prompt Variants

| Model | File | Content summary |
|---|---|---|
| LLaMA 3.1 8B | `models/llama/system_prompt.py:1–30` | Warm companion persona; natural/casual tone; avoid "therapy bot" tells; non-clinical framing woven in naturally; off-topic redirect; safe messaging |
| Mistral 7B | `models/mistral_mental_health/system_prompt.py:1–2` | Professional counselor — **verbatim from training**, not customized, because LoRA behavior is conditioned on this exact text |
| Query rewriter | `models/mistral_mental_health/query_rewriter.py:58–65` | V4 Trauma-Informed + Cultural Sensitivity prompt (Shruti & Newell's best-performing variant) |

**Depends on Chainlit:** No — pure Python constants

---

### B4. Query Rewriting Module

**What it does:** Before each Mistral turn, rewrites the latest user message into therapeutically/culturally appropriate phrasing using V4 prompt. Uses LLaMA via Ollama as placeholder rewriter. Raw message is always preserved in history and shown to the user; only the local vLLM copy sees the rewrite. Fail-safe: returns original on any error.

**File:** `models/mistral_mental_health/query_rewriter.py`  
**File:** `models/mistral_mental_health/handler.py:110–122` (`_rewritten_copy()`) — builds a local copy, never mutates shared history  
**Hard rules** (lines 18–27): (1) crisis detection runs on raw text before rewriting, (2) raw message stored in history  
**Env vars:** `REWRITER_MODEL` (default: `MODEL_NAME`), `REWRITE_TIMEOUT=60`

**Depends on Chainlit:** No — pure Python/httpx

---

### B5. Authentication and User Roles

**What it does:** Username + password auth; SQLite `data/users.db`; bcrypt hashing; separate Log In / Sign Up flows.

**File:** `auth/auth.py`  
- `users(id TEXT PK, username TEXT UNIQUE NOT NULL, hashed_password TEXT NOT NULL, createdAt TEXT)` (`auth/auth.py:60–67`)
- Username rules: 3–32 chars, `[A-Za-z0-9._-]`, case-insensitive, whitespace-stripped (`auth/auth.py:58, 70–78`)
- Password rules: 8–72 bytes, bcrypt-hashed (`auth/auth.py:55–56`)
- Log In vs Sign Up distinguished by `__signup__:` prefix injected into the submitted username at the network layer in `public/app.js:454–513` — NOT via form field mutation (React form intercept was unreliable)
- Log In: fails if account doesn't exist (no silent auto-registration)
- Sign Up: fails if username already taken
- `@cl.password_auth_callback` (`auth/auth.py:199–209`) — returns `cl.User(identifier=clean_username, metadata={"account_created": bool})`
- `account_created` flag used to display a toast on first login (`app.py:89–105`)
- DB at `USERS_DB_PATH` env var, default `data/users.db`; `chmod 600` on creation
- Authenticated identifier scopes Chainlit's Thread History Sidebar per-user

**File:** `tests/test_auth.py` — 20 test cases covering hashing, validation, Sign Up/Log In split, case-insensitivity, no-plaintext storage, file permissions

**Depends on Chainlit:** Yes — `@cl.password_auth_callback`, `cl.User`

**Prototype-scope security warning** (documented at `auth/auth.py:26–31`): Jetstream2 security group is the only gate in front of account creation; db is unencrypted SQLite; not suitable for therapist pilot without Dr. Samtani / IRB sign-off.

---

### B6. Crisis Detection and Risk Guardrails

**What it does:** Deterministic keyword/phrase matcher runs on every incoming user message, before any model routing, before any coalescing/pacing. On match: sends canned crisis response with 988/741741/911 resources + direct safety check-in question; arms a proactive follow-up watcher.

**Files:**
- `utils/guardrails.py` — `CRISIS_PHRASES` (56 phrases), `CRISIS_RESPONSE`, `CRISIS_FOLLOWUP`, `is_crisis()`, `matched_phrases()`; `_normalize()` handles apostrophe, hyphen, whitespace variants
- `app.py:273–293` (`on_message`) — crisis check is first, before pacing/coalescing
- `app.py:310–364` (`_arm_crisis_followup()`, `_crisis_followup_watcher()`) — proactive caring-contact follow-up: after crisis message, if user goes quiet for `FOLLOWUP_DELAY` seconds (default 45, env-overridable), sends `CRISIS_FOLLOWUP` once and posts `companion:open_resources` window message to auto-open the crisis modal

**UI safety affordances** (`public/app.js`, `public/app.css`):
- Persistent "🆘 Crisis Resources" button, bottom-right (`app.js:44–86`, `app.css:370–460`)
- Quick Exit button, top-right (one click → `window.location.replace("https://www.weather.com")`) (`app.js:98–113`, `app.css:340–365`)
- Compliance/liability disclaimer modal ("About"), top of header (`app.js:128–173`)
- Both safety buttons hidden on login page, rebuilt on chat page (`app.js:655–667`)
- `companion:open_resources` window message triggers modal from backend (`app.js:694–698`)

**Env vars:** `CRISIS_FOLLOWUP_DELAY=45` (seconds, `app.py:59`)

**Depends on Chainlit:** Partially — `is_crisis()` and `CRISIS_PHRASES` are pure Python (no Chainlit). The proactive follow-up uses `cl.Message.send()` and `cl.send_window_message()`. UI affordances are vanilla JS in Chainlit's public directory.

---

### B7. Conversation History

**What it does:** Manages the running message list for the active session; normalizes it before sending to models; rebuilds from persisted thread on resume.

**File:** `utils/history.py`  
- Backed by `cl.user_session["message_history"]` — never a module-level global
- `sanitize()`: drops malformed turns (wrong role, empty content, non-string, missing keys)
- `coalesce()`: merges consecutive same-role turns (rapid texting → one model turn)
- `for_model()`: sanitize + coalesce — what actually reaches the model API
- `rebuild_from_thread()`: walks persisted `steps` from `@cl.on_chat_resume`, extracts `user_message` and `assistant_message` types only
- `clear()` on `@cl.on_chat_end`: drops in-memory copy; persisted thread untouched

**File:** `tests/test_history.py` — pure-function tests for sanitize/coalesce/prepare

**Depends on Chainlit:** Yes — `cl.user_session` for storage; `on_chat_resume` thread structure for rebuild

---

### B8. Database — What Is Stored

#### `data/users.db` (`auth/auth.py:60–67`)

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `username` | TEXT UNIQUE NOT NULL | Normalized (lowercased, trimmed) |
| `hashed_password` | TEXT NOT NULL | bcrypt hash |
| `createdAt` | TEXT | ISO 8601 UTC |

#### `data/chainlit.db` (`utils/persistence.py:89–162`)

| Table | Purpose | Key columns |
|---|---|---|
| `users` | Chainlit user records | `id TEXT PK`, `identifier TEXT UNIQUE`, `metadata TEXT`, `createdAt TEXT` |
| `threads` | Conversation threads | `id TEXT PK`, `name TEXT`, `userId TEXT FK`, `userIdentifier TEXT`, `metadata TEXT` (stores avatar, model, user_name) |
| `steps` | Message history entries | `id TEXT PK`, `type TEXT` (user_message / assistant_message / run), `input TEXT`, `output TEXT`, `threadId TEXT FK` |
| `elements` | Custom elements (ConversationSetup, Greeting) | `id TEXT PK`, `type TEXT`, `props TEXT`, `threadId TEXT FK` |
| `feedbacks` | Per-message feedback | `id TEXT PK`, `forId TEXT`, `value INTEGER`, `comment TEXT`, `threadId TEXT FK` |

Both databases: `chmod 600`, SQLite, no encryption, stored locally on instance.

---

### B9. Streaming Behavior

**What it does:** Word-boundary buffering with length-scaled + jittered delays, shared across all model handlers.

**File:** `utils/streaming.py`  
- `paced(raw_fragments, min_chunk_delay, per_char_delay, jitter)` — async generator
- Flushes at whitespace/punctuation boundaries or at `MAX_BUFFER=12` chars
- Delay = `min_chunk_delay + len(chunk) * per_char_delay + uniform(0, jitter)`
- Env vars: `MIN_CHUNK_DELAY=0.04`, `PER_CHAR_DELAY=0.025`, `CHUNK_DELAY_JITTER=0.03`

**LLaMA handler** (`models/llama/handler.py`): Ollama NDJSON stream → `paced()`  
**Mistral handler** (`models/mistral_mental_health/handler.py`): vLLM SSE stream → `paced()`; prefills assistant turn with language-matched opener to force output language matching (Chinese CJK detection, `_CJK_PATTERN`); stop tokens `[INST]`/`[/INST]` guard against self-simulated turns  
**Tests:** `tests/test_streaming.py` (patching `asyncio.sleep`)

**Depends on Chainlit:** Indirectly — results fed to `msg.stream_token()` in `app.py`, but `utils/streaming.py` itself has no Chainlit import

---

### B10. Chainlit-Specific Features In Use

| Feature | Location | Notes |
|---|---|---|
| `@cl.on_chat_start` | `app.py:115` | Sets `has_first_interaction=True` to suppress auto thread-naming race; sends ChatSettings; sends ConversationSetup card |
| `@cl.on_chat_resume` | `app.py:184` | Rebuilds history + restores model/avatar/name + re-sends ChatSettings dropdown |
| `@cl.on_chat_end` | `app.py:231` | Cancels `responder_task` + `crisis_followup_task`; clears history |
| `@cl.on_message` | `app.py:273` | Crisis check first; then pacing/coalescing via background `_responder` task |
| `@cl.on_settings_update` | `app.py:199` | Model switch; persists to thread metadata |
| `@cl.on_window_message` | `app.py:258` | Receives `companion:typing` / `companion:idle` signals from `public/app.js` |
| `@cl.action_callback("create_conversation")` | `app.py:133` | Receives avatar/name/userName from `ConversationSetup.jsx`; names thread; persists metadata |
| `cl.ChatSettings` + `cl.input_widget.Select` | `app.py:72–86` | Model picker dropdown sent to UI |
| `cl.CustomElement` | `utils/conversation_setup.py:8, 13` | `ConversationSetup` and `Greeting` React components in `public/elements/` |
| `@cl.password_auth_callback` | `auth/auth.py:199` | Username+password auth; returns `cl.User` |
| `@cl.data_layer` | `utils/persistence.py:180–183` | SQLAlchemy SQLite data layer registration |
| `SQLAlchemyDataLayer` | `utils/persistence.py:183` | Chainlit's built-in SQLite/Postgres data layer |
| Custom `LocalStorageClient` | `utils/persistence.py:26–82` | Local filesystem element storage (required for CustomElement persistence) |
| `cl.send_window_message` | `app.py:364` | Posts `companion:open_resources` to trigger crisis modal in JS |
| `context.emitter.init_thread()` | `app.py:152` | Names the thread after conversation creation |
| `context.emitter.send_toast()` | `app.py:102` | "Account created" notification |
| `context.session.has_first_interaction` | `app.py:123` | Suppresses Chainlit's auto thread-naming race |
| Thread History Sidebar | Native | Per-user scoping via auth identifier |
| Custom HTTP middleware | `app.py:25–33` | `no-store` cache header on HTML to prevent bfcache stale page |
| `public/theme.json` | `public/theme.json` | shadcn CSS variable palette (sage/sky, light-forced with identical dark block) |
| `.chainlit/config.toml` | `.chainlit/config.toml` | `custom_js`, `custom_css`, `login_page_image`, `avatar_size=40`, `confirm_new_chat=true`, `auto_tag_thread=false`, `default_theme=light`, `allow_origins=["*"]` |
| Custom JS/CSS | `public/app.js`, `public/app.css` | See B6 for features; ~780 lines of vanilla JS injected via Chainlit's `custom_js` mechanism |

---

### B11. Configuration and Environment Variables

From `.env.example` and code scan:

| Variable | Default | Source | Purpose |
|---|---|---|---|
| `OLLAMA_HOST` | `http://localhost:11434` | `.env.example:1` | LLaMA endpoint |
| `MODEL_NAME` | `llama3.1:8b` | `.env.example:2` | LLaMA model tag |
| `DATABASE_URL` | `sqlite+aiosqlite:///data/chainlit.db` | `.env.example:3` | Chainlit conversation DB |
| `USERS_DB_PATH` | `data/users.db` | `.env.example:4` | Credentials DB |
| `VLLM_HOST` | `http://localhost:8001` | `.env.example:6` | Mistral/vLLM endpoint |
| `VLLM_MODEL_NAME` | `mistral-mental-health` | `.env.example:7` | vLLM served model name |
| `CHAINLIT_AUTH_SECRET` | (required, generate with `chainlit create-secret`) | `.env.example:13` | JWT signing secret |
| `CRISIS_FOLLOWUP_DELAY` | `45` | `app.py:59` | Proactive follow-up delay (seconds) |
| `MIN_CHUNK_DELAY` | `0.04` | `models/llama/handler.py:21` | Stream pacing floor |
| `PER_CHAR_DELAY` | `0.025` | `models/llama/handler.py:30` | Length-scaled pacing |
| `CHUNK_DELAY_JITTER` | `0.03` | `models/llama/handler.py:31` | Random pacing jitter |
| `MISTRAL_MAX_TOKENS` | `512` | `models/mistral_mental_health/handler.py:83` | vLLM generation cap |
| `MISTRAL_TEMPERATURE` | `0.7` | `models/mistral_mental_health/handler.py:84` | vLLM temperature |
| `MISTRAL_ADAPTER_PATH` | `/home/exouser/models/mistral_mental_health/adapter_rewritten` | `models/mistral_mental_health/handler.py:88–91` | LoRA adapter path |
| `REWRITER_MODEL` | `MODEL_NAME` | `models/mistral_mental_health/query_rewriter.py:50` | Query rewriter model |
| `REWRITE_TIMEOUT` | `60` | `models/mistral_mental_health/query_rewriter.py:53` | Query rewriter HTTP timeout |

---

### B12. Tests

| File | What it covers | Chainlit dependency |
|---|---|---|
| `tests/test_guardrails.py` | 30+ parametrized cases: phrase detection, false positives, normalization, CRISIS_RESPONSE/FOLLOWUP content | None (pure Python) |
| `tests/test_history.py` | `sanitize()`, `coalesce()`, `prepare()` pure functions; malformed/empty input | None (pure Python) |
| `tests/test_auth.py` | 20 cases: hashing, validation, Sign Up/Log In split, case-insensitivity, no-plaintext, file permissions | None except `cl.User` (mocked via `auth_callback`) |
| `tests/test_registry.py` | Registry completeness, handler interface contract, unknown-id fallback, legacy Chat Profile mapping | None (imports registry directly) |
| `tests/test_query_rewriter.py` | Fail-safe contract, output cleaning, request shape, V4 prompt integrity (all HTTP stubbed) | None (pure Python + monkeypatch) |
| `tests/test_streaming.py` | `flush_boundary()` pure function; `paced()` with `asyncio.sleep` patched | None (pure Python) |

**Run:** `pytest tests/` from project root with venv active. No Chainlit context required; all tests are pure-unit or mock-HTTP.
