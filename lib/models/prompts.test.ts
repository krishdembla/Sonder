import { it, expect } from "vitest"
import {
  LLAMA_SYSTEM_PROMPT,
  MISTRAL_SYSTEM_PROMPT,
  REWRITE_SYSTEM_PROMPT,
} from "./prompts"

it("Llama system prompt matches the old repo verbatim", () => {
  // Key phrases that are diagnostic of the correct version
  expect(LLAMA_SYSTEM_PROMPT).toContain(
    "You are a warm, genuine companion for someone who wants to talk through how they're feeling."
  )
  expect(LLAMA_SYSTEM_PROMPT).toContain(
    "You are a baseline test model, not one of DSAIL's fine-tuned mental health models"
  )
  expect(LLAMA_SYSTEM_PROMPT).toContain(
    "Ugh, that stuck-at-your-desk feeling is brutal"
  )
  expect(LLAMA_SYSTEM_PROMPT).toContain(
    "a person experiencing suicidal thoughts,"
  )
  expect(LLAMA_SYSTEM_PROMPT).toContain("Safe messaging:")
})

it("Mistral system prompt matches the old repo verbatim", () => {
  expect(MISTRAL_SYSTEM_PROMPT).toBe(
    "You are a professional counselor providing ethical, supportive, and psychologically appropriate counseling responses. Maintain empathy, careful listening, reflection, summarizing, concern, positive regard, genuineness, and accurate understanding. Respond naturally and professionally."
  )
})

it("V4 rewriter prompt matches the old repo verbatim", () => {
  expect(REWRITE_SYSTEM_PROMPT).toContain(
    "You are a trauma-informed mental health counselor who is also sensitive to cultural context, including Chinese cultural values."
  )
  expect(REWRITE_SYSTEM_PROMPT).toContain("Prioritise psychological safety")
  expect(REWRITE_SYSTEM_PROMPT).toContain(
    "Validate feelings explicitly before offering any reframe or guidance."
  )
  expect(REWRITE_SYSTEM_PROMPT).toContain(
    "collectivist values such as family obligation, face concerns, and indirect expression of emotion"
  )
  expect(REWRITE_SYSTEM_PROMPT).toContain(
    "shame and stigma around mental health may be present"
  )
  expect(REWRITE_SYSTEM_PROMPT).toContain(
    "Do not diagnose, prescribe, or probe for trauma details."
  )
})
