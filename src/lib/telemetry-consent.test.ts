import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ANALYTICS_CONSENT_KEY } from "@/lib/analytics-consent";

/*
  The cookie card says "Performance measurement is optional" and offers a
  No thanks button, and the code sent anyway.

  `WebVitals` is mounted unconditionally in the root layout, so a reader who
  pressed No thanks went on reporting CLS, LCP, TTFB and the path of every
  page they opened, on every load, for as long as they used the app. Nothing
  in the payload identifies anybody and no cookie is set by it, so this was
  never a leak. It was a promise the code did not keep, on the one card
  whose whole job is to ask honestly, which is the same fault as a document
  describing a defence the code does not have.
*/
const client = readFileSync(
  join(process.cwd(), "src/lib/telemetry-client.ts"),
  "utf8"
);

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  (globalThis as { window?: unknown }).window = {};
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe("saying no to performance measurement", () => {
  it("stops the send, rather than only the third-party one", () => {
    expect(client).toContain('if (loadAnalyticsConsent() === "deny") return;');
    const fn = client.slice(client.indexOf("export function reportWebVital"));
    const gate = fn.indexOf("loadAnalyticsConsent");
    const send = fn.indexOf("sendBeacon");
    expect(gate).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(gate);
  });

  it("reads the answer when it sends, not when it mounted", () => {
    /*
      Read at mount, pressing No thanks would stop the page after next
      rather than the next measurement, and the reader would watch the
      network panel disagree with the button they just pressed.
    */
    const fn = client.slice(
      client.indexOf("export function reportWebVital"),
      client.indexOf("export function reportWebVital") + 900
    );
    expect(fn).toContain("loadAnalyticsConsent()");
  });

  it("leaves an unanswered reader measured, which is what the card says", () => {
    // "Optional" is not "off until asked", and the card is on screen saying
    // so. Only an explicit no changes anything.
    store.set(ANALYTICS_CONSENT_KEY, "allow");
    expect(client).not.toMatch(/loadAnalyticsConsent\(\) !== "allow"/);
  });

  it("does not gate the error report on it", () => {
    /*
      A crash report is not analytics: it is how a broken screen gets
      noticed at all, it carries no measurement of anybody's behaviour, and
      the card does not offer to turn it off. Gating it would quietly turn
      "no thanks to performance measurement" into "and stop telling anyone
      when the app breaks for me".
    */
    const errFn = client.slice(
      client.indexOf("export function reportClientError"),
      client.indexOf("export function reportWebVital")
    );
    expect(errFn).not.toContain("loadAnalyticsConsent");
  });
});
