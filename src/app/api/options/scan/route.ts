import { isCoinSymbol } from "@/lib/coins";
import { shouldHideOptions } from "@/lib/experience-tier";
import { scanCoveredCall } from "@/lib/market/covered-call";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { rateLimitJson } from "@/lib/rate-limit";
import { takeDurableRateLimit } from "@/lib/rate-limit-durable";
import { isRecord, readFiniteNumber, readString } from "@/lib/unknown";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { optionsScanPostSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePOST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = await getSupabaseDataClient();
  if (supabase) {
    const { data: profile } = await supabase
      .from(PORTFELL_TABLES.profiles)
      .select("knows_options")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (
      shouldHideOptions(
        (profile as { knows_options?: boolean | null } | null)?.knows_options ??
          null
      )
    ) {
      return NextResponse.json({ error: "Options stay hidden." }, { status: 403 });
    }
  }

  const limit = await takeDurableRateLimit(`options-scan:${auth.user.id}`, 30, 5 * 60_000);
  if (!limit.ok) {
    return rateLimitJson(
      limit,
      "Options scan is rate-limited. Try again shortly."
    );
  }

  const parsed = await parseJsonBody(req, optionsScanPostSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const positions = Array.isArray(body.positions)
    ? body.positions.flatMap((row) => {
        if (!isRecord(row)) return [];
        const ticker = readString(row.ticker);
        const spot = readFiniteNumber(row.spot);
        const shares = readFiniteNumber(row.shares);
        if (!ticker || isCoinSymbol(ticker) || spot == null || shares == null) {
          return [];
        }
        const history = Array.isArray(row.price_history)
          ? row.price_history.filter(
              (n): n is number => typeof n === "number" && Number.isFinite(n)
            )
          : undefined;
        return [
          {
            ticker,
            spot,
            shares,
            target_call_pct: readFiniteNumber(row.target_call_pct),
            stock_target:
              row.stock_target === null
                ? null
                : readFiniteNumber(row.stock_target),
            // Hand-picked expiry from the covered-call table, if any. The
            // model validates it (must be a real, future YYYY-MM-DD).
            expiry: readString(row.expiry) || null,
            price_history: history,
          },
        ];
      })
    : [];

  if (positions.length === 0) {
    return NextResponse.json({ options: {} });
  }

  const entries = await Promise.all(
    positions.map(async (p) => {
      const candidate = await scanCoveredCall({
        ticker: p.ticker,
        spot: p.spot,
        shares: p.shares,
        targetCallPct: p.target_call_pct,
        stockTarget: p.stock_target,
        expiry: p.expiry,
        priceHistory: p.price_history,
      });
      return [p.ticker.toUpperCase(), candidate] as const;
    })
  );

  return NextResponse.json({ options: Object.fromEntries(entries) });
}

export const POST = observeRoute(handlePOST, '/api/options/scan');
