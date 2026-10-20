"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { MessageRole } from "@/lib/generated/prisma/enums"
import { MODELS, labelFor } from "@/lib/models/registry"
import { updateConversationModel } from "@/app/(patient)/chat/actions"
import { CRISIS_FOLLOWUP } from "@/lib/guardrails"
import {
  CrisisButton,
  type CrisisButtonHandle,
} from "@/components/safety/CrisisButton"
import { QuickExit } from "@/components/safety/QuickExit"
import { AboutButton } from "@/components/safety/AboutButton"

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

const QUIET_WINDOW_MS = 5000
const HOLD_AFTER_COMPLETE_MS = 300

export function Chat({
  conversationId,
  initialMessages,
  avatar,
  initialModelId,
}: {
  conversationId: string
  initialMessages: InitialMessage[]
  avatar?: string
  initialModelId?: string
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
  const [currentModelId, setCurrentModelId] = useState(initialModelId ?? "")
  const [switchNotice, setSwitchNotice] = useState<string | null>(null)
  const [, startModelTransition] = useTransition()

  const [crisisActive, setCrisisActive] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)

  const pendingRef = useRef<string[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const crisisButtonRef = useRef<CrisisButtonHandle>(null)
  const crisisTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
            setCrisisActive(true)
            if (crisisTimerRef.current) clearTimeout(crisisTimerRef.current)
            crisisTimerRef.current = setTimeout(() => {
              setMessages((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  role: "crisis",
                  content: CRISIS_FOLLOWUP,
                },
              ])
              crisisButtonRef.current?.open()
            }, 45_000)
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
      if ((err as Error).name === "AbortError") {
        setStreamingContent("")
        setIsStreaming(false)
        return
      }
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
    if (crisisTimerRef.current) {
      clearTimeout(crisisTimerRef.current)
      crisisTimerRef.current = null
    }

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

  function handleModelChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newId = e.target.value
    if (newId === currentModelId) return
    setCurrentModelId(newId)
    if (!crisisActive) {
      setSwitchNotice(
        `Now talking with ${labelFor(newId)}. Everything you have shared so far is still here.`
      )
    }
    startModelTransition(async () => {
      await updateConversationModel(conversationId, newId)
    })
  }

  const canSubmit = input.trim().length > 0 && !held

  return (
    <div className="flex h-full flex-col">
      <CrisisButton ref={crisisButtonRef} />
      <QuickExit />
      <div className="flex items-center gap-2.5 border-b bg-sidebar/50 px-5 py-3">
        {avatar && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/avatars/${avatar.toLowerCase()}.png`}
            alt={avatar}
            width={28}
            height={28}
            className="rounded-full ring-2 ring-border"
          />
        )}
        <span className="text-sm font-semibold text-foreground">
          {avatar ?? "Companion"}
        </span>
        <AboutButton />
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
        {switchNotice && (
          <p className="text-center text-xs text-muted-foreground">
            {switchNotice}
          </p>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} avatar={avatar} />
        ))}
        {isStreaming && (
          <div className="flex flex-row gap-3">
            <div className="flex-shrink-0">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/avatars/${avatar.toLowerCase()}.png`}
                  alt={avatar}
                  width={40}
                  height={40}
                  className="rounded-full ring-1 ring-border"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-muted" />
              )}
            </div>
            <div className="max-w-[75%] rounded-2xl bg-muted/50 px-4 py-3 text-sm leading-relaxed shadow-sm">
              {streamingContent || <TypingIndicator />}
            </div>
          </div>
        )}
        {error && (
          <p className="py-2 text-center text-sm text-destructive">{error}</p>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="border-t bg-sidebar/30 px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              // Keep the quiet window alive while the user is actively typing.
              // Only reschedule if a flush is already pending — don't start a
              // new timer just from typing (that would delay messages for users
              // who type before pressing Enter).
              if (debounceRef.current) {
                clearTimeout(debounceRef.current)
                debounceRef.current = setTimeout(flushPending, QUIET_WINDOW_MS)
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder="Share what's on your mind..."
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-border bg-card px-4 py-3 text-sm leading-relaxed shadow-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="relative flex items-end gap-2">
            {modelMenuOpen && (
              <div className="absolute right-0 bottom-full mb-2 min-w-48 rounded-xl border border-border bg-card p-3 shadow-lg">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Model
                </p>
                <select
                  value={currentModelId}
                  onChange={(e) => {
                    handleModelChange(e)
                    setModelMenuOpen(false)
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-ring"
                >
                  {Object.entries(MODELS).map(([id, spec]) => (
                    <option key={id} value={id}>
                      {spec.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={() => setModelMenuOpen((o) => !o)}
              aria-label="Model settings"
              className="rounded-2xl border border-border bg-card p-3 text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
            >
              <GearIcon />
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
        <p className="mt-2 text-center text-[10px] text-muted-foreground/60">
          This companion is not a crisis service. In an emergency call{" "}
          <a href="tel:911" className="underline">
            911
          </a>{" "}
          or text/call{" "}
          <a href="tel:988" className="underline">
            988
          </a>
          .
        </p>
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
      <div className="rounded-2xl border border-destructive/30 bg-destructive/8 px-5 py-4 text-sm leading-relaxed text-destructive">
        {message.content}
      </div>
    )
  }
  const isUser = message.role === "user"
  const avatarSrc = avatar ? `/avatars/${avatar.toLowerCase()}.png` : null
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {!isUser && (
        <div className="flex-shrink-0">
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarSrc}
              alt={avatar ?? ""}
              width={40}
              height={40}
              className="rounded-full ring-1 ring-border"
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-muted" />
          )}
        </div>
      )}
      <div className="flex max-w-[72%] flex-col gap-1">
        {!isUser && avatar && (
          <span className="px-1 text-xs font-medium text-muted-foreground">
            {avatar}
          </span>
        )}
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted/50 text-foreground shadow-sm"
          }`}
        >
          {message.content}
        </div>
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

function GearIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}
