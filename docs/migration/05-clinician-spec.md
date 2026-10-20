# 05: Clinician Side and the Patient-Clinician Bridge (Slice 8)

Replaces the placeholder Slice 8 in `04-build-spec.md`. Standing rules are in `CLAUDE.md` and all of its hard rules apply here. Work one sub-slice (8a, 8b, ...) per session. Each ends with typecheck, lint and tests passing, a commit, and a report.

Sources: the Phase 1 Design Decision Matrix (post-midterm deck, slide 17) and Aijia's guidance on bridging the two sides. Evidence tags used below match the matrix: **lit** (literature-backed), **analogical** (from clinician tools that are not chatbots; not proof), **design** (design citation only), **open** (no evidence found).

## 1. What we are building and why

Two things, in this order:

1. **Clinician side (Phase 0).** The clinician-only features in the matrix, built as sensible defaults. Where the matrix is open, the default is a feature flag so Phase 2 can compare variants.
2. **The bridge.** Aijia's point: two independent interfaces are not a system. Patients often cannot say which symptoms matter or how to describe them, and clinicians frame problems differently. The bridge is the part of the system that takes what the patient says in their own words and turns it into something a clinician can use, and carries the clinician's requests back to the patient in plain language. This is the research contribution; the engineering above exists to make it testable.

Order decision: the patient side already exists (Slices 0 to 7), so the clinician side comes next, then the bridge. One finding shapes the plan: the pre-session brief (8d) is both the clinician's summary feature and the bridge's translation step. Build it well and the bridge is mostly the patient-facing half plus the return channel.

## 2. Evidence-to-build map

Every clinician-side cell in the matrix, what we build, and what Phase 2 can test. Nothing here claims more than the matrix does.

| Matrix cell | Evidence | Phase 0 default | Flag for Phase 2 | Sub-slice |
|---|---|---|---|---|
| Avatar | open | No clinician avatar; AI authorship shown as a text label | `clinician_ai_marker`: label or small icon | 8e |
| Visual design | analogical (Roebroek 2020) | Simple graphic display of activity and alert events over time. No clinical scores, because we have no validated measure | none yet | 8b |
| Risk communication (chatbot to clinician handoff) | open, no direct evidence | Risk events flow to the clinician through the same alert inbox, with the patient's flagged message and surrounding context | `clinician_alert_style` | 8c |
| Session structure | analogical (Rollwage 2023) | Pre-session brief, read before opening the transcript | none | 8d |
| Message pacing (clinician output) | open | Summaries and drafts appear instantly | `clinician_output_pacing`: instant or streamed | 8d, 8e |
| Oversight and control | design (Kampman 2024), analogical (Sharma 2023, Habicht 2025) | Review mode: AI drafts wait for clinician approval. Clinician can also send tasks and questions to the patient | `conversation_mode` per conversation | 8e, 8f |
| Summary and information density | analogical (Kampman 2024, Rollwage 2023, Zou 2026) | Concise brief with evidence links; narrative view as a second tab | `summary_density`: concise or detailed | 8d |
| AI transparency and override | design and analogical (Kampman 2024, Roebroek 2020, Zou 2026, Bokhari 2026) | Every AI output labeled; rationale shown with each draft; edit, approve or reject; every summary point links to source messages | none | 8d, 8e |
| Risk alert design | analogical (Walsh 2025, Murad 2022, Bentley 2022) | Tiered: interruptive for the highest tier, passive for the rest; depression and suicide-risk kept as separate categories | `clinician_alert_style`: tiered, all interruptive, all passive | 8c |
| Data visibility | analogical (Rollwage 2023, Bokhari 2026); rules open | Summary first, transcript on explicit open, every open logged, patient told in plain words | `data_visibility_mode` | 8b |

Known weak spots, stated so nobody over-reads the results: the alert evidence comes from suicide-screening alerts inside clinician systems, not chatbots; the handoff cell has no direct evidence; Kampman is a design citation, not a study of effect.

## 3. Safety rules specific to this slice

These add to `CLAUDE.md`; they do not replace it.

1. **Research prototype, not a safety net.** Alerts appear only when a clinician opens the dashboard; nothing monitors in real time and nothing is emailed or pushed (no message content leaves the app). The patient-side crisis resources and responses stay exactly as built in Slices 4 and 7 and are never held back by anything in this spec. Show a visible "research prototype" notice in the clinician area.
2. **Crisis bypasses review.** In review mode, a message that trips the crisis check still gets the canned crisis response immediately. Only ordinary AI replies wait for the clinician.
3. **No diagnosis.** No output may name a diagnosis, assign a severity score, or recommend treatment. Prompts forbid it, and a test checks the output schema has no such field.
4. **Everything AI-made is labeled** as AI-generated and records the model id, prompt version and time.
5. **Do not touch the lab's fine-tuned behavior.** The Mistral system prompt, the V4 rewriter prompt and the crisis phrases stay verbatim (hard rule 4). New clinician-side prompts live in `lib/models/prompts/clinician.ts`, each with a version string. Summaries, extraction and draft rationale use the base Llama model via Ollama, not the counselor LoRA.
6. **Authorization.** Clinicians reach only assigned patients (hard rule 10). ADMIN can manage assignments and flags but has no transcript, summary or alert access in the UI.
7. **No content in logs, events or errors** (hard rule 9). Interaction events (section 4, and 8h) store ids, types and timestamps only.
8. **Structured output is validated.** A small model can return bad JSON. Validate against a schema, retry once, then show "summary unavailable" instead of anything half-parsed.

