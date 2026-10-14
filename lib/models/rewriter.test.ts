import { describe, it, expect, vi, afterEach } from "vitest"
import { clean, rewriteQuery } from "./rewriter"
import { REWRITE_SYSTEM_PROMPT } from "./prompts"

afterEach(() => vi.unstubAllGlobals())

// ─── fail-safe contract ───────────────────────────────────────────────────────

function makeFetch(
  content: string | null,
  opts?: { status?: number; throws?: unknown }
) {
  return vi.fn(async () => {
    if (opts?.throws) throw opts.throws
    return {
      ok: opts?.status !== undefined ? opts.status < 400 : true,
      json: async () => {
        if (content === undefined) throw new SyntaxError("bad json")
        return { message: { content } }
      },
    }
  })
}

it("returns the rewrite on success", async () => {
  vi.stubGlobal("fetch", makeFetch("I have been feeling overwhelmed lately."))
  expect(await rewriteQuery("everything sucks")).toBe(
    "I have been feeling overwhelmed lately."
  )
})

it.each([
  new TypeError("refused"),
  new TypeError("too slow"),
  new Error("generic"),
])("network failure returns the original (%s)", async (err) => {
  vi.stubGlobal("fetch", makeFetch(null, { throws: err }))
  const original = "I don't know how to explain what I'm feeling."
  expect(await rewriteQuery(original)).toBe(original)
})

it("HTTP error status returns the original", async () => {
  vi.stubGlobal("fetch", makeFetch("ignored", { status: 500 }))
  expect(await rewriteQuery("today was hard")).toBe("today was hard")
})

it.each(["", "   ", null])(
  "empty model output returns the original (%s)",
  async (content) => {
    vi.stubGlobal("fetch", makeFetch(content as string))
    expect(await rewriteQuery("I feel numb")).toBe("I feel numb")
  }
)

it.each(["", "   "])(
  "empty input is returned without calling the model (%s)",
  async (message) => {
    const explode = vi.fn(() => {
      throw new Error("must not call fetch")
    })
    vi.stubGlobal("fetch", explode)
    expect(await rewriteQuery(message)).toBe(message)
    expect(explode).not.toHaveBeenCalled()
  }
)

// ─── output cleaning ─────────────────────────────────────────────────────────

describe("clean", () => {
  it.each([
    ["Here is the rewritten message: I feel sad.", "I feel sad."],
    ["Here's the rewritten version: I feel sad.", "I feel sad."],
    ["Rewritten message: I feel sad.", "I feel sad."],
    ['"I feel sad."', "I feel sad."],
    ["'I feel sad.'", "I feel sad."],
    ["“I feel sad.”", "I feel sad."],
    ["  I feel sad.  ", "I feel sad."],
  ])("strips preamble and wrapping quotes: %s", (raw, expected) => {
    expect(clean(raw)).toBe(expected)
  })

  it("keeps internal quotes", () => {
    const text = 'She said "you are too sensitive" and I believed her.'
    expect(clean(text)).toBe(text)
  })

  it("keeps an unmatched leading quote", () => {
    const text = '"you are too sensitive, I kept hearing'
    expect(clean(text)).toBe(text)
  })

  it("handles empty and null", () => {
    expect(clean("")).toBe("")
    expect(clean(null)).toBe("")
  })
})

// ─── request shape ────────────────────────────────────────────────────────────

it("uses the V4 prompt as the system message", async () => {
  let captured: unknown
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      captured = JSON.parse(init.body as string)
      return {
        ok: true,
        json: async () => ({ message: { content: "rewritten" } }),
      }
    })
  )
  await rewriteQuery("hello")
  const body = captured as { messages: { role: string; content: string }[] }
  expect(body.messages[0].role).toBe("system")
  expect(body.messages[0].content).toBe(REWRITE_SYSTEM_PROMPT)
  expect(body.messages[0].content.toLowerCase()).toContain("trauma-informed")
  expect(body.messages[0].content.toLowerCase()).toContain("cultural")
})

it("appends user message to the instruction", async () => {
  let captured: unknown
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      captured = JSON.parse(init.body as string)
      return {
        ok: true,
        json: async () => ({ message: { content: "rewritten" } }),
      }
    })
  )
  await rewriteQuery("I feel awful")
  const body = captured as { messages: { role: string; content: string }[] }
  const userTurn = body.messages[1]
  expect(userTurn.role).toBe("user")
  expect(userTurn.content.endsWith("I feel awful")).toBe(true)
  expect(userTurn.content).toContain("Return only the rewritten message")
})

it("request is non-streaming and low-temperature", async () => {
  let captured: unknown
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      captured = JSON.parse(init.body as string)
      return {
        ok: true,
        json: async () => ({ message: { content: "rewritten" } }),
      }
    })
  )
  await rewriteQuery("hello")
  const body = captured as { stream: boolean; options: { temperature: number } }
  expect(body.stream).toBe(false)
  expect(body.options.temperature).toBeLessThanOrEqual(0.5)
})

it("calls the chat endpoint", async () => {
  let capturedUrl = ""
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      capturedUrl = url
      return {
        ok: true,
        json: async () => ({ message: { content: "rewritten" } }),
      }
    })
  )
  await rewriteQuery("hello")
  expect(capturedUrl.endsWith("/api/chat")).toBe(true)
})

// ─── prompt integrity ─────────────────────────────────────────────────────────

it("V4 prompt is intact", () => {
  for (const fragment of [
    "trauma-informed mental health counselor",
    "Chinese cultural values",
    "Prioritise psychological safety",
    "Validate feelings explicitly",
    "collectivist values",
    "shame and stigma",
    "Do not diagnose, prescribe, or probe for trauma details",
  ]) {
    expect(REWRITE_SYSTEM_PROMPT).toContain(fragment)
  }
})
