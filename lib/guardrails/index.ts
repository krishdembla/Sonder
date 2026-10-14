// High-risk ideation phrases. Multi-word where possible to keep false positives
// down. Deliberately NO bare "die"/"dead" tokens - they false-match everyday
// words like "diet" and "died". Kept lowercase and apostrophe-normalized so a
// match only has to compare against normalize()'d input.
//
// KNOWN LIMITATION (accepted for this iteration): this is exact phrase matching
// with NO understanding of context. Two consequences:
//   1. Misspellings evade it ("i want to kill mysefl" does NOT match).
//   2. Paraphrases with no listed phrase evade it ("I just want to go to sleep
//      and never wake up" may slip through) - recall can never reach 100% with a
//      finite phrase list, no matter how long.
// We mitigate FALSE POSITIVES by only ever listing multi-word, contextual phrases
// (e.g. "cut my wrist", never bare "cut"/"cutting", which would fire on "they
// keep cutting me off"). We accept some residual FALSE NEGATIVES, biasing toward
// sensitivity (a missed crisis is far worse than an unneeded resource card).
//
// This deterministic matcher is the finalized iteration-1 MECHANISM (6.5, chosen
// for reliability + auditability), but this list is an editable STOPGAP, not a
// production-grade crisis detector. The intended direction is a layered guardrail
// (this tripwire OR'd with a local contextual classifier) + a labeled eval set +
// clinical sign-off on the taxonomy - see ROADMAP.md ("Contextual crisis /
// guardrail model"). Do not treat this list as the final safety net.
// The specific list still needs clinical confirmation (Dr. Samtani / clinical input).
export const CRISIS_PHRASES: readonly string[] = [
  "kill myself",
  "kill me",
  "killing myself",
  "end my life",
  "ending my life",
  "end it all",
  "take my own life",
  "want to die",
  "wanna die",
  "want to be dead",
  "don't want to be here anymore",
  "don't want to be alive",
  "don't want to live",
  "no reason to live",
  "no point in living",
  "not worth living",
  "better off dead",
  "better off without me",
  "suicidal",
  "suicide",
  "self harm",
  "hurt myself",
  "harm myself",
  "cut myself",
  "can't go on",
  "cannot go on",
  "want it to end",
  "end my pain",
  // Self-harm methods - wrist cutting. Contextual ("my wrist") so they never
  // fire on "cutting me off" / "cut in line" / "hurt my wrist at the gym".
  // Each conjugation listed explicitly (the matcher does not stem).
  "slit my wrist",
  "slit my wrists",
  "slitting my wrist",
  "slitting my wrists",
  "slice my wrist",
  "slice my wrists",
  "slicing my wrist",
  "slicing my wrists",
  "cut my wrist",
  "cut my wrists",
  "cutting my wrist",
  "cutting my wrists",
  // Other high-signal suicide methods, first-person/contextual.
  "hang myself",
  "hanging myself",
  "shoot myself",
  "overdose",
  "take all my pills",
  "jump off a bridge",
  "bleed out",
  // Additional ideation phrasings (no explicit method).
  "end myself",
  "want to end it",
  "don't want to wake up",
  "never wake up",
  // Spacing variants of the "myself" forms - normalize() collapses runs of
  // whitespace but does NOT join "my self" into "myself", so these need their
  // own entries to catch that common split.
  "kill my self",
  "killing my self",
  // "wish I were dead" family - high-signal ideation with no explicit method.
  "wish i was dead",
  "wish i were dead",
  "wish i wasn't here",
  "wish i weren't here",
  "wish i was never born",
  "wish i had never been born",
  // Note: deliberately NOT "wish i could disappear" - too hyperbolic/benign
  // ("I wish I could disappear on vacation"); it broke the false-positive
  // discipline in tests. Left out on purpose.
  // Other high-signal, multi-word ideation phrasings.
  "nothing to live for",
  "don't want to exist",
  "put an end to my life",
  "end to my life",
  "ready to end it all",
]

// The deterministic reply sent when a phrase matches. A brief empathetic
// validation, a direct safety check-in question (stronger than a bare hotline
// dump - see 6.5's Youper vs. Replika finding), and the crisis resources. This
// is the canonical resource wording; public/crisis.js mirrors it for the
// always-visible button.
export const CRISIS_RESPONSE =
  "I'm really glad you told me this, and I want to make sure you're safe " +
  "right now. I'm a baseline test companion, not a crisis service, so please " +
  "reach out to people who can help right away:\n\n" +
  "- **988 Suicide & Crisis Lifeline** — call or text **988** (24/7, free, confidential)\n" +
  "- **Crisis Text Line** — text **HOME** to **741741**\n" +
  "- **Emergency services** — call **911** if you're in immediate danger\n\n" +
  "**Are you safe right now?** If you're able, I'd gently encourage you to " +
  "reach out to one of these, or to someone you trust nearby. I'm here to keep " +
  "talking with you."

// The proactive "caring contact" follow-up (Motto & Bostrom): after a crisis
// message, if the user then goes quiet for a short while, the app sends this ONCE
// to gently re-check safety and re-surface the resources. Co-located with
// CRISIS_RESPONSE so all crisis wording stays in one editable place. Deliberately
// caring and non-alarmist - a false positive here just sends a kind check-in -
// while still carrying the direct safety question and the same three resources.
export const CRISIS_FOLLOWUP =
  "I wanted to gently check back in — I haven't heard from you for a little " +
  "while, and I care about how you're doing. **Are you safe right now?**\n\n" +
  "There's no pressure to reply. Whenever you're ready, I'm right here — and " +
  "if things feel like too much, please reach out to someone who can help:\n\n" +
  "- **988 Suicide & Crisis Lifeline** — call or text **988** (24/7, free, confidential)\n" +
  "- **Crisis Text Line** — text **HOME** to **741741**\n" +
  "- **Emergency services** — call **911** if you're in immediate danger"

export function normalize(text: string): string {
  let lowered = text.toLowerCase().replace(/’/g, "'")
  lowered = lowered.replace(/[-_]/g, " ")
  return lowered.trim().split(/\s+/).join(" ")
}

export function matchedPhrases(text: string): string[] {
  if (!text) return []
  const normalized = normalize(text)
  return CRISIS_PHRASES.filter((phrase) => normalized.includes(phrase))
}

export function isCrisis(text: string): boolean {
  return matchedPhrases(text).length > 0
}
