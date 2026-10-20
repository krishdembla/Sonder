import { describe, it, expect, vi, beforeEach } from "vitest"
import { ForbiddenError, getConversation, getConversations } from "./queries"
import { Role } from "@/lib/generated/prisma/enums"
import type { Profile } from "@/lib/auth"

// ─── Mock prisma ──────────────────────────────────────────────────────────────

vi.mock("./index", () => ({
  prisma: {
    conversation: {
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    clinicianAssignment: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    message: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from "./index"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProfile(role: Role, id = "user_1"): Profile {
  return { id, role, displayName: null, createdAt: new Date() }
}

const conv1 = {
  id: "conv_1",
  userId: "user_1",
  title: "Chat",
  modelId: "llama3",
  setup: {},
  createdAt: new Date(),
  updatedAt: new Date(),
}

const conv2 = {
  id: "conv_2",
  userId: "user_2",
  title: "Another chat",
  modelId: "llama3",
  setup: {},
  createdAt: new Date(),
  updatedAt: new Date(),
}

beforeEach(() => vi.clearAllMocks())

// ─── getConversations ─────────────────────────────────────────────────────────

describe("getConversations", () => {
  it("returns only own conversations for a patient", async () => {
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([conv1])
    const result = await getConversations(makeProfile(Role.PATIENT, "user_1"))
    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user_1" } })
    )
    expect(result).toEqual([conv1])
  })

  it("returns conversations for assigned patients for a clinician", async () => {
    vi.mocked(prisma.clinicianAssignment.findMany).mockResolvedValue([
      { patientId: "user_1" } as never,
    ])
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([conv1])
    const profile = makeProfile(Role.CLINICIAN, "clin_1")
    await getConversations(profile)
    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: { in: ["user_1"] } } })
    )
  })

  it("returns no conversations for a clinician with no assignments", async () => {
    vi.mocked(prisma.clinicianAssignment.findMany).mockResolvedValue([])
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([])
    const profile = makeProfile(Role.CLINICIAN, "clin_1")
    const result = await getConversations(profile)
    expect(result).toEqual([])
  })
})

// ─── getConversation ──────────────────────────────────────────────────────────

describe("getConversation", () => {
  it("returns a conversation the patient owns", async () => {
    vi.mocked(prisma.conversation.findUniqueOrThrow).mockResolvedValue(conv1)
    const result = await getConversation(
      makeProfile(Role.PATIENT, "user_1"),
      "conv_1"
    )
    expect(result).toEqual(conv1)
  })

  it("throws ForbiddenError when patient accesses another patient's conversation", async () => {
    vi.mocked(prisma.conversation.findUniqueOrThrow).mockResolvedValue(conv2)
    await expect(
      getConversation(makeProfile(Role.PATIENT, "user_1"), "conv_2")
    ).rejects.toThrow(ForbiddenError)
  })

  it("allows a clinician to access an assigned patient's conversation", async () => {
    vi.mocked(prisma.conversation.findUniqueOrThrow).mockResolvedValue(conv1)
    vi.mocked(prisma.clinicianAssignment.findUnique).mockResolvedValue({
      clinicianId: "clin_1",
      patientId: "user_1",
      createdAt: new Date(),
    })
    const result = await getConversation(
      makeProfile(Role.CLINICIAN, "clin_1"),
      "conv_1"
    )
    expect(result).toEqual(conv1)
  })

  it("throws ForbiddenError when clinician accesses a non-assigned patient's conversation", async () => {
    vi.mocked(prisma.conversation.findUniqueOrThrow).mockResolvedValue(conv1)
    vi.mocked(prisma.clinicianAssignment.findUnique).mockResolvedValue(null)
    await expect(
      getConversation(makeProfile(Role.CLINICIAN, "clin_1"), "conv_1")
    ).rejects.toThrow(ForbiddenError)
  })
})
