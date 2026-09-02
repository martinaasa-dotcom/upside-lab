import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { userIsCommunityAdmin } from "@/lib/auth/ownership";
import {
  allowClassAction,
  classActionError,
  parseClassPlan,
  resolveClassroomTrade,
  type ClassAction,
  type ClassPlan,
  type ClassroomTrade,
} from "@/lib/classroom";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

type ClassroomTradeState = {
  communityId: string;
  trade: ClassroomTrade;
  plan: ClassPlan;
};

async function readClassroomCommunityId(
  supabase: SupabaseClient,
  portfolioId: string
): Promise<string | null> {
  const { data: sheet } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("classroom_community_id")
    .eq("id", portfolioId)
    .maybeSingle();
  return (
    (sheet as { classroom_community_id?: string | null } | null)
      ?.classroom_community_id ?? null
  );
}

/**
 * The class rules for a portfolio whose classroom id the caller already has.
 *
 * A holdings write reads that id anyway, to answer whether the portfolio
 * keeps a cash ledger, so handing it here saves the guard a second select of
 * the same row. An ordinary portfolio has no id and costs nothing at all.
 */
export async function classroomTradeFor(
  supabase: SupabaseClient,
  communityId: string | null
): Promise<ClassroomTradeState | null> {
  if (!communityId) return null;

  const { data: community } = await supabase
    .from(PORTFELL_TABLES.communities)
    .select("class_plan, house_note")
    .eq("id", communityId)
    .maybeSingle();
  const plan = parseClassPlan(
    (community as { class_plan?: unknown } | null)?.class_plan
  );
  const trade = resolveClassroomTrade(
    plan,
    new Date(),
    (community as { house_note?: string | null } | null)?.house_note
  );
  return { communityId, trade, plan };
}

export async function loadClassroomTrade(
  supabase: SupabaseClient,
  portfolioId: string
): Promise<ClassroomTradeState | null> {
  return classroomTradeFor(
    supabase,
    await readClassroomCommunityId(supabase, portfolioId)
  );
}

/** Null if the write is allowed. 403 response if the class is closed for it. */
export async function denyClassroomWrite(
  supabase: SupabaseClient,
  opts: {
    portfolioId: string;
    userId: string;
    action: ClassAction | ClassAction[];
    /**
     * The portfolio's classroom_community_id when the caller has already read
     * it, `null` included, which is how an ordinary portfolio says so. Left
     * off, the guard reads the row itself: an unknown answer must cost a
     * query rather than be assumed open.
     */
    classroomCommunityId?: string | null;
  }
): Promise<NextResponse | null> {
  const communityId =
    opts.classroomCommunityId !== undefined
      ? opts.classroomCommunityId
      : await readClassroomCommunityId(supabase, opts.portfolioId);
  const loaded = await classroomTradeFor(supabase, communityId);
  if (!loaded) return null;
  if (await userIsCommunityAdmin(opts.userId, loaded.communityId)) return null;
  const actions = Array.isArray(opts.action) ? opts.action : [opts.action];
  for (const action of actions) {
    if (!allowClassAction(loaded.trade, action)) {
      return NextResponse.json(
        { error: classActionError(loaded.trade) },
        { status: 403 }
      );
    }
  }
  return null;
}

/**
 * A student may not set their own paper cash. Null when the write is fine.
 *
 * `denyClassroomWrite` asks whether the class period allows the action, and
 * for cash the default period is "open", so it allowed it: any student could
 * PATCH their own `cash_balance` to whatever they liked. The class league
 * ranks on `(value - startingCash) / startingCash`, so that is first place,
 * and there is nothing on any screen that would look wrong afterwards.
 *
 * The period was never the right question here. Starting cash is the
 * teacher's to set, through the classroom route, and a student's balance
 * after that is the ledger's answer rather than anybody's opinion. So this
 * is not a period rule, it is a rule about who: an admin of the class may,
 * and the owner of the sheet may not, even though they own it.
 *
 * An ordinary portfolio is untouched. Somebody typing what their broker
 * shows is exactly what `cash_balance` is for, borrowed money included.
 */
export async function denyStudentCashWrite(
  supabase: SupabaseClient,
  opts: {
    portfolioId: string;
    userId: string;
    /** The row's classroom id when the caller already read it. */
    classroomCommunityId?: string | null;
  }
): Promise<NextResponse | null> {
  const communityId =
    opts.classroomCommunityId !== undefined
      ? opts.classroomCommunityId
      : await readClassroomCommunityId(supabase, opts.portfolioId);
  if (!communityId) return null;
  if (await userIsCommunityAdmin(opts.userId, communityId)) return null;
  return NextResponse.json(
    {
      error:
        "Your teacher sets the starting money for a class portfolio. Yours changes when you buy and sell.",
    },
    { status: 403 }
  );
}
