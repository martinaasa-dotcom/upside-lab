import { captureBookPayload, saveBookSnapshot } from "@/lib/book-snapshot";
import { ensureProfileAndClaims } from "@/lib/auth/ensure-profile";
import {
  communityAdminFlags,
  listOwnedPortfolioIds,
  requirePortfolioOwner,
} from "@/lib/auth/ownership";
import {
  parseClassPlan,
  resolveClassroomTrade,
  type ClassroomTrade,
} from "@/lib/classroom";
import { denyClassroomWrite } from "@/lib/classroom-guard";
import { shareNewSheetIntoMemberCircles } from "@/lib/community-share";
import { isSafeSignedMoney, sanitizeSheetName } from "@/lib/input-guard";
import { roundMoney } from "@/lib/money";
import { createSupabaseServerAuth, requireAuthUser } from "@/lib/supabase/server-auth";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import {
  HOLDING_COLUMNS,
  PORTFELL_TABLES,
  PORTFOLIO_COLUMNS,
} from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { portfolioPatchSchema, portfolioPostSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const dynamic = "force-dynamic";

function mapPortfolio(p: Record<string, unknown>) {
  return p;
}

async function handleGET(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  await ensureProfileAndClaims(auth.user);

  const supabase = await getSupabaseDataClient();

  // A signed-in book is only sheets this user co-owns. Missing
  // Supabase is an empty portfolio, never someone else's portfolios.
  if (!supabase) {
    return NextResponse.json({
      source: "supabase",
      portfolios: [],
      holdings: [],
    });
  }

  const ownerId = req.nextUrl.searchParams.get("ownerId");
  if (ownerId && ownerId !== auth.user.id) {
    return NextResponse.json(
      { error: "Use community book endpoint for peer portfolios" },
      { status: 400 }
    );
  }

  const ownedIds = await listOwnedPortfolioIds(auth.user.id);
  if (!ownedIds.length) {
    return NextResponse.json({
      source: "supabase",
      portfolios: [],
      holdings: [],
    });
  }

  const { data: portfolios, error: pErr } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select(PORTFOLIO_COLUMNS)
    .in("id", ownedIds)
    .order("sort_order");

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const portfolioIds = (portfolios ?? []).map(
    (p) => (p as { id: string }).id
  );
  let holdings: unknown[] = [];
  if (portfolioIds.length) {
    const { data: h, error: hErr } = await supabase
      .from(PORTFELL_TABLES.holdings)
      .select(HOLDING_COLUMNS)
      .in("portfolio_id", portfolioIds)
      .order("sort_order");
    if (hErr) {
      return NextResponse.json({ error: hErr.message }, { status: 500 });
    }
    holdings = h ?? [];
  }

  const classIds = [
    ...new Set(
      ((portfolios ?? []) as { classroom_community_id?: string | null }[])
        .map((p) => p.classroom_community_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const tradeByClass = new Map<string, ClassroomTrade>();
  if (classIds.length) {
    const { data: classes } = await supabase
      .from(PORTFELL_TABLES.communities)
      .select("id, class_plan, house_note")
      .in("id", classIds);
    const classRows = (classes ?? []) as {
      id: string;
      class_plan?: unknown;
      house_note?: string | null;
    }[];
    const teacherOf = await communityAdminFlags(
      auth.user.id,
      classRows.map((row) => row.id)
    );
    classRows.forEach((row) => {
      const isTeacher = teacherOf.has(row.id);
      const trade = resolveClassroomTrade(
        parseClassPlan(row.class_plan),
        new Date(),
        row.house_note
      );
      tradeByClass.set(row.id, {
        ...trade,
        canBuy: isTeacher ? true : trade.canBuy,
        canSell: isTeacher ? true : trade.canSell,
        canAdjust: isTeacher ? true : trade.canAdjust,
        canCash: isTeacher ? true : trade.canCash,
        studentLocked: isTeacher ? false : trade.studentLocked,
        message: isTeacher
          ? `Students: ${trade.label.toLowerCase()}. ${trade.message}`
          : trade.message,
      });
    });
  }

  return NextResponse.json({
    source: "supabase",
    portfolios: (portfolios ?? []).map((p) => {
      const row = p as { classroom_community_id?: string | null };
      const classTrade = row.classroom_community_id
        ? tradeByClass.get(row.classroom_community_id) ?? null
        : null;
      return mapPortfolio({
        ...(p as Record<string, unknown>),
        classTrade,
      });
    }),
    holdings,
  });
}

async function handlePOST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const parsedBody = await parseJsonBody(req, portfolioPostSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const name = sanitizeSheetName(parsedBody.data.name);
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  // Security-definer RPC, not a plain insert + upsert: creating a sheet and
  // adding yourself as its owner is a self-service "do this for auth.uid()"
  // operation, the same class of thing that's needed a security-definer
  // path elsewhere in this schema (seed claims, invite redemption, account
  // deletion) rather than ordinary ownership-based RLS, which can't cleanly
  // express "this row doesn't have an owner yet, I'm about to become it".
  // Also atomic (no risk of an orphaned, owner-less portfolio if a second
  // write failed) and handles slug collisions instead of 500ing when two
  // people separately name a sheet the same thing.
  //
  // Deliberately the cookie-session client, NOT getSupabaseDataClient() —
  // that prefers the service-role client whenever SUPABASE_SERVICE_ROLE_KEY
  // is set (true in production), and a service-role connection carries no
  // per-request end-user JWT, so auth.uid() inside this function resolves
  // to null and the RPC always raises "not authenticated". The function
  // itself is still SECURITY DEFINER, so its internal writes bypass RLS
  // regardless of which client invokes it — this only affects whether
  // auth.uid() correctly identifies who's calling.
  const authedSupabase = await createSupabaseServerAuth();
  if (!authedSupabase) {
    return NextResponse.json(
      { error: "Supabase not configured, use local demo store" },
      { status: 400 }
    );
  }
  const { data, error } = await authedSupabase.rpc(
    "portfell_create_portfolio_for_me",
    { p_name: name }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const created = data as { id?: string; name?: string } | null;
  const dataClient = await getSupabaseDataClient();
  if (dataClient && created?.id) {
    await shareNewSheetIntoMemberCircles(dataClient, {
      userId: auth.user.id,
      portfolioId: created.id,
      name: created.name ?? name,
    });
  }

  return NextResponse.json({
    portfolio: mapPortfolio(data as Record<string, unknown>),
  });
}

async function handlePATCH(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const parsedBody = await parseJsonBody(req, portfolioPatchSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;
  const id = body.id;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const notOwner = await requirePortfolioOwner(auth.user.id, id);
  if (notOwner) return notOwner;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const patch: TablesUpdate<"portfell_portfolios"> = {
    updated_at: new Date().toISOString(),
  };
  if (body.cash_balance !== undefined) {
    const blocked = await denyClassroomWrite(supabase, {
      portfolioId: id,
      userId: auth.user.id,
      action: "cash",
    });
    if (blocked) return blocked;
    const raw = Number(body.cash_balance);
    // Below zero is allowed on every portfolio: a broker that lent you the
    // money to buy with carries the loan as negative cash. Only the size is
    // capped, the same ceiling the modal enforces.
    if (!isSafeSignedMoney(raw)) {
      return NextResponse.json(
        { error: "Cash has to be a real dollar amount." },
        { status: 400 }
      );
    }
    patch.cash_balance = roundMoney(raw);
  }
  if (body.name !== undefined) {
    const name = sanitizeSheetName(String(body.name));
    if (!name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    patch.name = name;
  }

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .update(patch)
    .eq("id", id)
    .select(
      "id, name, slug, sort_order, cash_balance, created_at, updated_at, owner_id"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    portfolio: mapPortfolio(data as Record<string, unknown>),
  });
}

async function handleDELETE(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const notOwner = await requirePortfolioOwner(auth.user.id, id);
  if (notOwner) return notOwner;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  try {
    const { data: sheet } = await supabase
      .from(PORTFELL_TABLES.portfolios)
      .select("name, classroom_community_id")
      .eq("id", id)
      .maybeSingle();

    if ((sheet as { classroom_community_id?: string | null } | null)
      ?.classroom_community_id) {
      return NextResponse.json(
        { error: "Class portfolios stay until the class ends." },
        { status: 400 }
      );
    }

    await saveBookSnapshot(
      supabase,
      "pre_delete",
      sheet?.name
        ? `Before delete · ${sheet.name}`
        : "Before delete",
      await captureBookPayload(supabase, { portfolioIds: [id] })
    );

    const { error } = await supabase
      .from(PORTFELL_TABLES.portfolios)
      .delete()
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Deleting a sheet is irreversible, so a failed pre-delete backup has to
    // block the delete. Log the cause: the caller only gets the safe sentence.
    console.error("[portfolios] pre-delete backup failed", err);
    return NextResponse.json(
      { error: "Couldn't take a backup before deleting. Try again." },
      { status: 500 }
    );
  }
}

export const GET = observeRoute(handleGET, '/api/portfolios');
export const POST = observeRoute(handlePOST, '/api/portfolios');
export const PATCH = observeRoute(handlePATCH, '/api/portfolios');
export const DELETE = observeRoute(handleDELETE, '/api/portfolios');
