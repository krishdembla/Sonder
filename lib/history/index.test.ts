import { describe, it, expect } from "vitest"
import { sanitize, coalesce, forModel } from "./index"

// ─── sanitize ────────────────────────────────────────────────────────────────

describe("sanitize", () => {
  it.each([
    [{ role: "system", content: "hi" }],
    [{ role: "user" }],
    [{ content: "no role" }],
    [{ role: "user", content: "" }],
    [{ role: "user", content: "   " }],
    [{ role: "user", content: null }],
    [{ role: "user", content: 42 }],
    ["not a dict"],
    [null],
  ])("drops malformed turn %j", (badTurn) => {
    expect(sanitize([badTurn])).toEqual([])
  })

  it("keeps valid turns in order", () => {
    const turns = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ]
    expect(sanitize(turns)).toEqual(turns)
  })

  it("strips extra keys", () => {
    const turns = [{ role: "user", content: "hi", id: "abc", avatar: "Moon" }]
    expect(sanitize(turns)).toEqual([{ role: "user", content: "hi" }])
  })

  it("drops the empty greeting from a resumed thread", () => {
    const resumed = [
      { role: "assistant", content: "" },
      { role: "user", content: "I've been feeling off lately" },
    ]
    expect(sanitize(resumed)).toEqual([
      { role: "user", content: "I've been feeling off lately" },
    ])
  })

  it("handles empty and null input", () => {
    expect(sanitize([])).toEqual([])
    expect(sanitize(null)).toEqual([])
  })
})

// ─── coalesce ────────────────────────────────────────────────────────────────

describe("coalesce", () => {
  it("merges consecutive user turns", () => {
    const turns = [
      { role: "user" as const, content: "hey" },
      { role: "user" as const, content: "you there?" },
      { role: "assistant" as const, content: "I'm here" },
    ]
    expect(coalesce(turns)).toEqual([
      { role: "user", content: "hey\nyou there?" },
      { role: "assistant", content: "I'm here" },
    ])
  })

  it("merges consecutive assistant turns", () => {
    const turns = [
      { role: "user" as const, content: "I want to die" },
      { role: "assistant" as const, content: "resources" },
      { role: "assistant" as const, content: "checking back in" },
    ]
    expect(coalesce(turns)).toEqual([
      { role: "user", content: "I want to die" },
      { role: "assistant", content: "resources\nchecking back in" },
    ])
  })

  it("leaves alternating turns untouched", () => {
    const turns = [
      { role: "user" as const, content: "a" },
      { role: "assistant" as const, content: "b" },
      { role: "user" as const, content: "c" },
    ]
    expect(coalesce(turns)).toEqual(turns)
  })

  it("does not mutate input", () => {
    const turns = [
      { role: "user" as const, content: "one" },
      { role: "user" as const, content: "two" },
    ]
    coalesce(turns)
    expect(turns).toEqual([
      { role: "user", content: "one" },
      { role: "user", content: "two" },
    ])
  })

  it("handles empty input", () => {
    expect(coalesce([])).toEqual([])
  })
})

// ─── forModel ────────────────────────────────────────────────────────────────

describe("forModel", () => {
  it("sanitizes before coalescing", () => {
    const turns = [
      { role: "user", content: "first" },
      { role: "assistant", content: "" },
      { role: "user", content: "second" },
    ]
    expect(forModel(turns)).toEqual([
      { role: "user", content: "first\nsecond" },
    ])
  })

  it("output is always well formed", () => {
    const messy = [
      { role: "assistant", content: "" },
      { role: "system", content: "nope" },
      { role: "user", content: "hi", extra: 1 },
      null,
      { role: "user", content: "still me" },
      { role: "assistant", content: "hello" },
    ]
    const result = forModel(messy)
    expect(result).toEqual([
      { role: "user", content: "hi\nstill me" },
      { role: "assistant", content: "hello" },
    ])
    for (const turn of result) {
      expect(Object.keys(turn).sort()).toEqual(["content", "role"])
      expect(["user", "assistant"]).toContain(turn.role)
      expect(typeof turn.content).toBe("string")
      expect(turn.content.trim()).not.toBe("")
    }
  })

  it("returns empty for all malformed input", () => {
    expect(
      forModel([{ role: "assistant", content: "" }, null, "junk"])
    ).toEqual([])
  })
})
