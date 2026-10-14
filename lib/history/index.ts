type Turn = { role: "user" | "assistant"; content: string }

const VALID_ROLES = new Set(["user", "assistant"])

function isValidTurn(turn: unknown): turn is { role: string; content: string } {
  if (!turn || typeof turn !== "object") return false
  const t = turn as Record<string, unknown>
  if (!VALID_ROLES.has(t["role"] as string)) return false
  const content = t["content"]
  return typeof content === "string" && content.trim() !== ""
}

export function sanitize(turns: unknown): Turn[] {
  if (!turns || !Array.isArray(turns)) return []
  return turns.filter(isValidTurn).map((t) => ({
    role: t["role"] as "user" | "assistant",
    content: t["content"],
  }))
}

export function coalesce(turns: Turn[]): Turn[] {
  const merged: Turn[] = []
  for (const turn of turns) {
    if (merged.length > 0 && merged[merged.length - 1].role === turn.role) {
      merged[merged.length - 1] = {
        role: turn.role,
        content: merged[merged.length - 1].content + "\n" + turn.content,
      }
    } else {
      merged.push({ ...turn })
    }
  }
  return merged
}

export function forModel(turns: unknown): Turn[] {
  return coalesce(sanitize(turns))
}
