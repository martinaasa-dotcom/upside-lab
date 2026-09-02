import { dbError } from "@/lib/db-error";
import { readAll } from "@/lib/supabase/read-all";
import { captureBookPayload, saveBookSnapshot } from "@/lib/book-snapshot";
import { ensureProfileAndClaims } from "@/lib/auth/ensure-profile";
import {
  communityAdminFlags,
  listOwnedPortfolioIds,
  portfolioCreatorId,
  requirePortfolioOwner,
} from "@/lib/auth/ownership";
import {
  parseClassPlan,
  resolveClassroomTrade,
  type ClassroomTrade,
} from "@/lib/classroom";
import {
  denyClassroomWrite,
  denyStudentCashWrite,
} from "@/lib/classroom-guard";
import { shareNewSheetIntoMemberCircles } from "@/lib/community-share";
import { isSafeSignedMoney, sanitizeSheetName } from "@/lib/input-guard";
import { roundMoney } from "@/lib/money";
import { createSupabaseServerAuth, requireAuthUser } from "@/lib/supabase/server-auth";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import {
  getSupabaseDataClient,
  type AppSupabaseClient,
} from "@/lib/supabase/server";
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

/**
 * Whether this account has a profile row, as one HEAD count and no rows.
 *
 * A count that fails reads as "no profile", which sends the caller down the
 * old path of ensuring one. That is the cheap direction to be wrong in.
 */
async function hasProfileRow(
  supabase: AppSupabaseClient,
  userId: string
): Promise<boolean> {
  const { count } = await supabase
    .from(PORTFELL_TABLES.profiles)
    .select("id", { count: "exact", head: true })
    .eq("id", userId);
  return (count ?? 0) > 0;
}

async function handleGET(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

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

  /*
    This is the book's poll: the client asks every 45 seconds and again on
    every room shown, so it reads the book and nothing else. The profile
    upsert, the seed claims and the lab state row are made where a session
    begins, in GET /api/auth/me (which AuthProvider calls once per session,
    and which Dashboard awaits before its first read of this route) and in
    the sign-in callbacks, and again on POST here, because creating a
    portfolio is the one thing a brand-new account does first.

    What is left is a guard for a first read that lands before any of those
    did: no portfolio rows, and no profile row either. The owners list was
    being read anyway, and the profile is one HEAD count, so an account with
    a portfolio pays nothing and an empty one pays a count. The seed claim
    can hand this person a portfolio, so the list is read again afterwards
    rather than answering empty on the strength of the first read.
  */
  let ownedIds = await listOwnedPortfolioIds(auth.user.id);
  if (!ownedIds.length && !(await hasProfileRow(supabase, auth.user.id))) {
    await ensureProfileAndClaims(auth.user);
    ownedIds = await listOwnedPortfolioIds(auth.user.id);
  }
  if (!ownedIds.length) {
    return NextResponse.json({
      source: "supabase",
      portfolios: [],
      holdings: [],
    });
  }

  let portfolios: unknown[];
  try {
    portfolios = await readAll<unknown>(
      () =>
        supabase
          .from(PORTFELL_TABLES.portfolios)
          .select(PORTFOLIO_COLUMNS)
          .in("id", ownedIds)
          .order("sort_order")
          .order("id"),
      "throw"
    );
  } catch (err) {
    return NextResponse.json(
      { error: dbError(err, "GET /api/portfolios: read portfolios") },
      { status: 500 }
    );
  }

  const portfolioIds = (portfolios ?? []).map(
    (p) => (p as { id: string }).id
  );
  let holdings: unknown[] = [];
  if (portfolioIds.length) {
    /*
      Paged. This is one person's holdings across their own portfolios, so
      it is the least likely of these reads to reach PostgREST's silent
      1,000-row cap, and it is the one whose truncation is worst: the
      portfolio it draws is the reader's own, and holdings missing from it
      are missing from the value, the gain and everything computed
      downstream, with nothing on screen saying so.
    */
    try {
      holdings = await readAll<unknown>(
        () =>
          supabase
            .from(PORTFELL_TABLES.holdings)
            .select(HOLDING_COLUMNS)
            .in("portfolio_id", portfolioIds)
            .order("sort_order")
            .order("id"),
        "throw"
      );
    } catch (err) {
      return NextResponse.json(
        { error: dbError(err, "GET /api/portfolios: read holdings") },
        { status: 500 }
      );
    }
  }

  const classIds = [
    ...new Set(
      (portfolios as { classroom_community_id?: string | null }[])
        .map((p) => p.classroom_community_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const tradeByClass = new Map<string, ClassroomTrade>();
  if (classIds.length) {
    const classes = await readAll<unknown>(() =>
      supabase
        .from(PORTFELL_TABLES.communities)
        .select("id, class_plan, house_note")
        .order("id")
        .in("id", classIds)
    );
    const classRows = classes as {
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

  // Creating a portfolio is the first thing a brand-new account does, and
  // the profile row has to exist by the time anything reads the owner back
  // (a circle's member list, the Sunday letter). The book read no longer
  // ensures it on every poll, so the one mutation that begins a book does.
  await ensureProfileAndClaims(auth.user);

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
    return NextResponse.json({ error: dbError(error, "/api/portfolios") }, { status: 500 });
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
    // Two different questions, and only one of them was being asked. The
    // period rule below says whether the class is open for cash right now;
    // this says whether this caller may set a class portfolio's cash at all,
    // which a student may not, in any period. See `denyStudentCashWrite`.
    const notYours = await denyStudentCashWrite(supabase, {
      portfolioId: id,
      userId: auth.user.id,
    });
    if (notYours) return notYours;
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
    return NextResponse.json({ error: dbError(error, "/api/portfolios") }, { status: 500 });
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

  /*
    Deleting is the creator's alone. A co-owner can edit every holding,
    which is what they were invited for, and they can leave from the
    Invite screen; what they cannot do is take the whole portfolio away
    from the person who made it and everybody else on it. Inviting stays
    open to every co-owner, because adding a person is undoable and
    deleting a portfolio is not.
  */
  const creatorId = await portfolioCreatorId(id);
  if (creatorId && creatorId !== auth.user.id) {
    return NextResponse.json(
      {
        error:
          "Only the person who made this portfolio can delete it. You can leave it from the Invite screen instead.",
      },
      { status: 403 }
    );
  }

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
      await captureBookPayload(supabase, { portfolioIds: [id] }),
      auth.user.id
    );

    const { error } = await supabase
      .from(PORTFELL_TABLES.portfolios)
      .delete()
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: dbError(error, "/api/portfolios") }, { status: 500 });
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
