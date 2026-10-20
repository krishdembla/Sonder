import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { Turn } from "@/lib/models/llama"

vi.mock("@/lib/models/rewriter", () => ({ rewriteQuery: vi.fn() }))

// Make paced a passthrough so tests don't sleep.
vi.mock("@/lib/streaming", () => ({
  paced: async function* (gen: AsyncIterable<string>) {
    for await (const chunk of gen) yield chunk
  },
}))

import { rewriteQuery } from "@/lib/models/rewriter"
import {
  looksChinese,
  dropUntilFirstUser,
  rewrittenCopy,
  mistralStream,
} from "./index"

// ─── helpers ─────────────────────────────────────────────────────────────────

function u(content: string): Turn {
  return { role: "user", content }
}
function a(content: string): Turn {
  return { role: "assistant", content }
}

function makeVllmStream(chunks: string[]): Response {
  const encoder = new TextEncoder()
  let i = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        const line =
          `data: ${JSON.stringify({ choices: [{ delta: { content: chunks[i++] } }] })}\n` +
          "\n"
        controller.enqueue(encoder.encode(line))
      } else if (i === chunks.length) {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        i++
        controller.close()
      }
    },
  })
  return new Response(stream, { status: 200 })
}

const signal = new AbortController().signal

async function drain(gen: AsyncGenerator<string>): Promise<string[]> {
  const chunks: string[] = []
  for await (const c of gen) chunks.push(c)
  return chunks
}

// ─── looksChinese ─────────────────────────────────────────────────────────────

describe("looksChinese", () => {
  it("returns false for plain English", () => {
    expect(looksChinese("I feel really stressed today")).toBe(false)
  })

  it("returns true when CJK count meets threshold", () => {
    expect(looksChinese("我最近压力很大")).toBe(true)
  })

  it("returns false when CJK count is below threshold", () => {
    expect(looksChinese("ab一c二")).toBe(false)
  })

  it("returns false for empty string", () => {
    expect(looksChinese("")).toBe(false)
  })
})

// ─── dropUntilFirstUser ───────────────────────────────────────────────────────

describe("dropUntilFirstUser", () => {
  it("returns empty array when all turns are assistant", () => {
    expect(dropUntilFirstUser([a("Hello"), a("Hi")])).toEqual([])
  })

  it("returns empty array for empty input", () => {
    expect(dropUntilFirstUser([])).toEqual([])
  })

  it("drops leading assistant turns", () => {
    const turns = [
      a("Hello, I'm glad you're here."),
      u("I feel anxious"),
      a("I hear you"),
    ]
    expect(dropUntilFirstUser(turns)).toEqual([
      u("I feel anxious"),
      a("I hear you"),
    ])
  })

  it("returns unchanged when first turn is already user", () => {
    const turns = [u("hi"), a("hello")]
    expect(dropUntilFirstUser(turns)).toEqual(turns)
  })
})

// ─── rewrittenCopy ────────────────────────────────────────────────────────────

describe("rewrittenCopy", () => {
  beforeEach(() => {
    vi.mocked(rewriteQuery).mockResolvedValue("therapeutically rewritten")
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("returns empty array for empty input", async () => {
    expect(await rewrittenCopy([])).toEqual([])
  })

  it("rewrites the last user turn", async () => {
    const turns = [u("I feel awful"), a("I hear you"), u("nothing matters")]
    const copy = await rewrittenCopy(turns)
    expect(copy[copy.length - 1]).toEqual(u("therapeutically rewritten"))
    expect(rewriteQuery).toHaveBeenCalledWith("nothing matters")
  })

  it("does not call rewriteQuery when last turn is assistant", async () => {
    const turns = [u("hi"), a("I hear you")]
    const copy = await rewrittenCopy(turns)
    expect(rewriteQuery).not.toHaveBeenCalled()
    expect(copy).toEqual(turns)
  })

  it("does not mutate the original array", async () => {
    const turns = [u("original")]
    const original = [...turns]
    await rewrittenCopy(turns)
    expect(turns).toEqual(original)
  })

  it("keeps earlier turns unchanged", async () => {
    const turns = [a("greeting"), u("first"), a("reply"), u("second")]
    const copy = await rewrittenCopy(turns)
    expect(copy.slice(0, 3)).toEqual(turns.slice(0, 3))
  })
})

// ─── mistralStream ────────────────────────────────────────────────────────────

describe("mistralStream", () => {
  beforeEach(() => {
    vi.mocked(rewriteQuery).mockImplementation((msg) => Promise.resolve(msg))
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it("yields the prefill as the first token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeVllmStream([" world"]))
    )
    const chunks = await drain(
      mistralStream([a("Hello"), u("I feel anxious")], signal)
    )
    const PREFILL_EN = [
      "I hear you",
      "I understand",
      "That sounds",
      "It sounds like",
    ]
    expect(PREFILL_EN).toContain(chunks[0])
  })

  it("uses a CJK prefill for Chinese input", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeVllmStream([" 很高兴"]))
    )
    const chunks = await drain(
      mistralStream([u("我最近压力很大，感觉很难受")], signal)
    )
    const PREFILL_ZH = ["我明白", "我听到了", "听起来", "我理解"]
    expect(PREFILL_ZH).toContain(chunks[0])
    vi.restoreAllMocks()
  })

  it("uses an English prefill for non-CJK input", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeVllmStream([" that"])))
    const chunks = await drain(mistralStream([u("I feel stressed")], signal))
    const PREFILL_EN = [
      "I hear you",
      "I understand",
      "That sounds",
      "It sounds like",
    ]
    expect(PREFILL_EN).toContain(chunks[0])
    vi.restoreAllMocks()
  })

  it("concatenates prefill with subsequent SSE tokens", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeVllmStream([" like you", " are tired"]))
    )
    const chunks = await drain(mistralStream([u("I feel stressed")], signal))
    expect(chunks.join("")).toContain(" like you are tired")
    vi.restoreAllMocks()
  })

  it("sends continue_final_message and stop tokens in the request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeVllmStream(["ok"]))
    vi.stubGlobal("fetch", fetchMock)
    await drain(mistralStream([u("hello")], signal))
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as { body: string }).body
    )
    expect(body.continue_final_message).toBe(true)
    expect(body.stop).toEqual(["[INST]", "[/INST]"])
  })

  it("strips the leading greeting turn before sending to vLLM", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeVllmStream(["ok"]))
    vi.stubGlobal("fetch", fetchMock)
    const history = [
      a("Hello, I'm glad you're here."),
      u("I feel sad"),
      a("I hear you"),
    ]
    await drain(mistralStream(history, signal))
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as { body: string }).body
    )
    const nonSystem = body.messages.filter(
      (m: { role: string }) => m.role !== "system"
    )
    expect(nonSystem[0].role).toBe("user")
  })

  it("passes the rewritten message to vLLM, not the original", async () => {
    vi.mocked(rewriteQuery).mockResolvedValue("rewritten version")
    const fetchMock = vi.fn().mockResolvedValue(makeVllmStream(["ok"]))
    vi.stubGlobal("fetch", fetchMock)
    await drain(mistralStream([u("raw user message")], signal))
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as { body: string }).body
    )
    const userMsg = body.messages.find(
      (m: { role: string }) => m.role === "user"
    )
    expect(userMsg.content).toBe("rewritten version")
  })

  it("throws when vLLM returns a non-ok status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
    )
    await expect(() => drain(mistralStream([u("hi")], signal))).rejects.toThrow(
      "vLLM HTTP 503"
    )
  })
})
