import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"
import { POST } from "./route"
import { ForbiddenError } from "@/lib/db/queries"
import { CRISIS_RESPONSE } from "@/lib/guardrails"
import { MessageRole } from "@/lib/generated/prisma/enums"
import type { Profile } from "@/lib/auth"

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({ getCurrentProfile: vi.fn() }))

vi.mock("@/lib/db", () => ({
  prisma: {
    message: { create: vi.fn(), findMany: vi.fn() },
    conversation: { update: vi.fn() },
  },
}))

vi.mock("@/lib/db/queries", async (orig) => {
  const actual = await orig<typeof import("@/lib/db/queries")>()
  return { ...actual, getConversation: vi.fn() }
})

vi.mock("@/lib/models/llama", () => ({ llamaStream: vi.fn() }))

import { getCurrentProfile } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getConversation } from "@/lib/db/queries"
import { llamaStream } from "@/lib/models/llama"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body: object, signal?: AbortSignal): NextRequest {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  }) as unknown as NextRequest
}

async function readSSE(
  res: Response
): Promise<Array<{ type: string; [k: string]: unknown }>> {
  if (!res.body) return []
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let text = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
  }
  return text
    .split("\n\n")
    .filter((p) => p.startsWith("data: "))
    .map((p) => JSON.parse(p.slice(6)))
}

const patientProfile: Profile = {
  id: "user_1",
  role: "PATIENT" as never,
  displayName: null,
  createdAt: new Date(),
}

const conv = {
  id: "conv_1",
  userId: "user_1",
  title: "Test",
  modelId: "llama3.1-8b",
  setup: {},
  createdAt: new Date(),
  updatedAt: new Date(),
}

const storedUserMsg = {
  id: "msg_u1",
  conversationId: "conv_1",
  role: MessageRole.USER,
  content: "hi",
  modelId: "llama3.1-8b",
  createdAt: new Date(),
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.message.create).mockResolvedValue(storedUserMsg as never)
  vi.mocked(prisma.message.findMany).mockResolvedValue([storedUserMsg as never])
})

// ─── Auth and ownership ───────────────────────────────────────────────────────

it("returns 401 when not authenticated", async () => {
  vi.mocked(getCurrentProfile).mockResolvedValue(null)
  const res = await POST(
    makeRequest({ conversationId: "conv_1", messages: ["hi"] })
  )
  expect(res.status).toBe(401)
})

it("returns 400 for missing conversationId", async () => {
  vi.mocked(getCurrentProfile).mockResolvedValue(patientProfile)
  const res = await POST(makeRequest({ messages: ["hi"] }))
  expect(res.status).toBe(400)
})

it("returns 400 for empty messages array", async () => {
  vi.mocked(getCurrentProfile).mockResolvedValue(patientProfile)
  const res = await POST(
    makeRequest({ conversationId: "conv_1", messages: [] })
  )
  expect(res.status).toBe(400)
})

it("returns 403 when conversation is not accessible", async () => {
  vi.mocked(getCurrentProfile).mockResolvedValue(patientProfile)
  vi.mocked(getConversation).mockRejectedValue(new ForbiddenError())
  const res = await POST(
    makeRequest({ conversationId: "conv_2", messages: ["hi"] })
  )
  expect(res.status).toBe(403)
})

// ─── Normal flow ─────────────────────────────────────────────────────────────

describe("normal message", () => {
  beforeEach(() => {
    vi.mocked(getCurrentProfile).mockResolvedValue(patientProfile)
    vi.mocked(getConversation).mockResolvedValue(conv as never)
    vi.mocked(llamaStream).mockImplementation(async function* () {
      yield "Hello "
      yield "world!"
    })
  })

  it("streams token events followed by done", async () => {
    const events = await readSSE(
      await POST(makeRequest({ conversationId: "conv_1", messages: ["hi"] }))
    )
    expect(events).toContainEqual({ type: "token", content: "Hello " })
    expect(events).toContainEqual({ type: "token", content: "world!" })
    expect(events).toContainEqual({ type: "done" })
  })

  it("stores user message before model call", async () => {
    await readSSE(
      await POST(makeRequest({ conversationId: "conv_1", messages: ["hi"] }))
    )
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: MessageRole.USER,
          content: "hi",
        }),
      })
    )
  })

  it("stores assistant message after stream completes", async () => {
    await readSSE(
      await POST(makeRequest({ conversationId: "conv_1", messages: ["hi"] }))
    )
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: MessageRole.ASSISTANT,
          content: "Hello world!",
        }),
      })
    )
  })

  it("sends full history to the model", async () => {
    const historyRow = {
      id: "msg_old",
      conversationId: "conv_1",
      role: MessageRole.ASSISTANT,
      content: "Previous reply",
      modelId: "llama3.1-8b",
      createdAt: new Date(),
    }
    vi.mocked(prisma.message.findMany).mockResolvedValue([historyRow as never])
    await readSSE(
      await POST(makeRequest({ conversationId: "conv_1", messages: ["hi"] }))
    )
    const [[passedHistory]] = vi.mocked(llamaStream).mock.calls as unknown as [
      [unknown, unknown],
    ]
    expect(passedHistory).toEqual(
      expect.arrayContaining([{ role: "assistant", content: "Previous reply" }])
    )
  })
})

