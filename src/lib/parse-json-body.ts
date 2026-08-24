import { NextResponse } from "next/server";
import type { z } from "zod";

/**
 * Biggest JSON body any route here actually needs. Real bodies are well
 * under this (a chat turn, a holdings list); image uploads go through
 * `formData()`, not this helper. Vercel's own 4.5 MB function limit is
 * the outer backstop — this fails faster and cheaper than relying on it.
 */
const DEFAULT_MAX_BYTES = 1_000_000;

function tooLarge(): { ok: false; response: NextResponse } {
  return {
    ok: false,
    response: NextResponse.json(
      { error: "That request was too big." },
      { status: 413 }
    ),
  };
}

/**
 * Parse a JSON request body with a Zod schema. Empty body is `{}`.
 * Garbage JSON and schema failures are both 400, never an unhandled throw.
 * Bodies over `maxBytes` are refused with a 413 before parsing.
 */
export async function parseJsonBody<S extends z.ZodType>(
  req: Request,
  schema: S,
  opts?: { maxBytes?: number }
): Promise<
  | { ok: true; data: z.infer<S>; bytes: number }
  | { ok: false; response: NextResponse }
> {
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return tooLarge();

  let value: unknown = {};
  const text = await req.text();
  // Content-Length can be absent (chunked) or lie, so check what arrived.
  if (text.length > maxBytes) return tooLarge();
  if (text.trim()) {
    try {
      value = JSON.parse(text) as unknown;
    } catch {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Couldn't read that request." },
          { status: 400 }
        ),
      };
    }
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Couldn't read that request." },
        { status: 400 }
      ),
    };
  }
  // The size is handed back because a route whose cost scales with the
  // body (a chat turn carrying a screenshot) has to charge its rate limiter
  // by bytes, and reading the body twice is not an option.
  return { ok: true, data: result.data, bytes: text.length };
}
