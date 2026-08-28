#!/usr/bin/env node
/**
 * Signed-out landing smoke. No Google, no book, two viewports.
 *
 * The landing is the one page a stranger can reach, so this is the floor:
 * it paints, the ask is on screen, and the page does not scroll sideways
 * at phone or laptop width.
 *
 * Usage: after `npm run build`, `npm run test:landing`.
 * Starts `next start` on 4173 unless LANDING_SMOKE_URL is set.
 */
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = Number(process.env.LANDING_SMOKE_PORT ?? 4173);
const EXTERNAL = process.env.LANDING_SMOKE_URL?.replace(/\/$/, "") ?? "";
const BASE = EXTERNAL || `http://127.0.0.1:${PORT}`;
const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "laptop", width: 1280, height: 800 },
];

/**
 * Wait for the server we started, and only for that one.
 *
 * `died` is the whole point. Polling the port alone cannot tell our server
 * from somebody else's: when `next start` fails on EADDRINUSE because a
 * previous run leaked one, the port answers anyway, and the smoke test
 * happily reports "ok" three times against a build it did not make. A green
 * check on stale code is worse than a red one, so a child that exits before
 * the port answers is a failure, not something to poll through.
 */
async function waitUntilListening(child) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child?.exitCode != null) {
      throw new Error(
        `next start exited ${child.exitCode} before answering at ${BASE}. ` +
          `Port ${PORT} is most likely already in use.`
      );
    }
    try {
      const res = await fetch(BASE, { redirect: "manual" });
      if (res.status > 0) return;
    } catch {
      /* still booting */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`next start never answered at ${BASE}`);
}

/**
 * Is something already listening where we are about to start?
 *
 * Checked before spawning, because afterwards it is too late to tell: a
 * leaked server from a previous run answers the port on the first poll, so
 * `waitUntilListening` returns green before our own `next start` has even
 * reported its EADDRINUSE. That is how this script once printed "ok" three
 * times against a build it did not make, which is the one result a smoke
 * test must never produce.
 */
async function portIsBusy() {
  try {
    const res = await fetch(BASE, {
      redirect: "manual",
      signal: AbortSignal.timeout(2000),
    });
    return res.status > 0;
  } catch {
    return false;
  }
}

async function startServer() {
  if (EXTERNAL) return null;
  if (await portIsBusy()) {
    throw new Error(
      `Something is already listening on ${BASE}. That is usually a leaked ` +
        `server from an earlier run: stop it, then try again. Refusing to ` +
        `smoke a build this run did not start.`
    );
  }
  /*
    Its own process group, so it can be reaped as one.

    `npx` is a wrapper: it spawns `next start`, which is the process that
    actually holds the port. SIGKILL cannot be trapped, so killing the npx
    pid alone kills the wrapper and orphans the server, which goes on
    listening on 4173 until somebody notices. The next run then dies on
    EADDRINUSE, which reads as "the port is taken" rather than "the last
    run leaked". `detached` makes the child a group leader so the negative
    pid below signals the wrapper and the server together.
  */
  const child = spawn("npx", ["next", "start", "-p", String(PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(PORT) },
    detached: process.platform !== "win32",
  });
  child.stdout?.on("data", (chunk) => process.stderr.write(chunk));
  child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
  child.once("exit", (code) => {
    if (code && code !== 0) {
      console.error(`next start exited ${code}`);
    }
  });
  await waitUntilListening(child);
  return child;
}

/** Kill the server and everything it started. Safe to call twice. */
function stopServer(child) {
  if (!child?.pid) return;
  try {
    // Negative pid is the process group, which is why it was detached.
    if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
    else process.kill(child.pid, "SIGKILL");
  } catch {
    // Already gone, or the group went with it.
    try {
      process.kill(child.pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

async function smoke(page, viewport) {
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { level: 1 }).waitFor({ timeout: 20_000 });
  const heading = await page.getByRole("heading", { level: 1 }).innerText();
  if (!heading.includes("Your broker tells you what you own")) {
    throw new Error(`${viewport.name}: unexpected h1 ${JSON.stringify(heading)}`);
  }
  await page.getByRole("button", { name: "Continue with Google" }).first().waitFor();

  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
    };
  });
  if (overflow.scrollWidth > overflow.clientWidth + 1) {
    throw new Error(
      `${viewport.name}: horizontal overflow ${overflow.scrollWidth} > ${overflow.clientWidth}`
    );
  }
}

const HARD_MS = 90_000;
const hardTimer = setTimeout(() => {
  console.error("landing smoke timed out after 90s");
  try {
    browser?.close();
  } catch {
    /* already gone */
  }
  stopServer(server);
  process.exit(1);
}, HARD_MS);

const launchOpts = {
  args:
    process.env.CI || process.env.GITHUB_ACTIONS
      ? ["--no-sandbox", "--disable-setuid-sandbox"]
      : [],
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {}),
};

let server = null;
let browser = null;
let failed = null;
try {
  server = await startServer();
  browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  for (const viewport of VIEWPORTS) {
    await smoke(page, viewport);
    console.log(`ok ${viewport.name} ${viewport.width}x${viewport.height}`);
  }
  await page.goto(`${BASE}/privacy`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await page.getByRole("heading", { name: "Privacy Policy" }).waitFor({
    timeout: 20_000,
  });
  console.log("ok privacy");
} catch (err) {
  failed = err;
} finally {
  clearTimeout(hardTimer);
  stopServer(server);
  try {
    await Promise.race([
      browser?.close() ?? Promise.resolve(),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  } catch {
    /* close hung; we already killed next start */
  }
}

if (failed) {
  console.error(failed);
  process.exit(1);
}
process.exit(0);
