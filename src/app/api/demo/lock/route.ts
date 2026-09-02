import { promises as fs } from "fs";
import path from "path";
import { dbError } from "@/lib/db-error";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { demoLockPostSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const dynamic = "force-dynamic";

const SNAPSHOT_PATH = path.join(process.cwd(), "data", "locked-demo.json");

/**
 * This is the local dev tool that freezes the demo book to disk. It has no
 * auth check by design, so it must never answer on a deployed environment:
 * any Vercel deployment counts, not just production, so a preview whose env
 * vars are misconfigured can't expose it either.
 */
function isDeployed() {
  return (
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.VERCEL_ENV) ||
    Boolean(process.env.VERCEL)
  );
}

/** Persist a locked demo snapshot to disk (dev) so seed bumps don't invent Aasad again. */
async function handlePOST(req: NextRequest) {
  if (isDeployed()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const parsed = await parseJsonBody(req, demoLockPostSchema);
  if (!parsed.ok) return parsed.response;
  try {
    await fs.mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
    await fs.writeFile(
      SNAPSHOT_PATH,
      JSON.stringify(
        {
          savedAt: new Date().toISOString(),
          portfolios: parsed.data.portfolios,
          holdings: parsed.data.holdings,
        },
        null,
        2
      ),
      "utf8"
    );
    return NextResponse.json({ ok: true, path: "data/locked-demo.json" });
  } catch (err) {
    console.error("Failed to lock demo snapshot", err);
    return NextResponse.json(
      { error: dbError(err, "POST /api/demo/lock: write locked demo") },
      { status: 500 }
    );
  }
}

async function handleGET() {
  if (isDeployed()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const raw = await fs.readFile(SNAPSHOT_PATH, "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ portfolios: null, holdings: null });
  }
}

export const GET = observeRoute(handleGET, "/api/demo/lock");
export const POST = observeRoute(handlePOST, "/api/demo/lock");
