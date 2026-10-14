import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/lib/generated/prisma/client"

function makeClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  })
  return new PrismaClient({ adapter })
}

type PrismaClientInstance = ReturnType<typeof makeClient>

declare global {
  var __prisma: PrismaClientInstance | undefined
}

export const prisma: PrismaClientInstance = globalThis.__prisma ?? makeClient()

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma
}
