import { requireRole } from "@/lib/auth"
import { Role } from "@/lib/generated/prisma/enums"

export default async function ClinicianLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireRole([Role.CLINICIAN, Role.ADMIN])
  return <>{children}</>
}
