import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Is the platform's scheduler calling, or a person holding the secret?
 *
 * Vercel documents exactly two things about a cron invocation: the
 * `Authorization: Bearer <CRON_SECRET>` header that `requireCronAuth`
 * checks, and `x-vercel-cron-schedule`, which carries the cron expression
 * that fired. There is no documented `x-vercel-cron: 1`. The Sunday letter
 * used to look for that one header alone, never saw it, and so treated
 * every scheduled run as a manual test -- see the account in
 * `note-cron.ts`. The undocumented header stays in the list because it
 * costs nothing if a platform ever sends it.
 *
 * Auth is a separate question and stays with `requireCronAuth`: this only
 * answers "who dialled", never "may they".
 */
export function requestIsScheduledCron(req: Request): boolean {
  const headers = req.headers;
  if (headers.get("x-vercel-cron-schedule")) return true;
  if (headers.get("x-vercel-cron") === "1") return true;
  if (/vercel-cron/i.test(headers.get("user-agent") ?? "")) return true;
  // A hand-rolled scheduler (a GitHub Action, a uptime pinger) says so.
  try {
    return new URL(req.url).searchParams.get("cron") === "1";
  } catch {
    return false;
  }
}

/** Vercel Cron sends Authorization: Bearer <CRON_SECRET>. */
export function requireCronAuth(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 }
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!safeEqual(token, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
