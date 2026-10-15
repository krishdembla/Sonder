"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { MessageRole } from "@/lib/generated/prisma/enums"

type DisplayMessage = {
  id: string
  role: "user" | "assistant" | "crisis"
  content: string
}

type InitialMessage = {
  id: string
  role: MessageRole
  content: string
}

const QUIET_WINDOW_MS = 2500
const HOLD_AFTER_COMPLETE_MS = 300

export function Chat({
  conversationId,
  initialMessages,
  avatar,
}: {
  conversationId: string
  initialMessages: InitialMessage[]
  avatar?: string
}) {
  const [messages, setMessages] = useState<DisplayMessage[]>(() =>
    initialMessages.map((m) => ({
      id: m.id,
      role: m.role === MessageRole.USER ? "user" : "assistant",
      content: m.content,
    }))
  )
  const [streamingContent, setStreamingContent] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [held, setHeld] = useState(false)
  const [input, setInput] = useState("")

  const pendingRef = useRef<string[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, streamingContent])

  const flushPending = useCallback(async () => {
    const toSend = [...pendingRef.current]
    pendingRef.current = []
    if (!toSend.length) return

    const ctrl = new AbortController()
    abortRef.current = ctrl
    setIsStreaming(true)
    setStreamingContent("")
    setError(null)

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, messages: toSend }),
        signal: ctrl.signal,
      })

      if (!res.ok || !res.body) {
        setError("Could not reach the server. Please try again.")
        setIsStreaming(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ""
      let accumulated = ""

      outer: while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split("\n\n")
        buf = parts.pop() ?? ""
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue
          const event = JSON.parse(part.slice(6)) as {
            type: string
            content?: string
            message?: string
          }
          if (event.type === "token" && event.content) {
            accumulated += event.content
            setStreamingContent(accumulated)
          } else if (event.type === "done") {
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                content: accumulated,
              },
            ])
            setStreamingContent("")
            setIsStreaming(false)
            setHeld(true)
            setTimeout(() => setHeld(false), HOLD_AFTER_COMPLETE_MS)
            break outer
          } else if (event.type === "crisis" && event.content) {
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: "crisis",
                content: event.content!,
              },
            ])
            setStreamingContent("")
            setIsStreaming(false)
            break outer
          } else if (event.type === "error") {
            setError("Something went wrong. Please try again.")
            setStreamingContent("")
            setIsStreaming(false)
            break outer
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return
      setError("Could not reach the server. Please try again.")
      setStreamingContent("")
      setIsStreaming(false)
    }
  }, [conversationId])

  const handleSubmit = useCallback(() => {
    const text = input.trim()
    if (!text || held) return

    setInput("")
    setError(null)

    abortRef.current?.abort()

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: text },
    ])

    pendingRef.current.push(text)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(flushPending, QUIET_WINDOW_MS)
  }, [input, held, flushPending])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const canSubmit = input.trim().length > 0 && !held

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} avatar={avatar} />
        ))}
        {isStreaming && streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[75%] rounded-2xl bg-muted px-4 py-2 text-sm">
              {streamingContent}
            </div>
          </div>
        )}
        {isStreaming && !streamingContent && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-muted px-4 py-2 text-sm">
              <TypingIndicator />
            </div>
          </div>
        )}
        {error && (
          <p className="py-2 text-center text-sm text-destructive">{error}</p>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="border-t p-4">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 resize-none rounded-xl border bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  avatar,
}: {
  message: DisplayMessage
  avatar?: string
}) {
  if (message.role === "crisis") {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {message.content}
      </div>
    )
  }
  const isUser = message.role === "user"
  return (
    <div
      className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}
    >
      {!isUser && avatar && (
        <span className="px-1 text-xs text-muted-foreground">{avatar}</span>
      )}
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        }`}
      >
        {message.content}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <span className="flex h-4 items-center gap-1">
      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
    </span>
  )
}
