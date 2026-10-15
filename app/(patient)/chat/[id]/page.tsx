import { notFound } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { Role } from "@/lib/generated/prisma/enums"
import { getConversation, getMessages, ForbiddenError } from "@/lib/db/queries"
import { Chat } from "@/components/chat/Chat"

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const profile = await requireRole([Role.PATIENT, Role.ADMIN])

  let conv: Awaited<ReturnType<typeof getConversation>>
  let messages: Awaited<ReturnType<typeof getMessages>>
  try {
    conv = await getConversation(profile, id)
    messages = await getMessages(profile, id)
  } catch (err) {
    if (err instanceof ForbiddenError) notFound()
    if ((err as { code?: string }).code === "P2025") notFound()
    throw err
  }

  const setup = (conv.setup as { avatar?: string; userName?: string }) ?? {}

  return (
    <Chat
      conversationId={conv.id}
      initialMessages={messages}
      avatar={setup.avatar}
      initialModelId={conv.modelId}
    />
  )
}
