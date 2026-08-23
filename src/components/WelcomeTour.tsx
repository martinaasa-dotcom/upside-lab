"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { Input } from "@/components/ui/input";
import { CARD, SUGGEST_MENU } from "@/components/ui/Panel";
import { TickerSymbol } from "@/components/TickerSymbol";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { ownedBookPortfolios } from "@/lib/classroom";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import {
  EXPERIENCE_TIERS,
  saveStoredKnowsOptions,
  saveStoredTier,
  type ExperienceTier,
} from "@/lib/experience-tier";
import { requestBookRefresh } from "@/lib/book-cache";
import { cn } from "@/lib/format";
import {
  isSafePositiveMoney,
  isSafeShares,
  sanitizeTickerQuery,
} from "@/lib/input-guard";
import {
  listingAmountToUsd,
  listingCurrency,
  listingPriceDigits,
  usdPerMapFromFx,
} from "@/lib/listing-currency";
import {
  localTickerSuggestions,
  looksLikeTickerQuery,
  mergeAndRankTickerSuggestions,
  pickTickerSuggestion,
} from "@/lib/market/ticker-search";
import { roundMoney, roundShares } from "@/lib/money";
import { blockWheelChange, parseDecimal } from "@/lib/number-input";
import { postJsonOrQueue } from "@/lib/offline/queued-fetch";
import { FALLBACK_POPULAR_TICKERS } from "@/lib/popular-tickers";
import { FIRST_SHEET_NAME, PRODUCT_NAME } from "@/lib/product";
import {
  isPlausibleTicker,
  normalizeYahooTicker,
} from "@/lib/ticker";
import { useTickerSearch } from "@/lib/use-ticker-search";
import { WELCOME_TOUR_VERSION } from "@/lib/welcome-tour";
import {
  addWatchlistTicker,
  loadWatchlist,
  removeWatchlistTicker,
  saveWatchlist,
} from "@/lib/watchlist";
import {
  Activity,
  Calculator,
  Check,
  Download,
  FlaskConical,
  GraduationCap,
  LayoutDashboard,
  Lock,
  Mail,
  MessageCircle,
  Plus,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

/*
  The walkthrough somebody gets on their way in, and the one thing this app
  had never actually done.

  What this replaces asked two questions about the reader, said four sentences
  about the product, and had been switched off since 2026-08-18 besides. Even
  when it ran, `shouldSkipExperienceOnboarding` skipped it for anybody who
  already owned anything — so the set of people who had ever been told what
  Pulse is, where Lab lives, or that a circle is opt-in was close to empty,
  and certainly did not include a single existing holder.

  So it says the whole thing now, and everybody gets it once. Its rules:

    Explaining comes before asking. The first four screens want nothing from
    the reader at all. The questions and the fields are on the other side of
    them, because somebody who has just been told what this is has a reason
    to answer and somebody who has not is filling in a form.

    Every screen is one idea. A modal that scrolls is a document.

    Nothing is invented here. The rooms are the dock's rooms and the
    disclaimer is the shared one, so this cannot end up describing an app
    Upside Lab stopped being.

    Nothing is required. Every screen after the questions can be skipped, and
    skipping the whole thing is a button on the first one. A walkthrough that
    holds somebody hostage is a wall.

    It is a portfolio. Never a sheet, never a book — see AGENTS.md. The copy
    this replaced said "your book" three times.
*/

type Props = {
  /** Called once the tour is finished or skipped; both write the version. */
  onDone: (input: {
    tier: ExperienceTier | null;
    knowsOptions: boolean | null;
    skipped: boolean;
  }) => void;
  /** They already own things: no reason to ask them to type it in again. */
  hasHoldings: boolean;
  /**
   * A paper-class account. Their holdings come from a homework portfolio the
   * teacher provisioned, so "add what you own" is the wrong question and
   * "invite a partner" is the wrong offer.
   */
  classroomOnly: boolean;
  /** What we already know, so the two questions arrive pre-answered. */
  initialTier: ExperienceTier | null;
  initialKnowsOptions: boolean | null;
};

type Q1Answer = "new" | "comfortable" | "active";
type Q2Answer = "never" | "know" | "regularly";

type Stage =
  | "what"
  | "map"
  | "helps"
  | "rules"
  | "q1"
  | "q2"
  | "holdings"
  | "watchlist"
  | "email"
  | "done";

/** The dot label under the progress bar. Short: it shares a line with a count. */
const STAGE_LABEL: Record<Stage, string> = {
  what: "What this is",
  map: "Where things are",
  helps: "What it does",
  rules: "Ground rules",
  q1: "About you",
  q2: "Options",
  holdings: "What you own",
  watchlist: "Watching",
  email: "Sunday email",
  done: "Done",
};

const Q1_OPTIONS: {
  id: Q1Answer;
  label: string;
  detail: string;
  icon: typeof GraduationCap;
}[] = [
  {
    id: "new",
    label: "New to this, still learning the basics",
    detail: "Plainer wording, fewer numbers at once.",
    icon: GraduationCap,
  },
  {
    id: "comfortable",
    label: "Comfortable — I understand stocks and portfolios",
    detail: "The middle setting, and the one most people want.",
    icon: TrendingUp,
  },
  {
    id: "active",
    label: "Very experienced — I follow markets closely",
    detail: "Everything on, nothing simplified away.",
    icon: Sparkles,
  },
];

const Q2_OPTIONS: { id: Q2Answer; label: string; detail: string }[] = [
  {
    id: "never",
    label: "No, not familiar with them",
    detail: "We hide covered calls, strike alerts and Call % everywhere.",
  },
  {
    id: "know",
    label: "I understand them but rarely use them",
    detail: "They stay visible. Ignore them and nothing changes.",
  },
  {
    id: "regularly",
    label: "Yes, regularly",
    detail: "Covered-call tools stay on, including in Margus.",
  },
];

const Q1_TIER: Record<Q1Answer, ExperienceTier> = {
  new: "novice",
  comfortable: "investor",
  active: "advanced",
};
const Q2_TIER: Record<Q2Answer, ExperienceTier> = {
  never: "novice",
  know: "investor",
  regularly: "advanced",
};
const TIER_RANK: Record<ExperienceTier, number> = {
  novice: 0,
  investor: 1,
  advanced: 2,
};
const TIER_Q1: Record<ExperienceTier, Q1Answer> = {
  novice: "new",
  investor: "comfortable",
  advanced: "active",
};

const POPULAR_PICKS = FALLBACK_POPULAR_TICKERS.slice(0, 12);

type AddedHolding = { ticker: string; shares: number; buyPrice: number };

function blendTier(q1: Q1Answer, q2: Q2Answer): ExperienceTier {
  return TIER_RANK[Q2_TIER[q2]] > TIER_RANK[Q1_TIER[q1]]
    ? Q2_TIER[q2]
    : Q1_TIER[q1];
}

/** One explained thing on a telling screen. Icon, name, sentence. */
function Row({
  icon: Icon,
  term,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  term: string;
  children: React.ReactNode;
}) {
  return (
    <li className={cn(CARD, "flex items-start gap-3 p-3.5")}>
      {Icon ? (
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      ) : null}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{term}</span>
        <span className="text-sm text-muted-foreground">{children}</span>
      </span>
    </li>
  );
}

export function WelcomeTour({
  onDone,
  hasHoldings,
  classroomOnly,
  initialTier,
  initialKnowsOptions,
}: Props) {
  /*
    Which screens this reader gets.

    Two of them are conditional, and both for the same reason: a screen that
    asks for something the reader has already given, or that their account
    cannot act on, reads as an app that has not looked at them. Somebody with
    holdings is not asked to type them in. A paper-class account is not asked
    either — their portfolio comes from the teacher.
  */
  const stages = useMemo<Stage[]>(() => {
    const askForHoldings = !hasHoldings && !classroomOnly;
    return [
      "what",
      "map",
      "helps",
      "rules",
      "q1",
      "q2",
      ...(askForHoldings ? (["holdings"] as Stage[]) : []),
      "watchlist",
      "email",
      "done",
    ];
  }, [hasHoldings, classroomOnly]);

  const [index, setIndex] = useState(0);
  const stage = stages[Math.min(index, stages.length - 1)]!;
  const scrollRef = useRef<HTMLDivElement>(null);

  const [q1, setQ1] = useState<Q1Answer | null>(
    initialTier ? TIER_Q1[initialTier] : null
  );
  const [q2, setQ2] = useState<Q2Answer | null>(
    initialKnowsOptions === true
      ? "regularly"
      : initialKnowsOptions === false
        ? "never"
        : null
  );
  const [noteSunday, setNoteSunday] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState<{
    tier: ExperienceTier;
    knowsOptions: boolean;
  } | null>(null);

  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [stockError, setStockError] = useState<string | null>(null);
  const [stockBusy, setStockBusy] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [added, setAdded] = useState<AddedHolding[]>([]);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const tickerRef = useRef<HTMLInputElement>(null);
  const remote = useTickerSearch(stage === "holdings" ? ticker : "");
  const suggestions = useMemo(
    () =>
      mergeAndRankTickerSuggestions(
        ticker,
        localTickerSuggestions(ticker, [], new Set()),
        remote,
        new Set()
      ),
    [ticker, remote]
  );

  const [watching, setWatching] = useState<string[]>([]);
  const [watchDraft, setWatchDraft] = useState("");
  const [popular, setPopular] = useState<string[]>([...POPULAR_PICKS]);

  useEffect(() => {
    setWatching(loadWatchlist());
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void fetch("/api/popular-tickers", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { tickers?: string[] } | null) => {
        if (ctrl.signal.aborted) return;
        if (data?.tickers?.length) setPopular(data.tickers.slice(0, 12));
      })
      .catch(() => {
        /* keep the fallback twelve */
      });
    return () => ctrl.abort();
  }, []);

  /*
    Back to the top on every step. The panel is its own scroller, so a long
    screen followed by a short one would otherwise open halfway down.
  */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [index]);

  function go(delta: number) {
    setIndex((i) => Math.min(Math.max(i + delta, 0), stages.length - 1));
  }

  /**
   * Everything the reader told us, written down in one place.
   *
   * Called on the way into the last screen and again if they skip out early,
   * so an abandoned tour still keeps whatever was answered before it was
   * abandoned. localStorage first: it is what every gate in the app reads,
   * and it is the copy that survives the request failing.
   */
  async function persist(): Promise<{
    tier: ExperienceTier | null;
    knowsOptions: boolean | null;
  }> {
    const tier = q1 && q2 ? blendTier(q1, q2) : initialTier;
    const knowsOptions = q2 ? q2 === "regularly" : initialKnowsOptions;

    if (tier) saveStoredTier(tier);
    if (knowsOptions !== null && knowsOptions !== undefined) {
      saveStoredKnowsOptions(knowsOptions);
    }
    saveWatchlist(watching);

    try {
      await postJsonOrQueue("/api/account/experience-tier", {
        ...(tier ? { tier } : {}),
        ...(knowsOptions === null || knowsOptions === undefined
          ? {}
          : { knowsOptions }),
        tourVersion: WELCOME_TOUR_VERSION,
      });
      await postJsonOrQueue("/api/account/weekly-note", { sunday: noteSunday });
    } catch {
      /* localStorage has the answers; the email switch lives in Account too */
    }
    return { tier: tier ?? null, knowsOptions: knowsOptions ?? null };
  }

  async function finishQuestions() {
    if (saving) return;
    setSaving(true);
    const saved = await persist();
    setSaving(false);
    if (saved.tier) {
      setFinished({
        tier: saved.tier,
        knowsOptions: saved.knowsOptions ?? true,
      });
    }
    setIndex(stages.indexOf("done"));
  }

  async function skipOut() {
    if (saving) return;
    setSaving(true);
    const saved = await persist();
    setSaving(false);
    onDone({ ...saved, skipped: true });
  }

  async function ensureSheet(): Promise<string | null> {
    if (sheetId) return sheetId;
    const res = await fetch("/api/portfolios", { cache: "no-store" });
    const data = res.ok ? await res.json() : null;
    const own = ownedBookPortfolios(
      (data?.portfolios ?? []) as {
        id: string;
        classroom_community_id?: string | null;
      }[]
    );
    if (own[0]?.id) {
      setSheetId(own[0].id);
      return own[0].id;
    }
    const created = await fetch("/api/portfolios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: FIRST_SHEET_NAME }),
    });
    if (!created.ok) return null;
    const createdData = (await created.json()) as {
      portfolio?: { id?: string };
    };
    const id = createdData.portfolio?.id ?? null;
    if (id) setSheetId(id);
    return id;
  }

  async function resolveTicker(raw: string): Promise<string> {
    const picked = pickTickerSuggestion(raw, suggestions);
    if (picked?.symbol) return normalizeYahooTicker(picked.symbol);
    if (looksLikeTickerQuery(raw)) return normalizeYahooTicker(raw);
    try {
      const res = await fetch(
        `/api/market/search?q=${encodeURIComponent(raw)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return "";
      const data = (await res.json()) as {
        results?: { symbol: string; name: string | null }[];
      };
      const hit = pickTickerSuggestion(raw, data.results ?? []);
      return hit?.symbol ? normalizeYahooTicker(hit.symbol) : "";
    } catch {
      return "";
    }
  }

  async function addHolding() {
    if (stockBusy) return;
    setStockBusy(true);
    setStockError(null);
    try {
      const sharesN = parseDecimal(shares);
      const buyN = parseDecimal(buyPrice);
      const normalizedTicker = await resolveTicker(ticker.trim());
      if (!normalizedTicker) {
        setStockError("Type a ticker or a company name.");
        return;
      }
      if (!isPlausibleTicker(normalizedTicker)) {
        setStockError("That ticker doesn't look like a real symbol.");
        return;
      }
      if (!isSafeShares(sharesN)) {
        setStockError("Share count has to be bigger than 0 and not enormous.");
        return;
      }
      if (!isSafePositiveMoney(buyN)) {
        setStockError("Buy price has to be bigger than 0 and not enormous.");
        return;
      }

      let buyUsd = roundMoney(buyN);
      const buyCode = listingCurrency(normalizedTicker);
      if (buyCode !== "USD") {
        const fxRes = await fetch(
          `/api/quotes?tickers=${encodeURIComponent(normalizedTicker)}`,
          { cache: "no-store" }
        );
        if (!fxRes.ok) {
          setStockError("Couldn't convert that buy price. Try again in a second.");
          return;
        }
        const fxJson = (await fxRes.json()) as {
          fx?: {
            eurUsd?: number | null;
            gbpUsd?: number | null;
            usdPer?: Record<string, number | null | undefined>;
          };
        };
        const rates = usdPerMapFromFx(fxJson.fx);
        if (!(rates[buyCode] > 0)) {
          setStockError("Couldn't convert that buy price. Try again in a second.");
          return;
        }
        buyUsd = listingAmountToUsd(buyN, buyCode, rates);
      }

      const id = await ensureSheet();
      if (!id) {
        setStockError("Couldn't open a portfolio. Try again.");
        return;
      }
      const res = await fetch("/api/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolio_id: id,
          ticker: normalizedTicker,
          shares: roundShares(sharesN),
          buy_price: buyUsd,
        }),
      });
      if (!res.ok) {
        setStockError("Couldn't save that holding. Try again.");
        return;
      }
      setAdded((prev) => [
        ...prev.filter((r) => r.ticker !== normalizedTicker),
        {
          ticker: normalizedTicker,
          shares: roundShares(sharesN),
          buyPrice: roundMoney(buyN, listingPriceDigits(buyCode)),
        },
      ]);
      setTicker("");
      setShares("");
      setBuyPrice("");
      setListOpen(false);
      requestBookRefresh();
      requestAnimationFrame(() => tickerRef.current?.focus());
    } catch {
      setStockError("Couldn't save that holding. Try again.");
    } finally {
      setStockBusy(false);
    }
  }

  function toggleWatch(symbol: string) {
    const t = symbol.trim().toUpperCase();
    if (!t) return;
    setWatching((prev) =>
      prev.includes(t) ? removeWatchlistTicker(prev, t) : addWatchlistTicker(prev, t)
    );
  }

  async function addWatchDraft() {
    const raw = watchDraft.trim();
    if (!raw) return;
    let t = looksLikeTickerQuery(raw) ? normalizeYahooTicker(raw) : "";
    if (!t) {
      try {
        const res = await fetch(
          `/api/market/search?q=${encodeURIComponent(raw)}`,
          { cache: "no-store" }
        );
        const data = (await res.json()) as {
          results?: { symbol: string; name: string | null }[];
        };
        t = pickTickerSuggestion(raw, data.results ?? [])?.symbol ?? "";
        if (t) t = normalizeYahooTicker(t);
      } catch {
        t = "";
      }
    }
    if (!/^[A-Z0-9.=^-]{1,12}$/.test(t)) return;
    setWatching((prev) => addWatchlistTicker(prev, t));
    setWatchDraft("");
  }

  const tierLabel = finished
    ? EXPERIENCE_TIERS.find((t) => t.id === finished.tier)?.label
    : null;
  const buyCode = ticker.trim()
    ? listingCurrency(
        looksLikeTickerQuery(ticker)
          ? normalizeYahooTicker(ticker)
          : ticker.trim().toUpperCase()
      )
    : "USD";

  /*
    The one button that changes shape.

    Every screen has the same footer, because a walkthrough where the way
    forward moves is a walkthrough somebody has to re-read the bottom of ten
    times. Only the label, and whether it is allowed yet, differ.
  */
  const nextDisabled =
    (stage === "q1" && !q1) || (stage === "q2" && !q2) || saving;
  const nextLabel =
    stage === "email"
      ? saving
        ? "Saving…"
        : "Finish"
      : stage === "holdings"
        ? added.length
          ? "Continue"
          : "Skip for now"
        : stage === "watchlist"
          ? watching.length
            ? "Continue"
            : "Skip for now"
          : "Next";

  function onNext() {
    if (stage === "email") {
      void finishQuestions();
      return;
    }
    if (stage === "watchlist") saveWatchlist(watching);
    go(1);
  }

  return (
    <ViewportOverlay
      className="z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      ariaLabelledBy="welcome-tour-title"
    >
      <div className="glass-overlay flex max-h-[min(100%,44rem)] w-full max-w-md flex-col overflow-hidden rounded-xl p-5 ring-1 ring-foreground/20 sm:max-w-lg sm:p-6">
        {/* Progress. Segments rather than labels: ten labels do not fit a phone. */}
        <div className="mb-5 shrink-0">
          <div className="flex gap-1" aria-hidden>
            {stages.map((s, i) => (
              <span
                key={s}
                className={cn(
                  "h-1 min-w-0 flex-1 rounded-full transition-colors",
                  i <= index ? "bg-primary" : "bg-muted"
                )}
              />
            ))}
          </div>
          <p className="mt-2 text-sm tabular-nums text-muted-foreground">
            Step {index + 1} of {stages.length} · {STAGE_LABEL[stage]}
          </p>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {stage === "what" && (
            <div className="flex flex-col gap-4">
              <div>
                <h2
                  id="welcome-tour-title"
                  className="text-lg font-semibold text-foreground"
                >
                  This is {PRODUCT_NAME}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  You tell it what you already own — the ticker, how many
                  shares, what you paid. From then on it prices everything for
                  you and tries to answer one question: is the reason you
                  bought this still true?
                </p>
              </div>
              <ul className="flex flex-col gap-2">
                <Row icon={Wallet} term="It is not a brokerage">
                  Nothing here can buy or sell anything, and it is not
                  connected to any account you hold. Typing a holding in is
                  bookkeeping, not a trade.
                </Row>
                <Row icon={Activity} term="It is a read, not a screener">
                  There is no list of things to buy. Everything here is about
                  what you already own and the handful of names you have said
                  you are watching.
                </Row>
                <Row icon={ShieldCheck} term="It is educational">
                  {ADVICE_DISCLAIMER_SHORT}
                </Row>
              </ul>
              <p className="text-sm text-muted-foreground">
                A minute from here and you will know the whole app. Skip it any
                time — the button is bottom-left on every screen.
              </p>
            </div>
          )}

          {stage === "map" && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Where everything is
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  The bar along the bottom of the screen is the whole
                  navigation. Your own portfolios sit in it too, one cell each,
                  and the <Plus className="inline h-3.5 w-3.5 align-[-2px]" />{" "}
                  cell makes a new one.
                </p>
              </div>
              <ul className="flex flex-col gap-2">
                <Row icon={LayoutDashboard} term="Home">
                  Today&apos;s briefing, every portfolio you own, and one row
                  per holding — what it cost, what it is worth, what it did
                  today.
                </Row>
                <Row icon={Activity} term="Pulse">
                  When a name moves, a plain read of what happened and whether
                  your reason for owning it moved with it. Each name gets a
                  badge: thesis intact, thesis watch, or thesis broken.
                </Row>
                <Row icon={FlaskConical} term="Lab">
                  Four views of the same portfolio: Allocation (what you are
                  actually concentrated in), Risk, Trends, and Seasonality.
                </Row>
                <Row icon={Calculator} term="Growth">
                  Arithmetic on what you have: what this becomes if you keep
                  adding at some rate for some years. Not a prediction.
                </Row>
                <Row icon={Users} term="Circle">
                  Optional. People you choose to share a portfolio with — a
                  partner, family, a class. Nothing is shared until you share
                  it.
                </Row>
                <Row icon={UserCog} term="Account">
                  The Sunday email, how much detail you want shown, and your
                  data — export it or delete it, any time.
                </Row>
              </ul>
            </div>
          )}

          {stage === "helps" && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  The parts that do the thinking
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Three of them, and all three are about the names you already
                  hold. None of them will ever tell you to buy something.
                </p>
              </div>
              <ul className="flex flex-col gap-2">
                <Row icon={MessageCircle} term="Margus">
                  An assistant that can read your portfolio and talk it through
                  in plain language. Ask why something moved, what a number
                  means, or what you would be left with if one name halved.
                </Row>
                <Row icon={Activity} term="Thesis Pulse and Forecast">
                  Pulse checks whether the story behind a holding still stands.
                  Forecast walks a name forward under a few different
                  scenarios. Both are for thinking with, not answers.
                </Row>
                <Row icon={Mail} term="The Sunday email">
                  One email a week. How the week went, what looks worth a
                  second look, and what to think about next. Its suggestions
                  come from Pulse verdicts you have already seen — nothing in
                  it is invented.
                </Row>
              </ul>
              <p className="text-sm text-muted-foreground">
                {ADVICE_DISCLAIMER_SHORT}
              </p>
            </div>
          )}

          {stage === "rules" && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Ground rules
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Four things worth knowing before you put anything in.
                </p>
              </div>
              <ul className="flex flex-col gap-2">
                <Row icon={Lock} term="Nothing is shared by default">
                  A portfolio is yours. A circle is opt-in and invite-only, and
                  you are never added to one by signing in. You can invite a
                  co-owner from the portfolio itself.
                </Row>
                <Row icon={ShieldCheck} term="Not advice">
                  {ADVICE_DISCLAIMER_SHORT} Nothing here knows your situation,
                  your timeline, or what else you have.
                </Row>
                <Row icon={Download} term="Your data is yours">
                  Export everything or delete the account outright from
                  Account. Deleting means deleting.
                </Row>
                <Row icon={Wallet} term="Prices are free-tier and delayed">
                  Good enough to see how a week went. Not good enough to trade
                  on, which is fine, because you cannot trade here.
                </Row>
              </ul>
            </div>
          )}

          {stage === "q1" && (
            <div className="flex flex-col gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  How would you describe yourself?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This only changes how much is shown at once. Nothing is
                  locked away, and you can change it whenever you like in
                  Account.
                </p>
              </div>
              {Q1_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const on = q1 === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setQ1(opt.id)}
                    aria-pressed={on}
                    className={cn(
                      CARD,
                      "flex w-full items-start gap-3 p-3.5 text-left transition hover:bg-hover",
                      on && "ring-1 ring-primary/40"
                    )}
                  >
                    <Icon
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        on ? "text-primary" : "text-muted-foreground"
                      )}
                      aria-hidden
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span
                        className={cn(
                          "text-sm font-medium",
                          on ? "text-primary" : "text-foreground"
                        )}
                      >
                        {opt.label}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {opt.detail}
                      </span>
                    </span>
                    {on && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          )}

          {stage === "q2" && (
            <div className="flex flex-col gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Have you used covered calls or other options?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  A separate question from the last one — plenty of very
                  experienced investors have never touched an option. Also
                  changeable in Account.
                </p>
              </div>
              {Q2_OPTIONS.map((opt) => {
                const on = q2 === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setQ2(opt.id)}
                    aria-pressed={on}
                    className={cn(
                      CARD,
                      "flex w-full items-start gap-3 p-3.5 text-left transition hover:bg-hover",
                      on && "ring-1 ring-primary/40"
                    )}
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span
                        className={cn(
                          "text-sm font-medium",
                          on ? "text-primary" : "text-foreground"
                        )}
                      >
                        {opt.label}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {opt.detail}
                      </span>
                    </span>
                    {on && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          )}

          {stage === "holdings" && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Add what you own
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  The ticker, how many shares, and roughly what you paid. One
                  is enough to make Home worth opening. If you have a lot of
                  them, skip this — Home has a CSV import that takes the whole
                  lot at once.
                </p>
              </div>
              {added.length > 0 && (
                <ItemGroup className="gap-0 has-data-[size=sm]:gap-0">
                  {added.map((row) => (
                    <Item key={row.ticker} size="sm" className="px-0">
                      <ItemContent>
                        <ItemTitle>
                          <TickerSymbol ticker={row.ticker} />
                        </ItemTitle>
                      </ItemContent>
                      <ItemActions>
                        <span className="tabular-nums text-muted-foreground">
                          {row.shares} @ {row.buyPrice}
                        </span>
                      </ItemActions>
                    </Item>
                  ))}
                </ItemGroup>
              )}
              <Field>
                <FieldLabel htmlFor="onboard-ticker">Ticker or company</FieldLabel>
                <div className="relative">
                  <Input
                    id="onboard-ticker"
                    ref={tickerRef}
                    value={ticker}
                    onChange={(e) => {
                      setTicker(sanitizeTickerQuery(e.target.value));
                      setListOpen(true);
                      setStockError(null);
                    }}
                    onFocus={() => {
                      if (ticker.trim()) setListOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && suggestions[0] && listOpen) {
                        e.preventDefault();
                        setTicker(suggestions[0]!.symbol);
                        setListOpen(false);
                      }
                    }}
                    placeholder="Apple, NVDA, or SPY5"
                    autoComplete="off"
                  />
                  {listOpen && suggestions.length > 0 && (
                    <ul className={SUGGEST_MENU}>
                      {suggestions.map((row) => (
                        <li key={row.symbol}>
                          <button
                            type="button"
                            className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm text-foreground hover:bg-hover"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setTicker(row.symbol);
                              setListOpen(false);
                            }}
                          >
                            <TickerSymbol
                              ticker={row.symbol}
                              showCurrency={listingCurrency(row.symbol) !== "USD"}
                            />
                            {row.name && (
                              <span className="truncate text-muted-foreground">
                                {row.name}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <FieldDescription>
                  Type the ticker or the company. Average buy in this
                  listing&apos;s money
                  {buyCode !== "USD" ? ` (${buyCode})` : ""}.
                </FieldDescription>
              </Field>
              <div className="flex gap-6">
                <Field className="min-w-0 flex-1">
                  <FieldLabel htmlFor="onboard-shares">Shares</FieldLabel>
                  <Input
                    id="onboard-shares"
                    type="text"
                    inputMode="decimal"
                    value={shares}
                    onChange={(e) => {
                      setShares(
                        e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "")
                      );
                      setStockError(null);
                    }}
                    onWheel={blockWheelChange}
                    className="tabular-nums"
                  />
                </Field>
                <Field className="min-w-0 flex-1">
                  <FieldLabel htmlFor="onboard-buy">
                    Average buy{buyCode !== "USD" ? ` (${buyCode})` : ""}
                  </FieldLabel>
                  <Input
                    id="onboard-buy"
                    type="text"
                    inputMode="decimal"
                    value={buyPrice}
                    onChange={(e) => {
                      setBuyPrice(
                        e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "")
                      );
                      setStockError(null);
                    }}
                    onWheel={blockWheelChange}
                    className="tabular-nums"
                  />
                </Field>
              </div>
              {stockError && (
                <p className="text-sm text-destructive">{stockError}</p>
              )}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={stockBusy}
                onClick={() => void addHolding()}
              >
                {stockBusy ? "Saving…" : added.length ? "Add another" : "Add holding"}
              </Button>
            </div>
          )}

          {stage === "watchlist" && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Names you are watching
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ones you do not own but are curious about. Pulse keeps an eye
                  on them too, and the Sunday email can bring them up. Skip if
                  you have none in mind.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {popular.map((t) => {
                  const on = watching.includes(t);
                  return (
                    <Button
                      key={t}
                      type="button"
                      size="sm"
                      variant={on ? "default" : "outline"}
                      onClick={() => toggleWatch(t)}
                    >
                      {t}
                    </Button>
                  );
                })}
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void addWatchDraft();
                }}
              >
                <Input
                  value={watchDraft}
                  onChange={(e) =>
                    setWatchDraft(sanitizeTickerQuery(e.target.value))
                  }
                  placeholder="Apple or NVDA"
                  autoComplete="off"
                />
                <Button type="submit" variant="outline">
                  Add
                </Button>
              </form>
              {watching.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {watching.map((t) => (
                    <li key={t}>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => toggleWatch(t)}
                      >
                        {t}
                        <X data-icon="inline-end" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {stage === "email" && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Want the Sunday email?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  One email a week and nothing else — there is no daily note,
                  no alert, and no &ldquo;come back&rdquo;. It starts once
                  there are names in a portfolio, and it is one switch in
                  Account either way.
                </p>
              </div>
              <FieldGroup>
                <Field orientation="horizontal">
                  <Checkbox
                    id="note-sunday"
                    checked={noteSunday}
                    onCheckedChange={(v) => setNoteSunday(v === true)}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="note-sunday">
                      Send me the Sunday email
                    </FieldLabel>
                    <FieldDescription>
                      How your week went, what looks worth a second look, and
                      what to think about for the week ahead.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              </FieldGroup>
            </div>
          )}

          {stage === "done" && (
            <div className="flex flex-col gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-foreground">
                <Check className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  That is the whole app
                  {tierLabel ? `. Showing you the ${tierLabel} view` : ""}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Home is where you land. The bar along the bottom is
                  everything else, and Account holds every switch this
                  walkthrough set.
                </p>
              </div>
              <ul className="flex flex-col gap-2">
                <Row icon={LayoutDashboard} term="If you skipped the holdings">
                  Home has <strong className="text-foreground">Add holding</strong>{" "}
                  and a CSV import. Nothing else in the app has much to say
                  until something is in there.
                </Row>
                <Row icon={MessageCircle} term="If you get stuck">
                  Ask Margus. It knows what is in your portfolio and answers in
                  plain language.
                </Row>
                <Row icon={UserCog} term="If you want this again">
                  Account &rsaquo; Help has a button that replays this
                  walkthrough.
                </Row>
              </ul>
            </div>
          )}
        </div>

        {/*
          One footer, the same on every screen.

          Back on the left where it is ignorable, the way forward on the right
          where the thumb is, and the escape hatch as the quietest thing on
          the row rather than a thing to hunt for. Nothing here moves between
          steps except the words.
        */}
        <div className="mt-5 flex shrink-0 items-center justify-between gap-3 border-t border-border pt-4">
          {index > 0 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => go(-1)}
              disabled={saving}
            >
              Back
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => void skipOut()}
              disabled={saving}
            >
              Skip the tour
            </Button>
          )}

          {stage === "done" ? (
            <Button
              type="button"
              onClick={() => {
                requestBookRefresh();
                onDone({
                  tier: finished?.tier ?? initialTier,
                  knowsOptions: finished?.knowsOptions ?? initialKnowsOptions,
                  skipped: false,
                });
              }}
            >
              Open my portfolio
            </Button>
          ) : (
            <Button type="button" onClick={onNext} disabled={nextDisabled}>
              {nextLabel}
            </Button>
          )}
        </div>
      </div>
    </ViewportOverlay>
  );
}
