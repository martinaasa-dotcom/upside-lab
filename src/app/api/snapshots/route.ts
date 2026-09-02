import { dbError } from "@/lib/db-error";
import {
  captureBookPayload,
  loadBookSnapshot,
  pruneOldSnapshots,
  restoreBookFromSnapshot,
  restoreSheetFromSnapshot,
  saveBookSnapshot,
  snapshotSheetsForOwner,
  SNAPSHOT_GONE,
  SNAPSHOT_NOT_THIS_PORTFOLIO,
} from "@/lib/book-snapshot";
import { listOwnedPortfolioIds } from "@/lib/auth/ownership";
import { denyClassroomWrite } from "@/lib/classroom-guard";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import {
  getSupabaseDataClient,
  supabaseUsesServiceRole,
} from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { snapshotPostSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const dynamic = "force-dynamic";

/** List recent snapshots (metadata only). */
/**
 * The caller, plus everyone who co-owns a portfolio with them.
 *
 * Small by construction: it is the owners of the caller's own portfolios,
 * which is a household or a class, never the product. Used to bound the
 * snapshot list to rows that could possibly pass its access check, so the
 * check is applied to the right eighty rows rather than to whichever eighty
 * happened to be newest across every account.
 */
async function peopleSharingPortfolios(
  supabase: Awaited<ReturnType<typeof getSupabaseDataClient>>,
  userId: string,
  ownedIds: Set<string>
): Promise<string[]> {
  const ids = new Set<string>([userId]);
  if (!supabase || ownedIds.size === 0) return [...ids];
  const { data } = await supabase
    .from(PORTFELL_TABLES.portfolioOwners)
    .select("user_id")
    .in("portfolio_id", [...ownedIds]);
  for (const row of (data ?? []) as { user_id?: string | null }[]) {
    if (row.user_id) ids.add(row.user_id);
  }
  return [...ids];
}

async function handleGET() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const owned = new Set(await listOwnedPortfolioIds(auth.user.id));
  /*
    Narrowed to the people who could have made a copy this caller may see,
    which is themselves and anyone they share a portfolio with, before the
    newest eighty are taken rather than after.

    The access rule is unchanged and is still the payload check below: every
    portfolio in the save has to be one the caller is on. What changed is the
    window it is applied to. Taking the newest eighty rows in the whole
    project and filtering afterwards meant a busy week in somebody else's
    account could push a reader's own saves out of their own list, with
    nothing deleted and nothing to see. Scoping to the caller alone would
    have been simpler and wrong: a co-owner is meant to find the copy taken
    before the other owner deleted a portfolio they share, which is the
    whole reason that copy exists.

    A row with no owner recorded predates the column and is left out of this
    narrowing rather than shown to everybody.
  */
  const coOwnerIds = await peopleSharingPortfolios(supabase, auth.user.id, owned);
  const { data, error } = await supabase
    .from(PORTFELL_TABLES.snapshots)
    .select("id, kind, label, created_at, payload")
    .neq("kind", "nightly")
    .in("owner_id", coOwnerIds)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/snapshots") }, { status: 500 });
  }
  const snapshots = ((data ?? []) as {
    id: string;
    kind: string;
    label: string;
    created_at: string;
    payload?: { portfolios?: { id?: string }[] };
  }[])
    .filter((row) => {
      if (row.kind === "nightly") return false;
      const ports = row.payload?.portfolios;
      if (!Array.isArray(ports) || ports.length === 0) return false;
      /*
        Every portfolio in the save, not any. A save is one person's whole
        account, and its label names a portfolio ("Before delete: Savings"),
        so a save that so much as touches one portfolio the caller shares
        used to hand them the names and ids of every other portfolio in it.
        A co-owner sees only saves made of portfolios they are on.
      */
      return ports.every((p) => p.id && owned.has(p.id));
    })
    .slice(0, 40)
    .map(({ id, kind, label, created_at }) => ({
      id,
      kind,
      label,
      created_at,
    }));
  return NextResponse.json({ snapshots });
}

