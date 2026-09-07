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
 * One company page, for somebody signed in and looking one up.
 *
 * The building is `buildCompanyPage`, shared with the public research
 * pages and the cron that warms them, so a company cannot read one way
 * inside the app and another way on its own public page. What stays here
 * is everything about **this caller**: who they are, how often they may
 * ask, and the stamp that records that a model ran on their behalf.
 *
 * This is the one caller allowed to spend a model run on demand, because
 * it is the one where a person is waiting for the answer and has an
 * account behind them. The public page never generates. See
 * `page-build.ts`.
 */
async function handleGET(
  req: Request,
  ctx: { params: Promise<{ ticker: string }> }
) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { ticker: raw } = await ctx.params;
  const ticker = decodeURIComponent(raw ?? "").trim().toUpperCase();
  /*
    Refused before anything is fetched, and this is the check that makes
    the shared cache safe. The ticker is the one caller-supplied value that
    reaches this route at all, and a row written under a symbol the market
    does not list would be a page nobody could ever check.
  */
  if (!ticker || !isQuotableTicker(ticker)) {
    return Response.json(
      { error: "That does not look like a ticker." },
      { status: 400, headers: noStoreHeaders() }
    );
  }

  const limit = await takeDurableRateLimit(
    `company:${auth.user.id}`,
    30,
    10 * 60_000
  );
  if (!limit.ok) {
    return rateLimitJson(
      limit,
      "You are looking up companies faster than the feeds allow. Try again in a few minutes."
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
    // The builder swallows a failed model run and answers with the
    // figures, so anything that reaches here is the reader leaving.
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

export const GET = observeRoute(handleGET, "/api/company/[ticker]");
