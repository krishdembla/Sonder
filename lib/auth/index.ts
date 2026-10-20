import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { Role } from "@/lib/generated/prisma/enums"

export { Role }
export type Profile = NonNullable<Awaited<ReturnType<typeof getCurrentProfile>>>

export async function getCurrentProfile() {
  const { userId } = await auth()
  if (!userId) return null
  return prisma.profile.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId },
  })
}

export function checkRole(
  profile: { role: Role } | null | undefined,
  allowedRoles: Role[]
): boolean {
  if (!profile) return false
  return allowedRoles.includes(profile.role)
}

export async function requireRole(allowedRoles: Role[]): Promise<Profile> {
  const profile = await getCurrentProfile()
  if (!checkRole(profile, allowedRoles)) {
    redirect("/")
  }
  return profile!
}

export function assertOwnsPatient(
  actingProfile: { role: Role; id: string },
  targetUserId: string
): void {
  if (
    actingProfile.role === Role.PATIENT &&
    actingProfile.id !== targetUserId
  ) {
    throw new Error("Forbidden")
  }
  // CLINICIAN / ADMIN: assignment check is added in Slice 2
}
