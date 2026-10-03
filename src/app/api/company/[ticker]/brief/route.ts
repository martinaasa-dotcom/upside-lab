import { buildCompanyPage } from "@/lib/company/page-build";
import { isQuotableTicker } from "@/lib/ticker";
import { observeRoute } from "@/lib/observe-route";
import { rateLimitJson } from "@/lib/rate-limit";
import { takeDurableRateLimit } from "@/lib/rate-limit-durable";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { stampAdvisorUse } from "@/lib/advisor-use";
import { noStoreHeaders } from "@/lib/cdn-cache";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Rewrite a company's page, for somebody signed in who is already reading
 * the version on file.
 *
 * The ordinary read (`GET /api/company/[ticker]`) never waits on a model.
 * When what it found was stale or missing, the room calls this behind the
 * page it is already showing, and swaps the new page in when it lands. So
 * this is the one caller in the app allowed to spend a model run on
 * demand, and it is allowed because a person with an account is reading
 * the very page it will improve.
 *
 * It does not write a page that does not need it: `buildCompanyPage` judges
 * the stored page first and answers with it as it is when it is current,
 * so a stale tab asking twice, or two readers asking at once, cost one run
 * between them. When somebody else already holds the claim to write this
 * company the answer is the page on file marked `writing`, and the room
 * asks the ordinary read again a few seconds later.
 *
 * A POST rather than a GET because it writes to a table every reader drinks
 * from, which puts it behind the proxy's forged-request gate and its
 * mutation limit as well as the per-account one below.
 */
async function handlePOST(
  req: Request,
  ctx: { params: Promise<{ ticker: string }> }
) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { ticker: raw } = await ctx.params;
  const ticker = decodeURIComponent(raw ?? "").trim().toUpperCase();
  /*
    Refused before anything is fetched, and this is the check that makes
    the shared store safe. A row written under a symbol the market does not
    list would be a page nobody could ever check.
  */
  if (!ticker || !isQuotableTicker(ticker)) {
    return Response.json(
      { error: "That does not look like a ticker." },
      { status: 400, headers: noStoreHeaders() }
    );
  }

  /*
    Tighter than the read's, because every one of these may be a model
    run. Twelve an hour is far more companies than anybody reads properly
    in an hour, and most asks cost nothing because the page turned out to
    be current or somebody else was already writing it.
  */
  const limit = await takeDurableRateLimit(
    `company-brief:${auth.user.id}`,
    12,
    60 * 60_000
  );
  if (!limit.ok) {
    return rateLimitJson(
      limit,
      "That is a lot of companies rewritten in one hour. The pages on file are still there to read."
    );
  }

  let built;
  try {
    built = await buildCompanyPage(ticker, {
      generate: true,
      signal: req.signal,
      onModelRun: () => stampAdvisorUse(auth.user.id),
    });
  } catch (err) {
    // The builder swallows a failed model run and answers with the page on
    // file, so anything that reaches here is the reader leaving.
    if (req.signal.aborted) {
      return Response.json({ error: "Stopped." }, { status: 499 });
    }
    throw err;
  }

  if (!built.ok) {
    return Response.json(
      {
        error:
          "Nothing came back for that symbol. Check the spelling, or it may not be one the feed covers.",
      },
      { status: 404, headers: noStoreHeaders() }
    );
  }

  return Response.json(built.page, { headers: noStoreHeaders() });
}

export const POST = observeRoute(handlePOST, "/api/company/[ticker]/brief");
