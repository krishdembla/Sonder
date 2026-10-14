// Characters that mark a natural place to flush the buffer to the UI: any
// whitespace, or sentence/clause punctuation. Flushing on these makes text
// appear a word or short phrase at a time rather than sub-word fragment by
// fragment (see 6.4).
export const BOUNDARY_CHARS = new Set([
  " ",
  "\t",
  "\n",
  "\r",
  ".",
  ",",
  "!",
  "?",
  ";",
  ":",
  ")",
  "]",
  "}",
  '"',
  "'",
  "—",
  "…",
])

// Hard cap so an unbroken run with no boundary (e.g. a long URL or token) still
// flushes at a phrase-sized length instead of stalling in the buffer.
export const MAX_BUFFER = 12

export function flushBoundary(buffer: string, done: boolean): [string, string] {
  if (done) return [buffer, ""]

  let lastBoundary = -1
  for (let i = 0; i < buffer.length; i++) {
    if (BOUNDARY_CHARS.has(buffer[i])) lastBoundary = i
  }
  if (lastBoundary !== -1) {
    return [buffer.slice(0, lastBoundary + 1), buffer.slice(lastBoundary + 1)]
  }
  if (buffer.length >= MAX_BUFFER) return [buffer, ""]
  return ["", buffer]
}

export async function* paced(
  rawFragments: AsyncIterable<string>,
  minChunkDelay: number,
  perCharDelay = 0,
  jitter = 0,
  _sleep?: (s: number) => Promise<void>
): AsyncGenerator<string> {
  const sleep =
    _sleep ?? ((s: number) => new Promise<void>((r) => setTimeout(r, s * 1000)))
  let buffer = ""
  for await (const fragment of rawFragments) {
    buffer += fragment
    const [toEmit, remainder] = flushBoundary(buffer, false)
    buffer = remainder
    if (toEmit) {
      yield toEmit
      let delay = minChunkDelay + toEmit.length * perCharDelay
      if (jitter) delay += Math.random() * jitter
      await sleep(delay)
    }
  }
  if (buffer) yield buffer
}
