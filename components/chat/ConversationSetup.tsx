"use client"

import { useState, useTransition } from "react"
import { AVATAR_NAMES, type AvatarName } from "@/lib/avatars"
import { createConversationWithSetup } from "@/app/(patient)/chat/actions"

const AVATAR_IMAGES: Record<AvatarName, string> = {
  Cloud: "/avatars/cloud.png",
  Ember: "/avatars/ember.png",
  Moon: "/avatars/moon.png",
  Heart: "/avatars/heart.png",
}

export function ConversationSetup() {
  const [avatar, setAvatar] = useState<AvatarName | null>(null)
  const [userName, setUserName] = useState("")
  const [conversationTitle, setConversationTitle] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    if (!avatar) return
    startTransition(async () => {
      await createConversationWithSetup(avatar, userName, conversationTitle)
    })
  }

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Choose your companion</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick an avatar, then start whenever you are ready.
          </p>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {AVATAR_NAMES.map((name) => (
            <button
              key={name}
              onClick={() => setAvatar(name)}
              className={`flex flex-col items-center gap-2 rounded-xl border p-3 transition-colors ${
                avatar === name
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={AVATAR_IMAGES[name]}
                alt={name}
                width={48}
                height={48}
                className="rounded-full"
              />
              <span className="text-xs font-medium">{name}</span>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="conversation-title">
            Conversation name{" "}
            <span className="text-muted-foreground">(optional)</span>
          </label>
          <input
            id="conversation-title"
            type="text"
            value={conversationTitle}
            onChange={(e) => setConversationTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit()
            }}
            placeholder={
              avatar ? `${avatar} – my session` : "Give this session a name"
            }
            className="w-full rounded-xl border bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="user-name">
            What should {avatar ?? "your companion"} call you?{" "}
            <span className="text-muted-foreground">(optional)</span>
          </label>
          <input
            id="user-name"
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit()
            }}
            placeholder="Your name"
            className="w-full rounded-xl border bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={!avatar || isPending}
          className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground shadow-sm disabled:opacity-50"
        >
          {isPending ? "Starting..." : "Start conversation"}
        </button>
      </div>
    </div>
  )
}
