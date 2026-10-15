"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getConversation } from "@/lib/db/queries"
import { Role, MessageRole } from "@/lib/generated/prisma/enums"
import { LLAMA, resolve } from "@/lib/models/registry"

export const AVATAR_NAMES = ["Cloud", "Ember", "Moon", "Heart"] as const
export type AvatarName = (typeof AVATAR_NAMES)[number]

function greetingText(userName: string): string {
  const who = userName.trim() ? `, ${userName.trim()}` : ""
  return (
    `Hello${who}. I'm really glad you're here. Whenever you're ready, share ` +
    "whatever's on your mind. There's no rush."
  )
}

export async function createConversationWithSetup(
  avatar: AvatarName,
  userName: string
) {
  const profile = await requireRole([Role.PATIENT, Role.ADMIN])
  const conv = await prisma.conversation.create({
    data: {
      userId: profile.id,
      title: avatar,
      modelId: LLAMA,
      setup: { avatar, userName: userName.trim() },
    },
  })
  await prisma.message.create({
    data: {
      conversationId: conv.id,
      role: MessageRole.ASSISTANT,
      content: greetingText(userName),
      modelId: conv.modelId,
    },
  })
  redirect(`/chat/${conv.id}`)
}

export async function renameConversation(
  conversationId: string,
  title: string
) {
  const profile = await requireRole([Role.PATIENT, Role.ADMIN])
  await getConversation(profile, conversationId)
  const trimmed = title.trim()
  if (!trimmed) return
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { title: trimmed },
  })
  revalidatePath("/chat", "layout")
}

export async function deleteConversation(conversationId: string) {
  const profile = await requireRole([Role.PATIENT, Role.ADMIN])
  await getConversation(profile, conversationId)
  await prisma.conversation.delete({ where: { id: conversationId } })
  revalidatePath("/chat", "layout")
}

export async function updateConversationModel(
  conversationId: string,
  modelId: string
) {
  const profile = await requireRole([Role.PATIENT, Role.ADMIN])
  await getConversation(profile, conversationId)
  const resolvedId = resolve(modelId)
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { modelId: resolvedId },
  })
}
