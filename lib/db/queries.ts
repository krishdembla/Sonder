import { prisma } from "./index"
import { Role } from "@/lib/generated/prisma/enums"
import type { Profile } from "@/lib/auth"

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message)
    this.name = "ForbiddenError"
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function getAssignedPatientIds(clinicianId: string): Promise<string[]> {
  const rows = await prisma.clinicianAssignment.findMany({
    where: { clinicianId },
    select: { patientId: true },
  })
  return rows.map((r) => r.patientId)
}

async function assertCanAccessConversation(
  profile: Profile,
  ownerUserId: string
): Promise<void> {
  if (profile.role === Role.ADMIN) return
  if (profile.role === Role.PATIENT) {
    if (profile.id !== ownerUserId) throw new ForbiddenError()
    return
  }
  // CLINICIAN: must be assigned to this patient
  const assignment = await prisma.clinicianAssignment.findUnique({
    where: {
      clinicianId_patientId: {
        clinicianId: profile.id,
        patientId: ownerUserId,
      },
    },
  })
  if (!assignment) throw new ForbiddenError()
}

// ─── Conversations ─────────────────────────────────────────────────────────────

export async function getConversations(profile: Profile) {
  if (profile.role === Role.PATIENT) {
    return prisma.conversation.findMany({
      where: { userId: profile.id },
      orderBy: { updatedAt: "desc" },
    })
  }
  if (profile.role === Role.ADMIN) {
    return prisma.conversation.findMany({ orderBy: { updatedAt: "desc" } })
  }
  // CLINICIAN: only assigned patients
  const patientIds = await getAssignedPatientIds(profile.id)
  return prisma.conversation.findMany({
    where: { userId: { in: patientIds } },
    orderBy: { updatedAt: "desc" },
  })
}

export async function getConversation(
  profile: Profile,
  conversationId: string
) {
  const conv = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
  })
  await assertCanAccessConversation(profile, conv.userId)
  return conv
}

// ─── Messages ──────────────────────────────────────────────────────────────────

export async function getMessages(profile: Profile, conversationId: string) {
  await getConversation(profile, conversationId)
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  })
}
