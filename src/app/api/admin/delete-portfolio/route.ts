import { dbError } from "@/lib/db-error";
import { isSuperadminEmail } from "@/lib/auth/superadmin";
import { captureBookPayload, saveBookSnapshot } from "@/lib/book-snapshot";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { adminDeletePortfolioSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const dynamic = "force-dynamic";

/**
 * Delete somebody else's portfolio. Superadmin only.
 *
 * `DELETE /api/portfolios` deliberately cannot do this: it calls
 * `requirePortfolioOwner`, so the product has no path for one person to
 * destroy another person's holdings, and that is a property worth keeping
 * rather than loosening. This is the operator's door, separate and named as
 * such, so the ordinary rule stays absolute.
 *
 * Everything except the authorization check is the same as the owner's own
 * delete, on purpose:
 *
 * - A classroom portfolio still refuses. Those belong to a teacher's class
 *   rather than to the person holding them, and an operator deleting one
 *   breaks somebody else's lesson.
 * - A `pre_delete` snapshot is still taken first, and a failed backup still
 *   blocks the delete. That is what makes this recoverable, and it is the
 *   only reason a tool like this is reasonable to build at all.
 *
 * It takes a portfolio id, never a name. The caller is expected to have
 * clicked a real row in /admin, which is what stops an operator deleting
 * the wrong Rob.
 */
const CONFIRM = "delete this portfolio";

async function handlePOST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;
  if (!isSuperadminEmail(auth.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = await parseJsonBody(req, adminDeletePortfolioSchema);
  if (!parsed.ok) {
    if (parsed.response.status === 413) return parsed.response;
    return NextResponse.json(
      { error: `Send {"confirm":"${CONFIRM}"} to run this.` },
      { status: 400 }
    );
  }
  const portfolioId = parsed.data.portfolioId;

  // Another person's portfolio is invisible under RLS, so without the
  // service role this would delete nothing and report success.
  if (!supabaseUsesServiceRole()) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY is not configured, so another account's portfolio cannot be read or deleted.",
      },
      { status: 503 }
    );
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const { data: sheet } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("name, classroom_community_id")
    .eq("id", portfolioId)
    .maybeSingle();

  if (!sheet) {
    return NextResponse.json({ error: "Couldn't find that." }, { status: 404 });
  }
  if (
    (sheet as { classroom_community_id?: string | null })
      .classroom_community_id
  ) {
    return NextResponse.json(
      { error: "Class portfolios stay until the class ends." },
      { status: 400 }
    );
  }

  const name = (sheet as { name?: string | null }).name ?? "";

  try {
    await saveBookSnapshot(
      supabase,
      "pre_delete",
      name ? `Before admin delete · ${name}` : "Before admin delete",
      await captureBookPayload(supabase, { portfolioIds: [portfolioId] })
    );
  } catch (err) {
    // Same rule the owner's own delete follows: no backup, no delete.
    console.error("[admin] pre-delete backup failed", err);
    return NextResponse.json(
      { error: "Couldn't take a backup before deleting. Nothing was deleted." },
      { status: 500 }
    );
  }

  const { error } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .delete()
    .eq("id", portfolioId);
  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/admin/delete-portfolio") }, { status: 500 });
  }

  return NextResponse.json({ ok: true, name });
}

export const POST = observeRoute(handlePOST, "/api/admin/delete-portfolio");
