import { userExportResponse } from "@/lib/gdpr/export-response";
import { observeRoute } from "@/lib/observe-route";

export const dynamic = "force-dynamic";

/*
  A GDPR export is a legal answer, and it pages.

  `user-export.ts` reads cash events, holdings and portfolios a page at a
  time, so the work grows with the account rather than with the platform's
  patience. The default function timeout is a handful of seconds, which is
  ample for a small account and is exactly the wrong thing to discover on
  a large one: a truncated or timed-out export is the answer somebody is
  legally owed, arriving wrong.
*/
export const maxDuration = 60;


/**
 * Account-page download. Same payload as /api/user/export, plaintext JSON
 * so the existing "Export my data" button stays a file they can open.
 */
async function handleGET(req: Request) {
  return userExportResponse(req, { encrypt: false });
}

export const GET = observeRoute(handleGET, "/api/account/export");
