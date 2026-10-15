import { MISTRAL_SYSTEM_PROMPT } from "@/lib/models/prompts"
import { rewriteQuery } from "@/lib/models/rewriter"
import { paced } from "@/lib/streaming"
import type { Turn } from "@/lib/models/llama"

const VLLM_HOST = process.env.VLLM_HOST ?? "http://localhost:8001"
const VLLM_MODEL_NAME = process.env.VLLM_MODEL_NAME ?? "mistral-mental-health"
const MIN_CHUNK_DELAY = parseFloat(process.env.MIN_CHUNK_DELAY ?? "0.04")
const PER_CHAR_DELAY = parseFloat(process.env.PER_CHAR_DELAY ?? "0.025")
const CHUNK_DELAY_JITTER = parseFloat(process.env.CHUNK_DELAY_JITTER ?? "0.03")
const MAX_TOKENS = parseInt(process.env.MISTRAL_MAX_TOKENS ?? "512", 10)
const TEMPERATURE = parseFloat(process.env.MISTRAL_TEMPERATURE ?? "0.7")

// CJK Unified Ideographs block — enough matches signals Chinese input.
const CJK_RE = /[一-鿿]/g
const CJK_THRESHOLD = 3

export function looksChinese(text: string): boolean {
  return (text.match(CJK_RE) ?? []).length >= CJK_THRESHOLD
}

// Short counselor openers, rotated randomly so replies don't open identically.
const PREFILL_EN = [
  "I hear you",
  "I understand",
  "That sounds",
  "It sounds like",
]
const PREFILL_ZH = ["我明白", "我听到了", "听起来", "我理解"]

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// Mistral's chat template requires the conversation to start on a user turn.
// The assistant greeting seeded at conversation creation is legitimate for
// display but breaks the template; drop any leading non-user turns before
// sending to vLLM. This copy never reaches the persisted history.
export function dropUntilFirstUser(turns: Turn[]): Turn[] {
  const idx = turns.findIndex((t) => t.role === "user")
  return idx === -1 ? [] : turns.slice(idx)
}

// Build a local copy with the last user turn replaced by its rewritten version.
// Never mutates the input — the shared history keeps the user's original words.
export async function rewrittenCopy(turns: Turn[]): Promise<Turn[]> {
  if (!turns.length) return []
  const last = turns[turns.length - 1]
  if (last.role !== "user") return [...turns]
  const rewritten = await rewriteQuery(last.content)
  return [...turns.slice(0, -1), { role: "user" as const, content: rewritten }]
}

async function* rawFragments(
  turns: Turn[],
  signal: AbortSignal
): AsyncGenerator<string> {
  const lastUser = [...turns].reverse().find((t) => t.role === "user")
  const prefill = pickRandom(
    looksChinese(lastUser?.content ?? "") ? PREFILL_ZH : PREFILL_EN
  )

  const messages = [
    { role: "system", content: MISTRAL_SYSTEM_PROMPT },
    ...turns,
    { role: "assistant", content: prefill },
  ]

  // Yield the prefill as the first token so the displayed message is one
  // continuous sentence starting from the opener.
  yield prefill

  const res = await fetch(`${VLLM_HOST}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: VLLM_MODEL_NAME,
      messages,
      stream: true,
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      continue_final_message: true,
      add_generation_prompt: false,
      // Stops the model from continuing past its own turn if eos_token is
      // not emitted (observed on long generations with this adapter).
      stop: ["[INST]", "[/INST]"],
    }),
    signal,
  })

  if (!res.ok) throw new Error(`vLLM HTTP ${res.status}`)
  if (!res.body) throw new Error("No response body from vLLM")

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split("\n")
      buf = lines.pop() ?? ""
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        const payload = line.slice(6)
        if (payload === "[DONE]") return
        const data = JSON.parse(payload) as {
          choices: [{ delta: { content?: string } }]
        }
        const content = data.choices[0]?.delta?.content ?? ""
        if (content) yield content
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export async function* mistralStream(
  history: Turn[],
  signal: AbortSignal
): AsyncGenerator<string> {
  const trimmed = dropUntilFirstUser(history)
  const rewritten = await rewrittenCopy(trimmed)
  yield* paced(
    rawFragments(rewritten, signal),
    MIN_CHUNK_DELAY,
    PER_CHAR_DELAY,
    CHUNK_DELAY_JITTER
  )
}
