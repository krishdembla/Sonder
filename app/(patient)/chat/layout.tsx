import { requireRole } from "@/lib/auth"
import { Role } from "@/lib/generated/prisma/enums"
import { getConversations } from "@/lib/db/queries"
import { Sidebar } from "@/components/chat/Sidebar"

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await requireRole([Role.PATIENT, Role.ADMIN])
  const conversations = await getConversations(profile)

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        conversations={conversations.map((c) => ({ id: c.id, title: c.title }))}
      />
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
