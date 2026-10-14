import { describe, it, expect } from "vitest"
import {
  LLAMA,
  MISTRAL,
  MODELS,
  DEFAULT_MODEL,
  resolve,
  labelFor,
} from "./registry"

it("every model has the required fields", () => {
  for (const [modelId, spec] of Object.entries(MODELS)) {
    expect(typeof modelId).toBe("string")
    expect(modelId.length).toBeGreaterThan(0)
    expect(typeof spec.label).toBe("string")
    expect(spec.label.length).toBeGreaterThan(0)
    expect(typeof spec.description).toBe("string")
    expect(spec.description.length).toBeGreaterThan(0)
    expect(typeof spec.available).toBe("boolean")
  }
})

it("default model is registered and available", () => {
  expect(DEFAULT_MODEL in MODELS).toBe(true)
  expect(MODELS[DEFAULT_MODEL].available).toBe(true)
})

it("both planned models are present", () => {
  expect(LLAMA in MODELS).toBe(true)
  expect(MISTRAL in MODELS).toBe(true)
})

it("Mistral is marked available", () => {
  expect(MODELS[MISTRAL].available).toBe(true)
})

describe("resolve", () => {
  it.each([null, undefined, "", "nonsense", "gpt-4", "Llama 3.1 8B Instruct"])(
    "unknown id %s falls back to the default",
    (stored) => {
      expect(resolve(stored)).toBe(DEFAULT_MODEL)
    }
  )

  it.each(Object.keys(MODELS))("known id %s resolves to itself", (modelId) => {
    expect(resolve(modelId)).toBe(modelId)
  })
})

it("labelFor falls back gracefully on bad input", () => {
  expect(labelFor("nonsense")).toBe(MODELS[DEFAULT_MODEL].label)
  expect(labelFor(null)).toBe(MODELS[DEFAULT_MODEL].label)
})