## 4. Data model additions (Prisma)

Add in the sub-slice that first needs each one. Enable RLS with no policies on every new table, as before.

- `Conversation.mode`: enum `COMPANION | CLINICIAN_REVIEW`, default `COMPANION`. Changed by an admin script for now.
- `Message.source`: enum `PATIENT | AI | CLINICIAN_EDITED | CLINICIAN`, plus optional `draftId`.
- `DraftReply`: id, conversationId, content, rationale, status `PENDING | APPROVED | EDITED | REJECTED`, finalContent, reviewedById, reviewedAt, modelId, promptVersion, createdAt.
- `SessionSummary`: id, conversationId, kind `BRIEF | NARRATIVE`, items JSON (each item: text, evidence message ids, optional verified quote), density, modelId, promptVersion, generatedAt. A clinician can hide an item or add a note.
- `RiskEvent`: id, conversationId, messageId, tier `HIGHEST | LOWER`, category `SUICIDE_RISK | DEPRESSION_SIGNAL | OTHER`, source `RULE | MODEL`, createdAt, acknowledgedById, acknowledgedAt. Stores no matched phrases.
- `TranscriptAccessLog`: id, clinicianId, conversationId, openedAt.
- `CareMessage`: id, clinicianId, patientId, kind `TASK | QUESTION | NOTE`, body, createdAt, readAt.
- `FlagAssignment`: id, key, value, profileId or conversationId, createdAt. Helper `getFlag(profile, key)` with typed defaults from the table in section 2.
- `InteractionEvent`: id, profileId, type, targetId, variant JSON, createdAt. No content.

## 5. Sub-slices

### 8a: Foundations and patient list
- Migration for `Conversation.mode`, `Message.source`, `FlagAssignment`, `InteractionEvent`; the `getFlag` helper with tests for defaults and overrides.
- Seed/admin script to create a `ClinicianAssignment` and set a clinician role (no UI).
- Clinician layout with the research-prototype notice, and a patient list: assigned patients only, last activity, open alert count.
Acceptance: clinician A cannot see patient B (tested); an unassigned clinician sees an empty list; flag defaults match the table.

### 8b: Patient overview, transcript access, disclosure
- Patient overview page with a simple activity-and-events timeline (visual design cell). No clinical scores.
- Transcript view, read-only, opened from the overview. Each open writes a `TranscriptAccessLog` row. `data_visibility_mode` controls whether the transcript is one click away or hidden behind the summary.
- Patient side: a plain-language statement ("Your care team can see: ...") shown at conversation setup and in the About modal, worded to match whatever mode is active.
Acceptance: access log written on every open (tested); statement text is generated from the active mode so it cannot drift from actual behavior.

### 8c: Risk events and tiered alerts
- In `/api/chat`, when `isCrisis()` is true, create a `RiskEvent` (tier `HIGHEST`, source `RULE`) in the same request, after the canned response is stored. No phrases stored.
- Clinician alert inbox. Style by `clinician_alert_style`: `tiered` (default) shows `HIGHEST` as an interruptive modal on the clinician's next dashboard load until acknowledged, and `LOWER` as a passive badge; `all_interruptive` and `all_passive` for Phase 2.
- Acknowledge action stores who and when. Keep the alert text short: patient, time, the flagged message, two messages of context, and a link to the transcript.
- Do not add model-based screening here. A `LOWER` tier from a model (depression signals, change over time) is a later experiment and needs a decision first (section 7).
Acceptance: a crisis message creates exactly one event; the interruptive alert cannot be dismissed without acknowledging; style variants render per flag; no phrase text in the database (tested).

### 8d: Pre-session brief (also the bridge's translation step)
- `POST /api/clinician/summary`: assigned-clinician check; builds a prompt from the conversation; calls Ollama; validates against the schema; stores a `SessionSummary`.
- Output schema: `themes` (short labels), `in_their_words` (verbatim patient quotes), `symptom_areas_mentioned` (from a fixed list such as mood, anxiety, sleep, appetite, energy, concentration, relationships, daily functioning, substance use, thoughts of self-harm), `not_yet_covered` (areas the patient never mentioned), `changes_since_last_session`. Every item carries evidence message ids.
- **Quote verification:** a quote must be an exact substring of a real patient message. Items that fail are dropped, and the count of dropped items is stored. This is checkable code, not a promise in a prompt.
- UI: brief on top, each item expandable to its source messages (jump to the transcript position). Concise by default; `summary_density` for detailed. A second tab with a narrative view. Clinician can hide an item or add a note.
- Prompt forbids diagnosis, severity and treatment advice; schema has no such fields.
Acceptance: quote verification tests (accepts exact, rejects paraphrase and invented quotes); malformed JSON retried once then "unavailable"; output carries model id and prompt version.