// ─── Crisis path ─────────────────────────────────────────────────────────────

describe("crisis message", () => {
  beforeEach(() => {
    vi.mocked(getCurrentProfile).mockResolvedValue(patientProfile)
    vi.mocked(getConversation).mockResolvedValue(conv as never)
  })

  it("returns crisis event with CRISIS_RESPONSE content", async () => {
    const events = await readSSE(
      await POST(
        makeRequest({ conversationId: "conv_1", messages: ["I want to die"] })
      )
    )
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: "crisis",
      content: CRISIS_RESPONSE,
    })
  })

  it("stores CRISIS_RESPONSE as assistant message", async () => {
    await readSSE(
      await POST(
        makeRequest({ conversationId: "conv_1", messages: ["I want to die"] })
      )
    )
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: MessageRole.ASSISTANT,
          content: CRISIS_RESPONSE,
        }),
      })
    )
  })

  it("makes no model call for a crisis message", async () => {
    await readSSE(
      await POST(
        makeRequest({ conversationId: "conv_1", messages: ["kill myself"] })
      )
    )
    expect(llamaStream).not.toHaveBeenCalled()
  })
})

// ─── Model error ─────────────────────────────────────────────────────────────

it("streams error event when model is unreachable", async () => {
  vi.mocked(getCurrentProfile).mockResolvedValue(patientProfile)
  vi.mocked(getConversation).mockResolvedValue(conv as never)
  vi.mocked(llamaStream).mockImplementation(async function* () {
    throw new Error("connection refused")
  })

  const events = await readSSE(
    await POST(makeRequest({ conversationId: "conv_1", messages: ["hi"] }))
  )
  expect(events).toContainEqual(
    expect.objectContaining({
      type: "error",
      message: "Model unavailable. Please try again.",
    })
  )
})

it("does not include error details in error event", async () => {
  vi.mocked(getCurrentProfile).mockResolvedValue(patientProfile)
  vi.mocked(getConversation).mockResolvedValue(conv as never)
  vi.mocked(llamaStream).mockImplementation(async function* () {
    throw new Error("secret internal error with user content")
  })

  const events = await readSSE(
    await POST(makeRequest({ conversationId: "conv_1", messages: ["hi"] }))
  )
  const errorEvent = events.find((e) => e.type === "error")
  expect(JSON.stringify(errorEvent)).not.toContain("secret internal error")
  expect(JSON.stringify(errorEvent)).not.toContain("user content")
})

// ─── Abort ────────────────────────────────────────────────────────────────────

it("does not store assistant message when request is aborted mid-stream", async () => {
  vi.mocked(getCurrentProfile).mockResolvedValue(patientProfile)
  vi.mocked(getConversation).mockResolvedValue(conv as never)

  const ctrl = new AbortController()
  vi.mocked(llamaStream).mockImplementation(async function* () {
    yield "Hello "
    ctrl.abort()
    yield "world!" // should not be processed after abort
  })

  const res = await POST(
    makeRequest({ conversationId: "conv_1", messages: ["hi"] }, ctrl.signal)
  )

  // Drain the stream
  if (res.body) {
    const reader = res.body.getReader()
    while (true) {
      const { done } = await reader.read()
      if (done) break
    }
  }

  const allCreateCalls = vi.mocked(prisma.message.create).mock.calls
  const assistantCreates = allCreateCalls.filter(
    ([arg]) =>
      (arg as { data: { role: string } }).data.role === MessageRole.ASSISTANT
  )
  expect(assistantCreates).toHaveLength(0)
})
