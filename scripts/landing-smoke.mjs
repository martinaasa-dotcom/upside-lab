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

async function waitUntilListening() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
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

async function startServer() {
  if (EXTERNAL) return null;
  const child = spawn("npx", ["next", "start", "-p", String(PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(PORT) },
  });
  child.stdout?.on("data", (chunk) => process.stderr.write(chunk));
  child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
  child.once("exit", (code) => {
    if (code && code !== 0) {
      console.error(`next start exited ${code}`);
    }
  });
  await waitUntilListening();
  return child;
}

async function smoke(page, viewport) {
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { level: 1 }).waitFor({ timeout: 20_000 });

  /*
    The hero is there and it is the hero, rather than one exact sentence.

    This used to require the h1 to contain "Your broker tells you what you
    own". That is a landing page headline: it is rewritten whenever the
    pitch is, and every rewrite failed a smoke test whose own comment says
    it is checking that the page paints. Worse, it failed here, after a
    build, in the one job a copy change does not otherwise touch, so the
    signal read as something being broken.

    What a smoke test is for is the page having rendered at all instead of
    an error boundary or an empty shell, so that is what it asks: a real
    headline with real words in it, the sample card the hero is built
    around, and the ask. Any of those missing is the failure this job
    exists to catch, and none of them moves when the copy does.
  */
  const heading = await page.getByRole("heading", { level: 1 }).innerText();
  if (heading.trim().split(/\s+/).length < 6) {
    throw new Error(
      `${viewport.name}: h1 is too thin to be the hero ${JSON.stringify(heading)}`
    );
  }
  await page.locator("[data-scroll-cue-still]").first().waitFor({
    timeout: 20_000,
  });
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
  if (server?.pid) {
    try {
      process.kill(server.pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
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
  if (server?.pid) {
    try {
      process.kill(server.pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
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
