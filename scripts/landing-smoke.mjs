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

function waitForReady(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("next start did not become ready in 60s"));
    }, 60_000);
    let buf = "";
    const onData = (chunk) => {
      buf += chunk.toString();
      if (/Ready in|started server|Local:/i.test(buf)) {
        cleanup();
        resolve(undefined);
      }
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`next start exited ${code} before ready\n${buf}`));
    };
    function cleanup() {
      clearTimeout(timer);
      child.stdout?.off("data", onData);
      child.stderr?.off("data", onData);
      child.off("exit", onExit);
    }
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("exit", onExit);
  });
}

async function startServer() {
  if (EXTERNAL) return null;
  const child = spawn("npx", ["next", "start", "-p", String(PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(PORT) },
  });
  await waitForReady(child);
  return child;
}

async function smoke(page, viewport) {
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });
  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 45_000 });
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

const launchOpts = process.env.PLAYWRIGHT_CHROMIUM_PATH
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
  : {};

let server = null;
let browser = null;
try {
  server = await startServer();
  browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  for (const viewport of VIEWPORTS) {
    await smoke(page, viewport);
    console.log(`ok ${viewport.name} ${viewport.width}x${viewport.height}`);
  }
  await page.goto(`${BASE}/privacy`, { waitUntil: "load", timeout: 45_000 });
  await page.getByRole("heading", { name: "Privacy Policy" }).waitFor({
    timeout: 20_000,
  });
  console.log("ok privacy");
} finally {
  await browser?.close();
  if (server) {
    server.kill("SIGTERM");
  }
}
