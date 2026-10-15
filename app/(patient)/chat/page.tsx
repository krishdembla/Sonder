import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { Role } from "@/lib/generated/prisma/enums"
import { prisma } from "@/lib/db"
import { LLAMA } from "@/lib/models/registry"

export default async function ChatIndexPage() {
  const profile = await requireRole([Role.PATIENT, Role.ADMIN])
  const conv = await prisma.conversation.create({
    data: {
      userId: profile.id,
      title: "New conversation",
      modelId: LLAMA,
      setup: {},
    },
  })
  redirect(`/chat/${conv.id}`)
}
