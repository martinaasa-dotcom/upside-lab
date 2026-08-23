import { isSuperadminEmail } from "@/lib/auth/superadmin";
import { signOutEveryone } from "@/lib/auth/sign-out-everyone";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { supabaseUsesServiceRole } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Revoke every refresh token for every account. Superadmin only.
 *
 * Gated the same way `/api/admin/errors` is, and then some, because the
 * blast radius is different in kind: an unauthenticated caller who could
 * reach this would be able to sign out the entire user base at will, which
 * is a denial-of-service with a single request. So it takes three locks: a
 * real session, a superadmin address on it, and a typed confirmation
 * phrase in the body so it cannot fire from a stray fetch or a re-sent
 * request.
 *
 * POST only. A GET that logged everyone out could be triggered by a link,
 * a prefetch, or a crawler.
 *
 * What it does NOT do is sign anybody out instantly. See the note on
 * `signOutEveryone`: access tokens are stateless and live out their hour,
 * so the effect lands across the following hour rather than at once. Do
 * not describe this to anyone as an immediate global logout.
 */
const CONFIRM = "sign out everyone";

async function handlePOST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;
  if (!isSuperadminEmail(auth.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: unknown = await req.json().catch(() => null);
  const confirm =
    body && typeof body === "object"
      ? (body as { confirm?: unknown }).confirm
      : undefined;
  if (confirm !== CONFIRM) {
    return NextResponse.json(
      { error: `Send {"confirm":"${CONFIRM}"} to run this.` },
      { status: 400 }
    );
  }

  // Without the service role key the admin list returns nothing and the
  // run would report a tidy zero, which reads as "there was nobody to sign
  // out" rather than "this did not run".
  if (!supabaseUsesServiceRole()) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY is not configured, so no sessions can be revoked.",
      },
      { status: 503 }
    );
  }

  const result = await signOutEveryone();
  return NextResponse.json({
    ...result,
    note: "Access tokens already issued stay valid until they expire, so this lands over the next hour rather than immediately.",
  });
}

export const POST = observeRoute(handlePOST, "/api/admin/sign-out-everyone");
