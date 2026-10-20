import { REWRITE_SYSTEM_PROMPT } from "./prompts"

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434"
const REWRITER_MODEL =
  process.env.REWRITER_MODEL ?? process.env.MODEL_NAME ?? "llama3.1:8b"
const REWRITE_TIMEOUT = parseFloat(process.env.REWRITE_TIMEOUT ?? "60")

// The task instruction. Separate from the V4 persona above so the system prompt
// stays verbatim and this wrapper can be tuned independently.
const REWRITE_INSTRUCTION =
  "Rewrite the following message into a more therapeutically appropriate " +
  "version, preserving the original meaning and emotional content. Keep the " +
  "speaker's first-person voice and do not add details they did not say. " +
  "Return only the rewritten message, with no preamble, no quotation marks, " +
  "and no explanation.\n\nMessage:\n"

// Preambles a chatty model tends to prepend despite being told not to.
const PREAMBLE_MARKERS = [
  "here is the rewritten message:",
  "here's the rewritten message:",
  "here is the rewritten version:",
  "here's the rewritten version:",
  "rewritten message:",
  "rewritten version:",
  "rewrite:",
]

const QUOTE_PAIRS: [string, string][] = [
  ['"', '"'],
  ["'", "'"],
  ["“", "”"],
  ["‘", "’"],
]

export function clean(text: string | null | undefined): string {
  let cleaned = (text ?? "").trim()
  if (!cleaned) return ""

  const lowered = cleaned.toLowerCase()
  for (const marker of PREAMBLE_MARKERS) {
    if (lowered.startsWith(marker)) {
      cleaned = cleaned.slice(marker.length).trim()
      break
    }
  }

  for (const [opening, closing] of QUOTE_PAIRS) {
    if (
      cleaned.length >= 2 &&
      cleaned.startsWith(opening) &&
      cleaned.endsWith(closing)
    ) {
      cleaned = cleaned.slice(1, -1).trim()
      break
    }
  }

  return cleaned
}

export async function rewriteQuery(userMessage: string): Promise<string> {
  if (!userMessage || !userMessage.trim()) return userMessage

  try {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: REWRITER_MODEL,
        messages: [
          { role: "system", content: REWRITE_SYSTEM_PROMPT },
          { role: "user", content: REWRITE_INSTRUCTION + userMessage },
        ],
        stream: false,
        options: { temperature: 0.3 },
      }),
      signal: AbortSignal.timeout(REWRITE_TIMEOUT * 1000),
    })
    if (!res.ok) return userMessage
    const payload = (await res.json()) as {
      message?: { content?: string }
    }
    const rewritten = clean(payload?.message?.content)
    return rewritten || userMessage
  } catch {
    return userMessage
  }
}
