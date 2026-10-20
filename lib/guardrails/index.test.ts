import { describe, it, expect } from "vitest"
import {
  CRISIS_PHRASES,
  CRISIS_RESPONSE,
  CRISIS_FOLLOWUP,
  isCrisis,
  matchedPhrases,
} from "./index"

describe("every listed phrase triggers", () => {
  it.each(CRISIS_PHRASES as string[])('detects "%s"', (phrase) => {
    expect(isCrisis(phrase)).toBe(true)
    expect(matchedPhrases(phrase)).toContain(phrase)
  })
})

describe("crisis messages in context", () => {
  it.each([
    "I want to die",
    "sometimes I just want to die honestly",
    "I don't want to be here anymore",
    "I keep thinking I should kill myself",
    "everyone would be better off without me",
    "there's no reason to live",
    "I've been having suicidal thoughts",
    "I can't go on like this",
  ])('detects "%s"', (message) => {
    expect(isCrisis(message)).toBe(true)
  })
})

describe("self-harm method messages trigger", () => {
  it.each([
    "I feel so stressed that I feel like slicing my wrist is the only way to relive the pain",
    "I've been thinking about cutting my wrists",
    "I just want to slit my wrist and be done",
    "maybe I should just hang myself",
    "I've been saving up my pills to take all my pills at once",
    "I keep thinking I'll jump off a bridge",
    "some nights I just don't want to wake up",
  ])('detects "%s"', (message) => {
    expect(isCrisis(message)).toBe(true)
  })
})

describe("expanded ideation phrasings trigger", () => {
  it.each([
    "honestly I wish I was dead",
    "some days I wish I were dead",
    "I feel like there's nothing to live for",
    "I just don't want to exist anymore",
    "I've thought about how to put an end to my life",
    "i want to kill my self",
    "I wish I had never been born",
  ])('detects "%s"', (message) => {
    expect(isCrisis(message)).toBe(true)
  })
})

describe("cut lookalikes do not trigger", () => {
  it.each([
    "every time I talk to my family they keep cutting me off",
    "I cut my finger chopping vegetables",
    "I hurt my wrist at the gym yesterday",
    "please stop cutting in line",
    "the editor kept cutting my best scenes",
  ])('"%s" is benign', (message) => {
    expect(isCrisis(message)).toBe(false)
    expect(matchedPhrases(message)).toEqual([])
  })
})

it("is case insensitive", () => {
  expect(isCrisis("I WANT TO DIE")).toBe(true)
  expect(isCrisis("Kill Myself")).toBe(true)
})

it("punctuation does not block match", () => {
  expect(isCrisis("...I want to die.")).toBe(true)
  expect(isCrisis("suicide?")).toBe(true)
})

it("normalizes curly apostrophes", () => {
  expect(isCrisis("I don’t want to be here anymore")).toBe(true)
  expect(isCrisis("I can’t go on")).toBe(true)
})

it("handles hyphen and spacing variants", () => {
  expect(isCrisis("thoughts of self-harm")).toBe(true)
  expect(isCrisis("thoughts of self harm")).toBe(true)
  expect(isCrisis("I   want   to   die")).toBe(true)
})

describe("benign messages do not trigger", () => {
  it.each([
    "I feel great today!",
    "My diet is going really well this month",
    "My grandmother died last year and I still miss her",
    "I'm learning a new skill at work",
    "We watched a movie about an assassin",
    "I want to try the new restaurant downtown",
    "Life has been busy but good",
    "I wish I could disappear on a long vacation",
    "does this old file still exist on the server",
    "let's put an end to this argument",
    "there's so much to live for these days",
    "",
    "   ",
  ])('"%s" is benign', (message) => {
    expect(isCrisis(message)).toBe(false)
    expect(matchedPhrases(message)).toEqual([])
  })
})

it("isCrisis agrees with matchedPhrases", () => {
  for (const message of ["I want to die", "I feel great today!", ""]) {
    expect(isCrisis(message)).toBe(matchedPhrases(message).length > 0)
  }
})

it("CRISIS_RESPONSE contains all three resources and a safety check-in", () => {
  expect(CRISIS_RESPONSE).toContain("988")
  expect(CRISIS_RESPONSE).toContain("741741")
  expect(CRISIS_RESPONSE).toContain("911")
  expect(CRISIS_RESPONSE.toLowerCase()).toContain("safe right now")
})

it("CRISIS_FOLLOWUP contains all three resources and a safety check-in", () => {
  expect(CRISIS_FOLLOWUP).toContain("988")
  expect(CRISIS_FOLLOWUP).toContain("741741")
  expect(CRISIS_FOLLOWUP).toContain("911")
  expect(CRISIS_FOLLOWUP.toLowerCase()).toContain("safe right now")
})
