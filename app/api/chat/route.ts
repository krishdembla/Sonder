import type { NextRequest } from "next/server"
import { getCurrentProfile } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getConversation, ForbiddenError } from "@/lib/db/queries"
import { isCrisis, CRISIS_RESPONSE } from "@/lib/guardrails"
import { forModel } from "@/lib/history"
import { llamaStream } from "@/lib/models/llama"
import { mistralStream } from "@/lib/models/mistral"
import { MISTRAL } from "@/lib/models/registry"
import { MessageRole } from "@/lib/generated/prisma/enums"

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
}

function sseChunk(data: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
}

async function* chatSSE(
  conversationId: string,
  modelId: string,
  userMessages: string[],
  signal: AbortSignal
): AsyncGenerator<Uint8Array> {
  // Store each user message first (always persisted, even on later abort)
  for (const content of userMessages) {
    await prisma.message.create({
      data: { conversationId, role: MessageRole.USER, content, modelId },
    })
  }

  // Crisis check runs on raw text before any model call (hard rule 2)
  for (const content of userMessages) {
    if (isCrisis(content)) {
      await prisma.message.create({
        data: {
          conversationId,
          role: MessageRole.ASSISTANT,
          content: CRISIS_RESPONSE,
          modelId,
        },
      })
      yield sseChunk({ type: "crisis", content: CRISIS_RESPONSE })
      return
    }
  }

  if (signal.aborted) return

  // Build full history from DB (includes just-stored user messages)
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  })
  const history = forModel(
    rows.map((m) => ({
      role: m.role === MessageRole.USER ? "user" : ("assistant" as const),
      content: m.content,
    }))
  )

  const streamFn = modelId === MISTRAL ? mistralStream : llamaStream

  let assistantContent = ""
  try {
    for await (const chunk of streamFn(history, signal)) {
      if (signal.aborted) break
      assistantContent += chunk
      yield sseChunk({ type: "token", content: chunk })
    }

    if (!signal.aborted && assistantContent) {
      await prisma.message.create({
        data: {
          conversationId,
          role: MessageRole.ASSISTANT,
          content: assistantContent,
          modelId,
        },
      })
      yield sseChunk({ type: "done" })
    }
  } catch {
    // Do not include error details — they may reference model input (rule 9)
    if (!signal.aborted) {
      yield sseChunk({
        type: "error",
        message: "Model unavailable. Please try again.",
      })
    }
  }
}

function iterToStream(
  iter: AsyncIterable<Uint8Array>
): ReadableStream<Uint8Array> {
  const it = iter[Symbol.asyncIterator]()
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await it.next()
        if (done) {
          controller.close()
        } else {
          controller.enqueue(value)
        }
      } catch {
        controller.close()
      }
    },
    cancel() {
      it.return?.()
    },
  })
}

export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile()
  if (!profile) return new Response("Unauthorized", { status: 401 })

  let body: { conversationId?: unknown; messages?: unknown }
  try {
    body = await req.json()
  } catch {
    return new Response("Bad Request", { status: 400 })
  }

  const { conversationId, messages } = body
  if (
    !conversationId ||
    typeof conversationId !== "string" ||
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.some((m) => typeof m !== "string" || !(m as string).trim())
  ) {
    return new Response("Bad Request", { status: 400 })
  }

  let conv: Awaited<ReturnType<typeof getConversation>>
  try {
    conv = await getConversation(profile, conversationId)
  } catch (err) {
    if (err instanceof ForbiddenError)
      return new Response("Forbidden", { status: 403 })
    throw err
  }

  return new Response(
    iterToStream(
      chatSSE(conversationId, conv.modelId, messages as string[], req.signal)
    ),
    { headers: SSE_HEADERS }
  )
}
