/**
 * Reading the head of a streamed answer before any of it reaches the reader.
 *
 * A reasoning model on the free tier will sometimes write its own thinking
 * out loud before answering: "The user asks...", "We must follow policy...",
 * quoting phrases straight out of the system prompt on the way. Measured at
 * roughly one plain question in six, and it does not take an adversarial
 * prompt to happen. `looksLikePromptLeak` knows the shape; this is what puts
 * it in front of a stream.
 *
 * It lives here rather than in the route so it can be tested. A route file
 * may only export handlers.
 */
import { looksLikePromptLeak } from "@/lib/ai/prompt-leak";

/** Any stream part. The route's parts carry more, none of which matters here. */
export type LeakStreamPart = { type: string };

/*
  How much of the answer to read before letting any of it go.

  The narration is at the head, in the first sentence or two, so 240
  characters is enough to see it and short enough that nobody feels the
  wait: the parts are already in flight and the reader has not been shown a
  word either way.

  The alternative was cutting the reply off mid-stream, which means the leak
  flashes on screen before it is replaced, and a reader who saw it does not
  care that it went away.
*/
export const LEAK_SNIFF_CHARS = 240;

/** `fullStream` puts the text on `text`; `delta` belongs to the UI stream. */
export function deltaText(part: LeakStreamPart): string {
  return part.type === "text-delta"
    ? String((part as { text?: unknown }).text ?? "")
    : "";
}

export type PeekResult<P> =
  | { ok: true; prefix: P[]; iterator: AsyncIterator<P> }
  | { ok: false; reason: "died" | "leak" };

/**
 * Pull parts until the answer has started, then, if it started in words,
 * read enough of it to judge. Everything pulled stays in `prefix`, so a
 * clean answer is replayed whole and the reader loses nothing.
 */
export async function peekUntilUseful<P extends LeakStreamPart>(
  stream: AsyncIterable<P>,
  useful: ReadonlySet<string>
): Promise<PeekResult<P>> {
  const iterator = stream[Symbol.asyncIterator]();
  const prefix: P[] = [];

  for (let i = 0; i < 40; i++) {
    const step = await iterator.next();
    if (step.done) return { ok: false, reason: "died" };
    const part = step.value;
    prefix.push(part);
    if (part.type === "error") return { ok: false, reason: "died" };
    if (useful.has(part.type)) {
      // A tool call has no prose to read, so it goes straight through.
      if (part.type !== "text-delta") return { ok: true, prefix, iterator };
      return sniff(prefix, iterator, deltaText(part));
    }
  }
  return { ok: true, prefix, iterator };
}

async function sniff<P extends LeakStreamPart>(
  prefix: P[],
  iterator: AsyncIterator<P>,
  head: string
): Promise<PeekResult<P>> {
  let text = head;
  while (text.length < LEAK_SNIFF_CHARS) {
    const step = await iterator.next();
    if (step.done) break;
    prefix.push(step.value);
    if (step.value.type === "error") return { ok: false, reason: "died" };
    if (step.value.type !== "text-delta") break;
    text += deltaText(step.value);
  }
  if (looksLikePromptLeak(text)) return { ok: false, reason: "leak" };
  return { ok: true, prefix, iterator };
}