/** Create a manual snapshot, or restore one. */
async function handlePOST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const parsed = await parseJsonBody(req, snapshotPostSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const snapshotId = body.snapshotId ?? body.id;

  // "create" / "restore" cover the WHOLE book across every user, not just
  // the caller's own portfolios — under the caller's own session, RLS only
  // exposes portfolios they can see, so a full-book capture/restore here
  // would silently be partial rather than a real backup. Require service
  // role for those two; "restore_sheet" only ever touches the caller's own
  // sheet, which their session already has legitimate rights to.
  const wholeBookAction = body.action === "restore" || body.action === "create" || !body.action;
  if (wholeBookAction && !supabaseUsesServiceRole()) {
    return NextResponse.json(
      {
        error:
          "Whole-account snapshot/restore needs SUPABASE_SERVICE_ROLE_KEY configured. Without it, a signed-in session only sees its own portfolios, so this would silently save/restore a partial set. Use restore_sheet for a single portfolio instead.",
      },
      { status: 503 }
    );
  }

  try {
    if (body.action === "restore") {
      if (!snapshotId) {
        return NextResponse.json(
          { error: "snapshotId required" },
          { status: 400 }
        );
      }
      const ownedIds = await listOwnedPortfolioIds(auth.user.id);
      if (ownedIds.length) {
        const { data: classSheets } = await supabase
          .from(PORTFELL_TABLES.portfolios)
          .select("id")
          .in("id", ownedIds)
          .not("classroom_community_id", "is", null);
        for (const sheet of (classSheets ?? []) as { id: string }[]) {
          const blocked = await denyClassroomWrite(supabase, {
            portfolioId: sheet.id,
            userId: auth.user.id,
            action: ["buy", "sell", "cash"],
          });
          if (blocked) return blocked;
        }
      }
      const safety = await captureBookPayload(supabase, {
        portfolioIds: ownedIds,
      });
      await saveBookSnapshot(
        supabase,
        "pre_delete",
        "Before restore",
        safety,
        auth.user.id
      );
      const restored = await restoreBookFromSnapshot(
        supabase,
        snapshotId,
        ownedIds
      );
      if (!restored.ok) {
        return NextResponse.json(
          { error: restored.error },
          { status: restored.status }
        );
      }
      return NextResponse.json({ ok: true, restored: restored.counts });
    }

    if (body.action === "restore_sheet") {
      if (!snapshotId || !body.portfolioId) {
        return NextResponse.json(
          { error: "snapshotId and portfolioId required" },
          { status: 400 }
        );
      }
      /*
        Two ownership questions, and the second is the one that was missing.

        The target has to be the caller's, which was always asked. The save
        also has to hold the caller's own copy of that portfolio, and nothing
        asked that: a nightly save carries every portfolio in the project,
        and the matcher underneath fell back from id to slug to name across
        all of them, so a reader who had renamed their portfolio to a name
        somebody else was using had that person's holdings and cash copied
        in over their own. Both are settled here, before the safety copy is
        written and before anything is touched.
      */
      const ownedIds = await listOwnedPortfolioIds(auth.user.id);
      if (!ownedIds.includes(body.portfolioId)) {
        return NextResponse.json(
          { error: "You can only put back a portfolio you own." },
          { status: 403 }
        );
      }
      const blocked = await denyClassroomWrite(supabase, {
        portfolioId: body.portfolioId,
        userId: auth.user.id,
        action: ["buy", "sell", "cash"],
      });
      if (blocked) return blocked;
      const snap = await loadBookSnapshot(supabase, snapshotId);
      if (!snap) {
        return NextResponse.json({ error: SNAPSHOT_GONE }, { status: 404 });
      }
      const mine = snapshotSheetsForOwner(snap.payload, ownedIds);
      if (!mine.includes(body.portfolioId)) {
        return NextResponse.json(
          { error: SNAPSHOT_NOT_THIS_PORTFOLIO },
          { status: 403 }
        );
      }
      const safety = await captureBookPayload(supabase, {
        portfolioIds: [body.portfolioId],
      });
      await saveBookSnapshot(
        supabase,
        "pre_delete",
        "Before portfolio restore",
        safety,
        auth.user.id
      );
      const restored = await restoreSheetFromSnapshot(
        supabase,
        snap.payload,
        body.portfolioId,
        ownedIds
      );
      if (!restored.ok) {
        return NextResponse.json(
          { error: restored.error },
          { status: restored.status }
        );
      }
      return NextResponse.json({ ok: true, restoredSheet: restored.counts });
    }

    if (body.action === "create" || !body.action) {
      const ownedIds = await listOwnedPortfolioIds(auth.user.id);
      const payload = await captureBookPayload(supabase, {
        portfolioIds: ownedIds,
      });
      const snap = await saveBookSnapshot(
        supabase,
        "manual",
        body.label?.trim() || "Manual snapshot",
        payload,
        auth.user.id
      );
      // The caller's own window only. Tidying everybody's from a request is
      // what let one reader's saves push out another's.
      await pruneOldSnapshots(supabase, auth.user.id);
      return NextResponse.json({ snapshot: snap });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    /*
      Anything thrown out of a restore is the driver talking, and a driver
      sentence names tables and columns; a refusal the reader is meant to
      see comes back as a value and is answered above. It used to go out
      verbatim, and a snapshot error can carry another reader's portfolio
      name in it.
    */
    return NextResponse.json(
      { error: dbError(err, "POST /api/snapshots: snapshot action") },
      { status: 500 }
    );
  }
}

export const GET = observeRoute(handleGET, '/api/snapshots');
export const POST = observeRoute(handlePOST, '/api/snapshots');
