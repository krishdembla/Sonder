"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  renameConversation,
  deleteConversation,
} from "@/app/(patient)/chat/actions"

type ConversationItem = {
  id: string
  title: string
}

export function Sidebar({
  conversations,
}: {
  conversations: ConversationItem[]
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [, startTransition] = useTransition()

  const currentId = pathname.startsWith("/chat/")
    ? pathname.split("/")[2]
    : null

  function startRename(conv: ConversationItem) {
    setRenamingId(conv.id)
    setRenameValue(conv.title)
  }

  function commitRename(id: string) {
    const value = renameValue
    setRenamingId(null)
    startTransition(async () => {
      await renameConversation(id, value)
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteConversation(id)
      if (id === currentId) router.push("/chat")
    })
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar">
      <div className="p-3">
        <Link
          href="/chat"
          className="flex w-full items-center justify-center rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          + New conversation
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {conversations.map((conv) => {
          const isActive = conv.id === currentId
          const isRenaming = renamingId === conv.id
          return (
            <div
              key={conv.id}
              className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm ${
                isActive ? "bg-accent" : "hover:bg-accent/50"
              }`}
            >
              {isRenaming ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => commitRename(conv.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(conv.id)
                    if (e.key === "Escape") setRenamingId(null)
                  }}
                  className="min-w-0 flex-1 bg-transparent outline-none"
                />
              ) : (
                <Link
                  href={`/chat/${conv.id}`}
                  className="min-w-0 flex-1 truncate"
                >
                  {conv.title}
                </Link>
              )}
              {!isRenaming && (
                <span className="hidden shrink-0 gap-0.5 group-hover:flex">
                  <button
                    onClick={() => startRename(conv)}
                    className="rounded p-0.5 hover:bg-accent"
                    aria-label="Rename"
                  >
                    <PencilIcon />
                  </button>
                  <button
                    onClick={() => handleDelete(conv.id)}
                    className="rounded p-0.5 hover:bg-destructive/20 hover:text-destructive"
                    aria-label="Delete"
                  >
                    <TrashIcon />
                  </button>
                </span>
              )}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}

function PencilIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  )
}
