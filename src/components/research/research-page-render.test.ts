import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/stock/MU",
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

// A stranger: nobody signed in, which is who this page is rendered for.
vi.mock("@/components/AuthProvider", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    useAuth: () => ({
      ready: true,
      user: null,
      profile: null,
      signInWithGoogle: async () => {},
      signOut: async () => {},
      refresh: async () => {},
    }),
  };
});

import { ResearchPage } from "@/components/research/ResearchPage";
import type { CompanyPage } from "@/lib/company/client";
import type { CompanyBrief } from "@/lib/ai/company-brief";
import { makeOrdinaryFacts } from "@/lib/company/facts-fixture";
import { companyReadings } from "@/lib/company/readings";

/*
  RENDER THE PUBLIC COMPANY PAGE, THE ONE A STRANGER AND A SEARCH ENGINE GET.

  `/stock/<ticker>` is public now: no account, no sign-in in front of it,
  rendered on the server so the whole company is in the HTML. These read
  the real component's markup for the promises that page makes: the
  company is there, the price sits in fair value zones that say whose they
  are, the page can be shared, the written half says how current it is,
  and every way into the app is an ordinary link that comes back to this
  company rather than a wall or a dialog.
*/

const BRIEF: CompanyBrief = {
  whatTheyDo: "They make memory chips that computers and phones use to hold what they are working on.",
  howTheyMakeMoney: "They sell those chips to the companies that build computers, phones and data centres.",
  inOneLine: "A memory chip maker whose fortunes rise and fall with chip prices.",
  caseFor: [
    { point: "Revenue grew by a fifth last year, which is fast for a company this size.", cite: { kind: "figure", ref: "growth", label: "Revenue growth" } },
  ],
  caseAgainst: [
    { point: "Memory prices swing hard, and profits have swung with them before.", cite: { kind: "profile", ref: "" } },
  ],
  watchFor: [
    { point: "The next results, for whether demand from data centres holds up.", cite: { kind: "profile", ref: "" } },
  ],
  path: {},
  pathReason: "",
  uncited: 0,
};

function page(over: Partial<CompanyPage> = {}): CompanyPage {
  const facts = makeOrdinaryFacts({ ticker: "MU", name: "Micron Technology, Inc." });
  return {
    facts,
    readings: companyReadings(facts),
    articles: [
      {
        title: "Micron agrees to buy a chip packaging company",
        publisher: "Reuters",
        href: "https://example.com/news",
        publishedAt: "2026-10-01T08:00:00.000Z",
      },
    ],
    sources: [],
    thin: false,
    nextEarnings: null,
    nextEarningsIsEstimate: false,
    brief: BRIEF,
    briefAt: "2026-09-28T09:00:00.000Z",
    briefShared: true,
    briefState: { kind: "fresh" },
    model: null,
    ...over,
  };
}

const render = (p: CompanyPage) =>
  renderToStaticMarkup(createElement(ResearchPage, { page: p }));

describe("the public company page", () => {
  it("is the company, in full, with no sign-in in front of it", () => {
    const html = render(page());
    expect(html).toContain("Micron Technology");
    expect(html).toContain(BRIEF.whatTheyDo);
    expect(html).not.toMatch(/role="dialog"/);
    expect(html).not.toMatch(/Continue with Google/);
  });

  it("can be shared, from the top of the page", () => {
    const html = render(page());
    expect(html).toMatch(/aria-label="Share \$MU"/);
    expect(html).toContain(">Share<");
  });

  it("places the price in fair value zones that say they are this app's, not the reader's", () => {
    const html = render(page());
    expect(html).toContain("Fair value zones");
    expect(html).not.toContain("Your fair value zones");
    expect(html).toContain("the fair value zones file under");
  });

  it("leads into the app by ordinary links that come back to this company", () => {
    const html = render(page());
    const back = "/login?next=%2Fstock%2FMU";
    expect(html).toContain(`href="${back}"`);
    expect(html).toContain("Set your own levels");
    expect(html).toContain("Open MU in Upside Lab");
  });

  it("says the written half is current when nothing has happened", () => {
    const html = render(page());
    expect(html).toContain("Up to date");
    expect(html).toContain("and still current");
  });

  it("says what happened when the written half is due a rewrite", () => {
    const html = render(
      page({
        briefState: {
          kind: "stale",
          reason: "news",
          headline: {
            title: "Micron agrees to buy a chip packaging company",
            publisher: "Reuters",
            href: "https://example.com/news",
            publishedAt: "2026-10-01T08:00:00.000Z",
            event: "deal",
          },
        },
      })
    );
    expect(html).toContain("News since");
    expect(html).toContain("Micron agrees to buy a chip packaging company");
  });

  it("invites somebody to have it written when there is no written half yet", () => {
    const html = render(page({ brief: null, briefAt: null, briefState: { kind: "missing" } }));
    expect(html).toContain("The written analysis is not here yet");
    expect(html).toContain("Have it written now");
    // The figures are still all there.
    expect(html).toContain("Micron Technology");
  });
});
