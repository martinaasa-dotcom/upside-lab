/**
 * Every URL this app ever put in somebody's bookmarks still opens the room
 * it named.
 *
 * `?tab=` on the root was the only way to name Pulse, Lab, Growth, Alerts
 * or a portfolio for the whole life of the app so far, so those URLs are in
 * browser histories, in bookmarks, and in mail already delivered. The
 * coverage test at the bottom is the one that matters most: it walks every
 * token `metaTabFromToken` accepts and fails if one has no redirect behind
 * it, so the two cannot drift apart the next time a spelling is added.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { legacyRedirectPath } from "@/lib/legacy-urls";
import { metaTabFromToken } from "@/lib/dashboard-tab";
import {
  ALERTS_TAB_ID,
  COMPOUND_TAB_ID,
  LAB_TAB_ID,
  OVERVIEW_TAB_ID,
  PULSE_TAB_ID,
  SEASONALITY_TAB_ID,
} from "@/lib/overview";

function to(url: string): string | null {
  const parsed = new URL(url, "https://upsidelab.app");
  return legacyRedirectPath(parsed.pathname, parsed.searchParams);
}

describe("legacy ?tab= URLs", () => {
  it("sends each meta tab to its own path", () => {
    expect(to("/?tab=pulse")).toBe("/pulse");
    expect(to("/?tab=lab")).toBe("/lab");
    expect(to("/?tab=compound")).toBe("/growth");
    expect(to("/?tab=alerts")).toBe("/alerts");
    expect(to("/?tab=overview")).toBe("/");
  });

  it("folds the spellings that stopped being rooms of their own", () => {
    // Seasonality moved inside Lab; statistics and stats predate the rename.
    expect(to("/?tab=seasonality")).toBe("/lab");
    expect(to("/?tab=statistics")).toBe("/lab");
    expect(to("/?tab=stats")).toBe("/lab");
  });

  it("names the portfolio it was asked for", () => {
    expect(to("/?tab=portfolio&portfolio=aasad")).toBe("/portfolio/aasad");
    // `book` is the old spelling and `forecast` was a panel, never a room.
    expect(to("/?tab=book&portfolio=aasad")).toBe("/portfolio/aasad");
    expect(to("/?tab=forecast&portfolio=aasad")).toBe("/portfolio/aasad");
  });

  it("keeps the phone dock's nameless Holdings href nameless", () => {
    expect(to("/?tab=portfolio")).toBe("/portfolio");
    expect(to("/?tab=book")).toBe("/portfolio");
  });

  it("escapes a token that would otherwise break the path", () => {
    expect(to("/?tab=portfolio&portfolio=a%2Fb")).toBe("/portfolio/a%2Fb");
  });

  it("reads a meta token out of legacy ?sheet= before treating it as a name", () => {
    // `?sheet=` predates `?tab=` and carried both kinds of token. Read the
    // wrong way round, this one opens a portfolio nobody has called "lab".
    expect(to("/?sheet=lab")).toBe("/lab");
    expect(to("/?sheet=compound")).toBe("/growth");
    expect(to("/?sheet=aasad")).toBe("/portfolio/aasad");
  });

  it("takes a bare ?portfolio= as the portfolio it names", () => {
    expect(to("/?portfolio=aasad")).toBe("/portfolio/aasad");
  });

  it("drops a token that names nothing rather than 404ing on it", () => {
    expect(to("/?tab=qwerty")).toBe("/");
  });

  it("answers the paths that only ever showed Overview", () => {
    expect(to("/dashboard")).toBe("/");
    expect(to("/forecast")).toBe("/");
    expect(to("/compound")).toBe("/growth");
  });

  it("leaves a canonical URL alone", () => {
    // Answering these is what would loop: `/` is already where `/` goes.
    for (const path of [
      "/",
      "/pulse",
      "/lab",
      "/growth",
      "/alerts",
      "/portfolio",
      "/portfolio/aasad",
      "/communities",
      "/account",
      "/upside-portfolio",
    ]) {
      expect(to(path), path).toBeNull();
    }
  });

  it("never answers with the URL it was given", () => {
    /*
     * The target carries no query, so a redirect is a loop only when it
     * lands on the same path the request had *and* that request had no
     * query to drop. `?tab=overview` is the near miss worth naming: its
     * room is the root the query already sits on, so the answer is `/`
     * and the progress is losing the `?tab=`. Written the naive way (the
     * target must differ from the path) this rule would forbid that.
     */
    for (const url of [
      "/?tab=overview",
      "/?tab=pulse",
      "/?sheet=lab",
      "/dashboard",
      "/compound",
      "/?tab=qwerty",
    ]) {
      const parsed = new URL(url, "https://upsidelab.app");
      const landing = to(url);
      if (landing === null) continue;
      const looped = landing === parsed.pathname && parsed.search === "";
      expect(looped, `${url} redirects to itself`).toBe(false);
      // And the answer is somewhere the app will not redirect again.
      expect(to(landing), `${url} lands somewhere final`).toBeNull();
    }
  });
});

describe("coverage", () => {
  it("has a redirect for every token the app still understands", () => {
    const tokens = [
      "compound",
      "lab",
      "pulse",
      "alerts",
      "overview",
      "statistics",
      "stats",
      "seasonality",
      COMPOUND_TAB_ID,
      LAB_TAB_ID,
      PULSE_TAB_ID,
      ALERTS_TAB_ID,
      OVERVIEW_TAB_ID,
      SEASONALITY_TAB_ID,
    ];
    for (const token of tokens) {
      expect(metaTabFromToken(token), `${token} is a token`).toBeTruthy();
      const landing = to(`/?tab=${encodeURIComponent(token)}`);
      expect(landing, `${token} has a redirect`).toBeTruthy();
      expect(landing, `${token} lands somewhere real`).toMatch(
        /^\/(pulse|lab|growth|alerts)?$/
      );
    }
  });

  it("is wired into the proxy, which is the only thing that can drop the query", () => {
    const proxy = readFileSync("src/proxy.ts", "utf8");
    expect(proxy).toMatch(/legacyRedirectPath\(path, request\.nextUrl\.searchParams\)/);
    expect(proxy).toMatch(/url\.search = ""/);
    expect(proxy).toMatch(/NextResponse\.redirect\(url, 308\)/);
    // API routes carry signed bodies and must never be redirected.
    const call = proxy.slice(proxy.indexOf("legacyRedirectPath(path"));
    expect(proxy.slice(0, proxy.indexOf("legacyRedirectPath(path"))).toMatch(
      /if \(!isApi\) \{/
    );
    expect(call.length).toBeGreaterThan(0);
  });
});
