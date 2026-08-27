import type { Instrumentation } from "next";
import { isRequestAbort } from "@/lib/abort";
import { validateServerEnv } from "@/lib/env-schema";
import { logError } from "@/lib/error-log";

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { installSlowRouteLogger } = await import("@/lib/slow-route");
  await installSlowRouteLogger();
  const issues = validateServerEnv();
  for (const issue of issues) {
    console.warn(`[env] ${issue.key}: ${issue.message}`);
  }
}

/**
 * Next.js calls onRequestError automatically for any uncaught server-side
 * error (route handlers, server components, server actions). This is the
 * one hook that covers all of them, instead of wrapping every individual
 * API route's try/catch by hand. See node_modules/next/dist/docs/01-app/
 * 03-api-reference/03-file-conventions/instrumentation.md.
 *
 * A hung-up client is not a crash. sendBeacon vitals (and any other
 * request the browser cancels) land here as `aborted`; skip those so the
 * admin log stays about real failures.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context
) => {
  if (isRequestAbort(err)) return;
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const digest =
    typeof err === "object" && err !== null && "digest" in err
      ? String((err as { digest?: unknown }).digest)
      : undefined;

  await logError({
    source: "server",
    message,
    stack,
    digest,
    path: request.path,
    routeType: context.routeType,
    context: { method: request.method, renderSource: context.renderSource },
  });
};
