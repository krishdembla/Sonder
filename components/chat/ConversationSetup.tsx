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
      <div className="w-full max-w-sm space-y-7">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Choose your companion
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick an avatar, then start whenever you are ready.
          </p>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {AVATAR_NAMES.map((name) => (
            <button
              key={name}
              onClick={() => setAvatar(name)}
              className={`flex flex-col items-center gap-2 rounded-2xl border p-3 transition-all ${
                avatar === name
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-border hover:border-primary/40 hover:bg-accent/50"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={AVATAR_IMAGES[name]}
                alt={name}
                width={52}
                height={52}
                className={`rounded-full transition-all ${
                  avatar === name ? "ring-2 ring-primary ring-offset-1" : ""
                }`}
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
            className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring"
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
            className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={!avatar || isPending}
          className="w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity disabled:opacity-40"
        >
          {isPending ? "Starting..." : "Start conversation"}
        </button>
      </div>
    </div>
  )
}
