import { LLAMA_SYSTEM_PROMPT } from "@/lib/models/prompts"
import { paced } from "@/lib/streaming"

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434"
const MODEL_NAME = process.env.MODEL_NAME ?? "llama3.1:8b"
const MIN_CHUNK_DELAY = parseFloat(process.env.MIN_CHUNK_DELAY ?? "0.04")
const PER_CHAR_DELAY = parseFloat(process.env.PER_CHAR_DELAY ?? "0.025")
const CHUNK_DELAY_JITTER = parseFloat(process.env.CHUNK_DELAY_JITTER ?? "0.03")

export type Turn = { role: "user" | "assistant"; content: string }

async function* rawFragments(
  messages: Turn[],
  signal: AbortSignal
): AsyncGenerator<string> {
  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: [{ role: "system", content: LLAMA_SYSTEM_PROMPT }, ...messages],
      stream: true,
    }),
    signal,
  })

  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
  if (!res.body) throw new Error("No response body from Ollama")

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        if (!line.trim()) continue
        const data = JSON.parse(line) as {
          message?: { content?: string }
          done?: boolean
        }
        const content = data.message?.content ?? ""
        if (content) yield content
        if (data.done) return
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export async function* llamaStream(
  messages: Turn[],
  signal: AbortSignal
): AsyncGenerator<string> {
  yield* paced(
    rawFragments(messages, signal),
    MIN_CHUNK_DELAY,
    PER_CHAR_DELAY,
    CHUNK_DELAY_JITTER
  )
}