### 8e: Review mode (therapist-in-the-loop)
- In `CLINICIAN_REVIEW` conversations, `/api/chat` stores the patient message, runs the crisis check first (crisis bypasses review), then creates a `DraftReply` with a short rationale instead of sending a reply.
- Clinician review queue: draft, rationale, approve, edit then approve, or reject (with an optional replacement). Approved text becomes an ASSISTANT `Message` with `source` `AI` or `CLINICIAN_EDITED`.
- Patient side: a calm waiting state ("Your care team is reviewing a reply"), plus the standing crisis button. If the model is down, say so plainly.
- AI authorship marker per `clinician_ai_marker`.
- Rationale generation is a second small model call or part of the same call; either way, label it as the model's explanation, not ground truth.
Acceptance: state machine tests (pending to approved, edited, rejected); crisis message never waits; patient cannot see drafts; a rejected draft is never delivered.

### 8f: Bridge, clinician to patient
- Clinician composes a `CareMessage` (task, question or note). Optional "make this plainer" assist that rewrites into plain language; the clinician must review and send, the AI never sends.
- Patient side: a "From your care team" card showing unread items; marking read sets `readAt`.
Acceptance: only the assigned clinician can send to that patient; the assist output is never sent without a clinician action (tested).

### 8g: Bridge, patient to clinician
- Patient-facing "Prepare for your visit" flow, separate from the companion chat so the lab's fine-tuned prompts are untouched. Gentle, optional prompts that help the patient say what matters (when it started, how often, how much it gets in the way, what helps) in their own words, not a questionnaire.
- Its output feeds the same brief generator as 8d.
- **Patient preview:** a `sharing_mode` flag (`auto` or `patient_preview`). In `patient_preview` the patient sees the brief items that will be shared and can remove any before the clinician sees them. Default for Phase 0: `patient_preview`, because consent norms are uneven (Bokhari 2026) and patient agency is a research variable.
Acceptance: items the patient removes never reach the clinician view (tested); flag variants behave per mode.

### 8h: Phase 2 readiness
- Record `InteractionEvent`s (ids and types only): brief opened, evidence link followed, item hidden, draft approved or edited or rejected, alert shown, alert acknowledged, alert dismissed, transcript opened, care message sent or read, preview item removed.
- Admin script to assign flag variants per participant and to export de-identified event data.
- A one-page data-flow note (Clerk holds identities, Supabase holds conversations, Jetstream2 holds models) for the IRB.
Acceptance: no event row contains message content (tested); export contains no identifiers beyond a study id.

## 6. What Phase 2 can measure from this build

Process measures only, because we have no clinical validation:
- Clinician: time to first action on the brief, evidence-link use, how often items are hidden, edit and rejection rate for drafts, alert acknowledgment time, dismissal rate as a rough fatigue signal, self-rated usefulness and trust.
- Patient: whether they felt understood, how often they remove items in preview, use of the visit-preparation flow.
- System: quote-verification drop rate, schema failure rate, model latency.

## 7. Open decisions (need people, not code)

1. **Default conversation mode for the study:** companion or review? Review is closer to Ryan's therapist-in-the-loop framing; companion is what exists. Ask Aijia.
2. **Data visibility default:** summary-first with logged transcript access is the proposal. Needs Aijia and the IRB view.
3. **Patient deletes a conversation:** Slice 5 deletes messages. If a clinician has summaries, alerts or notes tied to it, does everything go? Proposal: hard delete of the conversation and everything derived from it, and the clinician sees "removed by patient". Confirm against IRB retention rules.
4. **Model-based `LOWER` tier risk screening** (depression signals, change over time): the evidence is analogical and a weak model could miss things or over-flag. Proposal: do not build for Phase 0; revisit after 8c is in use. Ask Aijia and Sagar.
5. **Who is the first clinician to try this,** and does talking to clinicians need IRB review? Ask Sagar about IU clinician contacts and CAPS.
6. **Outcome display:** which measure, if any, can the lab stand behind for the visual display? Until then the display shows activity and events only.
7. **Base-model quality:** Llama 3.1 8B may be too weak for reliable structured briefs. 8d's validation and "unavailable" fallback protect against bad output, but not against bland output. Evaluate on synthetic conversations before showing clinicians.
8. **Ethics of a patient-facing visit-preparation flow** that shapes what patients say: confirm with the lab that it counts as within the approved protocol.

## 8. Suggested order and cut lines

- **Minimum clinician side:** 8a, 8b, 8c, 8d.
- **Full clinician Phase 0:** add 8e.
- **Bridge:** 8f, then 8g. If time is short, do 8d plus 8g first, since they carry the translation idea.
- **Study ready:** 8h.

Resolve open decisions 1 to 3 before 8b. The rest can wait.
