import {
  FEEDBACK_TO,
  formatMonthlyFeedbackText,
  parseManualFeedback,
  parseMonthlyFeedback,
} from "@/lib/feedback";
import { takeDurableRateLimit } from "@/lib/rate-limit-durable";
import { noteEmailConfigured, sendNoteEmail } from "@/lib/send-note";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { feedbackPostSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const dynamic = "force-dynamic";

async function handlePOST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const limit = await takeDurableRateLimit(
    `feedback:${auth.user.id}`,
    6,
    60 * 60_000
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You have already sent a few. Give it a minute." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec ?? 60) } }
    );
  }

  if (!noteEmailConfigured()) {
    return NextResponse.json(
      { error: "Couldn't send that just now." },
      { status: 503 }
    );
  }

  const parsed = await parseJsonBody(req, feedbackPostSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const who = auth.user.email?.trim() || auth.user.id;
  const name =
    (typeof auth.user.user_metadata?.full_name === "string" &&
      auth.user.user_metadata.full_name.trim()) ||
    who;

  // "weekly" only reaches here from an offline draft queued before the
  // prompt went monthly. Same answers, same email.
  if (body.kind === "monthly" || body.kind === "weekly") {
    const parsed = parseMonthlyFeedback(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const text = [
      `${name} sent the monthly prompt.`,
      `Email: ${who}`,
      "",
      formatMonthlyFeedbackText(parsed.answers),
    ].join("\n");
    const ok = await sendNoteEmail({
      to: FEEDBACK_TO,
      subject: `Month in Upside Lab: ${name}`,
      text,
      replyTo: auth.user.email ?? undefined,
    });
    if (!ok) {
      return NextResponse.json(
        { error: "Couldn't send that just now." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (body.kind === "manual") {
    const parsed = parseManualFeedback(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const text = [
      `${name} wrote in.`,
      `Email: ${who}`,
      `About: ${parsed.draft.topic}`,
      "",
      parsed.draft.body,
    ].join("\n");
    const ok = await sendNoteEmail({
      to: FEEDBACK_TO,
      subject: `Feedback: ${parsed.draft.topic}`,
      text,
      replyTo: auth.user.email ?? undefined,
    });
    if (!ok) {
      return NextResponse.json(
        { error: "Couldn't send that just now." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "kind required" }, { status: 400 });
}

export const POST = observeRoute(handlePOST, '/api/feedback');
