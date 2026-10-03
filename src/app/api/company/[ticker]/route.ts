import { buildCompanyPage } from "@/lib/company/page-build";
import { isQuotableTicker } from "@/lib/ticker";
import { observeRoute } from "@/lib/observe-route";
import { rateLimitJson } from "@/lib/rate-limit";
import { takeDurableRateLimit } from "@/lib/rate-limit-durable";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { noStoreHeaders } from "@/lib/cdn-cache";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One company page, for somebody signed in and looking one up.
 *
 * The building is `buildCompanyPage`, shared with the public research
 * pages and the cron that warms them, so a company cannot read one way
 * inside the app and another way on its own public page. What stays here
 * is everything about **this caller**: who they are and how often they may
 * ask.
 *
 * IT NEVER WAITS ON A MODEL, AND THAT IS THE CHANGE.
 *
 * This read used to write a missing or expired brief before it answered,
 * which was up to a minute of skeleton for whoever opened a company after
 * its page had aged out: the twenty seconds people noticed. It answers now
 * with whatever is on file, judged (`briefState`), in about the time the
 * figures take, and when the page on file is stale or missing the room
 * asks `POST /api/company/[ticker]/brief` for a rewrite behind the page it
 * is already showing. That route is the one allowed to spend a model run
 * on demand, because a person with an account is reading the page it will
 * improve. See `page-build.ts`.
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
      generate: false,
      signal: req.signal,
    });
  } catch (err) {
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
