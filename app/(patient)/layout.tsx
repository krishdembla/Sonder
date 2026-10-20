import { requireRole } from "@/lib/auth"
import { Role } from "@/lib/generated/prisma/enums"

export default async function PatientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireRole([Role.PATIENT, Role.ADMIN])
  return <>{children}</>
}
