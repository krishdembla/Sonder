// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"

vi.mock("@/app/(patient)/chat/actions", () => ({
  updateConversationModel: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/models/registry", () => ({
  MODELS: { llama: { label: "LLaMA 3.1" } },
  labelFor: (id: string) => id,
}))

// next/navigation is not available in jsdom
vi.mock("next/navigation", () => ({
  usePathname: () => "/chat/test",
  useRouter: () => ({ push: vi.fn() }),
}))

import { Chat } from "./Chat"

const QUIET_WINDOW_MS = 2500

function makeCrisisStream(content: string): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "crisis", content })}\n\n`
        )
      )
      controller.close()
    },
  })
  return new Response(stream, { status: 200 })
}

describe("Chat crisis follow-up timer", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeCrisisStream("Crisis message"))
    )
    vi.stubGlobal("crypto", {
      randomUUID: () => Math.random().toString(36).slice(2),
    })
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("appends CRISIS_FOLLOWUP after 45 s of silence following a crisis event", async () => {
    render(<Chat conversationId="c1" initialMessages={[]} />)

    const textarea = screen.getByPlaceholderText("Type a message...")
    fireEvent.change(textarea, { target: { value: "I want to die" } })
    fireEvent.keyDown(textarea, { key: "Enter" })

    // advance past quiet-window debounce so fetch fires
    await act(async () => {
      vi.advanceTimersByTime(QUIET_WINDOW_MS + 100)
    })

    // let the promise chain from fetch resolve
    await act(async () => {
      await Promise.resolve()
    })

    // advance the 45 s crisis follow-up timer
    await act(async () => {
      vi.advanceTimersByTime(45_000)
    })

    // CRISIS_FOLLOWUP is a multi-line markdown string — match on a unique
    // substring to avoid whitespace-normalization mismatches in RTL.
    expect(screen.getByText(/gently check back in/)).toBeInTheDocument()
  })

  it("does not append CRISIS_FOLLOWUP when the user replies before 45 s", async () => {
    render(<Chat conversationId="c1" initialMessages={[]} />)

    const textarea = screen.getByPlaceholderText("Type a message...")
    fireEvent.change(textarea, { target: { value: "I want to die" } })
    fireEvent.keyDown(textarea, { key: "Enter" })

    await act(async () => {
      vi.advanceTimersByTime(QUIET_WINDOW_MS + 100)
    })
    await act(async () => {
      await Promise.resolve()
    })

    // user sends another message before 45 s — mock returns empty stream
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({ type: "done" })}\n\n`
              )
            )
            c.close()
          },
        }),
        { status: 200 }
      )
    )

    fireEvent.change(textarea, { target: { value: "actually I am fine" } })
    fireEvent.keyDown(textarea, { key: "Enter" })

    // advance 45 s — timer should have been cleared
    await act(async () => {
      vi.advanceTimersByTime(45_000)
    })

    expect(screen.queryByText(/gently check back in/)).not.toBeInTheDocument()
  })
})
