import { describe, it, expect, vi } from "vitest"
import { flushBoundary, paced, MAX_BUFFER } from "./index"

// ─── flushBoundary ───────────────────────────────────────────────────────────

describe("flushBoundary", () => {
  it("flushes up to last boundary char", () => {
    const [toEmit, remainder] = flushBoundary("hello world, more", false)
    expect(toEmit).toBe("hello world, ")
    expect(remainder).toBe("more")
  })

  it("keeps everything when no boundary and under max buffer", () => {
    const [toEmit, remainder] = flushBoundary("abc", false)
    expect(toEmit).toBe("")
    expect(remainder).toBe("abc")
  })

  it("force-flushes when no boundary but over max buffer", () => {
    const longRun = "a".repeat(MAX_BUFFER + 1)
    const [toEmit, remainder] = flushBoundary(longRun, false)
    expect(toEmit).toBe(longRun)
    expect(remainder).toBe("")
  })

  it("flushes everything when done regardless of boundary", () => {
    const [toEmit, remainder] = flushBoundary("no boundary here", true)
    expect(toEmit).toBe("no boundary here")
    expect(remainder).toBe("")
  })
})

// ─── paced ───────────────────────────────────────────────────────────────────

async function* makeGen(fragments: string[]) {
  for (const f of fragments) yield f
}

async function drainWithDelays(
  fragments: string[],
  minChunkDelay: number,
  perCharDelay = 0,
  jitter = 0
): Promise<{ chunks: string[]; delays: number[] }> {
  const delays: number[] = []
  const fakeSleep = (s: number): Promise<void> => {
    delays.push(s)
    return Promise.resolve()
  }
  const chunks: string[] = []
  for await (const chunk of paced(
    makeGen(fragments),
    minChunkDelay,
    perCharDelay,
    jitter,
    fakeSleep
  )) {
    chunks.push(chunk)
  }
  return { chunks, delays }
}

describe("paced", () => {
  it("reproduces full output regardless of fragment size", async () => {
    const { chunks } = await drainWithDelays(["Hel", "lo ", "there"], 0.01)
    expect(chunks.join("")).toBe("Hello there")
  })

  it("applies flat delay when no per-char or jitter", async () => {
    const { delays } = await drainWithDelays(["hi ", "there "], 0.05)
    expect(delays).toEqual([0.05, 0.05])
  })

  it("scales delay with flushed chunk length", async () => {
    // "ab " flushes immediately (boundary at the space) and is paced;
    // "cd" never hits a boundary before the source runs out, so it's flushed
    // as the trailing leftover with no delay scheduled after it.
    const { chunks, delays } = await drainWithDelays(["ab ", "cd"], 0.0, 0.1)
    expect(chunks).toEqual(["ab ", "cd"])
    expect(delays).toHaveLength(1)
    expect(delays[0]).toBeCloseTo(0.3) // 3 chars * 0.1 for "ab " only
  })

  it("adds bounded jitter to the delay", async () => {
    vi.spyOn(Math, "random").mockReturnValue(1)
    const { delays } = await drainWithDelays(["ab "], 0.05, 0, 0.02)
    expect(delays).toHaveLength(1)
    expect(delays[0]).toBeCloseTo(0.07)
    vi.restoreAllMocks()
  })

  it("flushes trailing buffer with no delay after", async () => {
    const { chunks, delays } = await drainWithDelays(["noboundary"], 0.05)
    expect(chunks).toEqual(["noboundary"])
    expect(delays).toEqual([])
  })
})
