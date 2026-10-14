// Stable ids, stored per conversation. Changing one orphans the stored
// selection on existing conversations, so treat them as persisted values, not labels.
export const LLAMA = "llama3.1-8b"
export const MISTRAL = "mistral-7b-mental-health"

type ModelSpec = {
  label: string
  description: string
  available: boolean
}

export const MODELS: Record<string, ModelSpec> = {
  [LLAMA]: {
    label: "LLaMA 3.1 8B",
    description:
      "Meta's Llama 3.1 8B Instruct, served locally via Ollama - the " +
      "baseline model for this iteration.",
    available: true,
  },
  [MISTRAL]: {
    label: "Mistral 7B — Mental Health Companion",
    description:
      "Shruti and Newell's bilingual Mistral-7B fine-tune with a " +
      "trauma-informed, culturally-aware query rewriting step, served " +
      "via vLLM with a LoRA adapter.",
    available: true,
  },
}

export const DEFAULT_MODEL = LLAMA

export function resolve(modelId: string | null | undefined): string {
  return modelId != null && modelId in MODELS ? modelId : DEFAULT_MODEL
}

export function labelFor(modelId: string | null | undefined): string {
  return MODELS[resolve(modelId)].label
}
