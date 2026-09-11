import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => {}, replace: () => {}, refresh: () => {},
    back: () => {}, forward: () => {}, prefetch: () => {},
  }),
  usePathname: () => "/upside-portfolio",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: () => {},
  notFound: () => {},
}));

vi.mock("@/components/AuthProvider", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    useAuth: () => ({
      ready: true,
      user: { id: "u1", email: "someone@example.com" },
      profile: { id: "u1", display_name: "Someone", note_sunday: true },
      signOut: async () => {},
      refresh: async () => {},
    }),
  };
});

function textOf(markup: string): string {
  return markup.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g,"&").replace(/&#x27;/g,"'").replace(/&quot;/g,'"')
    .replace(/&nbsp;/g," ").replace(/\s+/g, " ").trim();
}

const ROOMS: [string, () => Promise<{ default?: unknown } & Record<string, unknown>>][] = [
  ["Fund", () => import("@/components/UpsidePortfolioPage")],
  ["Account", () => import("@/components/AccountPage")],
];

/*
  THE ROOMS THE SAMPLE CANNOT REACH.

  Circle, the Fund, Account and a company page all need an account, so a
  walk through the signed-out sample renders none of them: measured, each
  answers with the gate card and 378 characters. That left four rooms with
  no render coverage at all, and two of them had been changed.

  A session is mocked rather than minted, because a test run has no
  Supabase credentials. That makes this a check that the rooms build and
  say something sane in their cold state, not a check of their data. The
  Circle's own render, with real props, is `circle-render.test.ts`.
*/
describe("the rooms a stranger cannot reach, in their cold state", () => {
  for (const [name, load] of ROOMS) {
    it(name, async () => {
      const mod = await load();
      const Comp = (mod[Object.keys(mod).find((k) => /Page$/.test(k))!] ??
        mod.default) as Parameters<typeof createElement>[0];
      const text = textOf(renderToStaticMarkup(createElement(Comp)));
      console.log(`\n=== ${name} (${text.length} chars) ===\n${text.slice(0, 620)}`);
      expect(text).not.toMatch(/undefined|NaN|\[object Object\]/);
    });
  }
});
