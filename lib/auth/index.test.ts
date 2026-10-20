import { describe, it, expect } from "vitest"
import { checkRole, assertOwnsPatient } from "./index"
import { Role } from "@/lib/generated/prisma/enums"

describe("checkRole", () => {
  it("returns true when role is in allowedRoles", () => {
    expect(checkRole({ role: Role.PATIENT }, [Role.PATIENT])).toBe(true)
  })

  it("returns true when ADMIN is in any allowed list", () => {
    expect(checkRole({ role: Role.ADMIN }, [Role.PATIENT, Role.ADMIN])).toBe(
      true
    )
    expect(checkRole({ role: Role.ADMIN }, [Role.CLINICIAN, Role.ADMIN])).toBe(
      true
    )
  })

  it("returns false when role is not in allowedRoles", () => {
    expect(checkRole({ role: Role.PATIENT }, [Role.CLINICIAN])).toBe(false)
    expect(checkRole({ role: Role.CLINICIAN }, [Role.PATIENT])).toBe(false)
  })

  it("returns false for null profile", () => {
    expect(checkRole(null, [Role.PATIENT])).toBe(false)
  })
})

describe("assertOwnsPatient", () => {
  it("passes when a patient accesses their own data", () => {
    expect(() =>
      assertOwnsPatient({ role: Role.PATIENT, id: "user_1" }, "user_1")
    ).not.toThrow()
  })

  it("throws when a patient accesses another patient's data", () => {
    expect(() =>
      assertOwnsPatient({ role: Role.PATIENT, id: "user_1" }, "user_2")
    ).toThrow("Forbidden")
  })

  it("passes when a clinician accesses any patient (Slice 2 adds assignment check)", () => {
    expect(() =>
      assertOwnsPatient({ role: Role.CLINICIAN, id: "clin_1" }, "user_1")
    ).not.toThrow()
  })

  it("passes when an admin accesses any patient", () => {
    expect(() =>
      assertOwnsPatient({ role: Role.ADMIN, id: "admin_1" }, "user_1")
    ).not.toThrow()
  })
})
