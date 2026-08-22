import {
  buildAdvisorProviderChain,
  describeAdvisorError,
  withAdvisorFallback,
} from "@/lib/ai/model";
import { startNavFromYtdPct } from "@/lib/market/assumed-nav";
import { rateLimitJson } from "@/lib/rate-limit";
import { takeDurableRateLimit } from "@/lib/rate-limit-durable";
import { stampAdvisorUse } from "@/lib/advisor-use";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { observeRoute } from "@/lib/observe-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const LLM_BUDGET_MS = 45_000;
const MAX_BYTES = 4_500_000;

const extractSchema = z.object({
  kind: z.enum(["ytd", "holdings_list", "unclear"]),
  startNav: z.number().nullable(),
  currentNav: z.number().nullable(),
  ytdPct: z.number().nullable(),
});

const PROMPT = `This is a screenshot from a broker or bank.

We need the person's result for their whole portfolio this year, not one stock.

Look for:
1. The value at the start of this year, or at the start of the period shown
2. The year-to-date percent for the whole book (23.4 means 23.4 percent, keep the sign)
3. Today's or the current total, if shown

kind:
- ytd: you found at least a start value or a year-to-date percent for the whole book
- holdings_list: this is a list of stocks with shares and prices, and no year result
- unclear: you cannot read a year number

Do not invent numbers. If a figure is not on the screen, leave it null.
No extra words.`;

function asPercentFraction(raw: number | null): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  // Brokers show 23.4 for +23.4%. A raw 0.234 is rare; treat |x| > 2 as
  // already in percent points, otherwise it is already a fraction.
  if (Math.abs(raw) > 2) return raw / 100;
  return raw;
}

async function handlePOST(req: Request) {
  const startedAt = Date.now();
  const auth = await requireAuthUser();
  const userKey = "error" in auth ? "anon" : auth.user.id;
  const limit = await takeDurableRateLimit(`ytd-image:${userKey}`, 8, 10 * 60_000);
  if (!limit.ok) {
    return rateLimitJson(
      limit,
      "That's enough screenshots for now. Try again in a bit."
    );
  }

  const providerChain = buildAdvisorProviderChain({ vision: true });
  if (providerChain.length === 0) {
    const { message } = describeAdvisorError(
      new Error("No LLM key configured")
    );
    return NextResponse.json({ error: message }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Couldn't read that file." },
      { status: 400 }
    );
  }

  const file = form.get("image");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json(
      { error: "Attach a screenshot of your year-to-date." },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "That image is too big. Try a tighter crop." },
      { status: 400 }
    );
  }
  const mediaType = file.type || "image/jpeg";
  if (!mediaType.startsWith("image/")) {
    return NextResponse.json(
      { error: "That needs to be a picture." },
      { status: 400 }
    );
  }

  const liveNav = Number(form.get("liveNav"));
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!("error" in auth)) stampAdvisorUse(auth.user.id);

  try {
    const { object } = await withAdvisorFallback(
      providerChain,
      (model, _providerId, signal) =>
        generateObject({
          model,
          schema: extractSchema,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: PROMPT },
                { type: "image", image: bytes, mediaType },
              ],
            },
          ],
          maxRetries: 1,
          abortSignal: signal ?? req.signal,
        }),
      { deadlineAt: startedAt + LLM_BUDGET_MS, signal: req.signal }
    );

    if (object.kind === "holdings_list") {
      return NextResponse.json(
        {
          error:
            "That's a list of names, not the year number. Upload the performance screen, or type the year-to-date your broker shows.",
        },
        { status: 422 }
      );
    }

    const ytdPct = asPercentFraction(object.ytdPct);
    let startNav =
      object.startNav != null && object.startNav > 0 ? object.startNav : null;
    if (startNav == null && ytdPct != null) {
      const basis =
        liveNav > 0
          ? liveNav
          : object.currentNav != null && object.currentNav > 0
            ? object.currentNav
            : null;
      if (basis != null) startNav = startNavFromYtdPct(basis, ytdPct);
    }

    if (object.kind !== "ytd" || startNav == null || !(startNav > 0)) {
      return NextResponse.json(
        {
          error:
            "Couldn't read a year-to-date from that. Type the number instead.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      startNav,
      ytdPct: ytdPct ?? null,
    });
  } catch (err) {
    const { message, status } = describeAdvisorError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export const POST = observeRoute(handlePOST, '/api/book/ytd-from-image');
