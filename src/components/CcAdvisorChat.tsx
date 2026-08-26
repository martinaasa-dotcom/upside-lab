"use client";

import { track } from "@vercel/analytics";
import { htmlCell, htmlTable } from "@/components/FluidTable";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { humanizeMargusText } from "@/lib/ai/humanize-copy";
import type { CcChatContext } from "@/lib/ai/cc-advisor";
import {
  isGenericScreenshotFail,
  isScreenshotIssueReason,
  screenshotImportFallbackCopy,
  screenshotIssueCopy,
  type ScreenshotIssueCopy,
} from "@/lib/screenshot-import-copy";
import { STRATEGY } from "@/lib/calculations";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import {
  collectAppliedToolIds,
  loadChatHistory,
  saveChatHistory,
} from "@/lib/chat-history";
import {
  clipboardImagesToParts,
  fileToImagePart,
} from "@/lib/chat-images";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart } from "ai";
import {
  BookOpen,
  ImagePlus,
  Loader2,
  Maximize2,
  Minimize2,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useBottomCorner } from "@/lib/use-dock-pad";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type AdvisorAction =
  | { action: "set_call_pct"; ticker: string; callPct: number }
  | {
      action: "set_call_pct_bulk";
      updates: Array<{ ticker: string; callPct: number }>;
    }
  | { action: "set_uniform_call_pct"; callPct: number }
  | {
      action: "update_holding";
      ticker: string;
      shares: number | null;
      buyPrice: number | null;
    }
  | { action: "set_cash"; cash: number }
  | {
      action: "add_holding";
      ticker: string;
      shares: number;
      buyPrice: number;
      callPct: number;
    }
  | {
      action: "import_portfolio";
      cash: number | null;
      replace?: boolean;
      holdings: Array<{
        ticker: string;
        shares: number;
        buyPrice: number;
        callPct: number;
      }>;
    }
  | { action: "remove_holding"; ticker: string }
  | { action: "set_stock_target"; ticker: string; stockTarget: number }
  | {
      action: "set_stock_target_bulk";
      updates: Array<{ ticker: string; stockTarget: number }>;
    }
  | { action: "clear_stock_target"; ticker: string }
  | { action: "propose_write_plan"; plans: unknown[]; message: string }
  | {
      action: "apply_write_plan";
      updates: Array<{
        ticker: string;
        stockTarget: number;
        callPct: number;
      }>;
    };

/** A screenshot picked from a holdings empty-state tap, not from this panel. */
export type SilentScreenshotImport = {
  id: number;
  portfolioId: string;
  files: File[];
};

type Props = {
  /** Active portfolio — chat history is scoped to this id. */
  portfolioId: string;
  context: CcChatContext;
  onApplyActions: (actions: AdvisorAction[]) => void;
  /** Bump to open the floating Margus panel (empty-state / drawer CTAs). */
  expandSignal?: number;
  /**
   * Files chosen from a user tap on Import screenshot. The picker itself
   * lives on the dashboard so a remount of this panel cannot open it.
   * Sending happens here; the dashboard only hands the files across.
   */
  screenshotImport?: SilentScreenshotImport | null;
  onScreenshotImportConsumed?: () => void;
  /** When a screenshot import fails, offer the CSV path instead. */
  onSuggestCsv?: () => void;
};

/** Default instruction sent with a screenshot import — same for both the
 * silent (picker) and interactive (typed-in-chat) paths. Phrased as a
 * standing command rather than relying purely on the API's tool_choice
 * param — some providers in the fallback chain don't reliably honor a
 * forced tool choice and will just describe the image in prose instead,
 * so the prompt itself has to make "call the tool, don't just narrate"
 * unambiguous. */
const DEFAULT_SCREENSHOT_PROMPT =
  "Read this screenshot carefully, then take action. Do not just describe it. If it is a broker holdings page or spreadsheet with ticker plus how many shares plus what they paid (avg buy) or the position value: call addHolding for a single ticker, or importPortfolio for every row. If it is NOT that (Apple Stocks, a watchlist, prices and daily change only, news, a chart, cropped, or no share counts), do not guess numbers. Call reportScreenshotIssue with the closest reason and stop. You must call one of these tools before replying.";

type ToolPart = {
  type: string;
  toolCallId?: string;
  state?: string;
  output?: unknown;
};

function extractText(parts: Array<{ type: string; text?: string }>) {
  return humanizeMargusText(
    parts
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text)
      .join("")
  );
}

function extractImages(
  parts: Array<{ type: string; url?: string; mediaType?: string }>
): Array<{ url: string; mediaType: string }> {
  return parts
    .filter(
      (p) =>
        p.type === "file" &&
        typeof p.url === "string" &&
        typeof p.mediaType === "string" &&
        p.mediaType.startsWith("image/")
    )
    .map((p) => ({ url: p.url!, mediaType: p.mediaType! }));
}

function partsHaveImages(
  parts: Array<{ type: string; mediaType?: string }> | undefined
): boolean {
  return (parts ?? []).some(
    (p) =>
      p.type === "file" &&
      typeof p.mediaType === "string" &&
      p.mediaType.startsWith("image/")
  );
}

function screenshotIssueFromParts(
  parts: ToolPart[]
): ScreenshotIssueCopy | null {
  for (const part of parts) {
    if (part.state !== "output-available") continue;
    const out = part.output as
      | {
          action?: string;
          reason?: string;
          title?: string;
          lines?: string[];
          message?: string;
        }
      | undefined;
    if (out?.action !== "report_screenshot_issue") continue;
    if (out.reason && isScreenshotIssueReason(out.reason)) {
      return screenshotIssueCopy(out.reason);
    }
    if (Array.isArray(out.lines) && out.lines.length > 0) {
      return {
        title: out.title || screenshotImportFallbackCopy().title,
        lines: out.lines,
      };
    }
    if (typeof out.message === "string" && out.message.trim()) {
      return {
        title: out.title || screenshotImportFallbackCopy().title,
        lines: out.message.split("\n").filter(Boolean),
      };
    }
    return screenshotImportFallbackCopy();
  }
  return null;
}

/**
 * Shared with the silent-import status card so the two surfaces never
 * disagree on what a given error means.
 *
 * The server's describeAdvisorError already returns a sentence written
 * for whoever is holding the phone, so the job here is mostly to get out
 * of its way. This used to re-classify everything itself and told real
 * users to "add another free provider key in .env.local", which is
 * advice for someone running the app locally, not for Liina on 4G.
 * Only genuinely client-side failures get rewritten now.
 */
function isQuietChatFailure(message: string): boolean {
  return /couldn't get a reply|overloaded|unavailable|timed out|timeout|rate.?limit|quota|too many requests|backup on your next/i.test(
    message
  );
}

function describeChatUiError(message: string): string {
  if (/network|fetch|Failed to fetch|Load failed|aborted/i.test(message)) {
    return "The connection dropped before Margus finished. Check your signal and try again.";
  }
  if (isQuietChatFailure(message)) {
    return "Didn't land that time. Send it again.";
  }
  return "Couldn't get a reply just then. Send it again.";
}

function isMdSepCell(cell: string): boolean {
  return /^:?-{3,}:?$/.test(cell.trim());
}

/**
 * Rebuild a single jammed pipe line into a real GFM table.
 * Avoids half-matching `| --- |` out of `| --- | --- | --- |` (that left a tiny 1-col box).
 *
 * Small tables (2–3 columns, 1 data row) were previously missed because the
 * old gate required 8+ pipes — a jammed 2-column table (`| h1 | h2 | --- |
 * --- | r1 | r2 |`) only has 7. The gate is now just a cheap "could this
 * possibly be one" pre-check; the real safety net is requiring at least one
 * non-empty data cell after the separator, so a lone data row that happens
 * to use literal `---` placeholder cells is never mistaken for a jammed
 * header+separator (which would otherwise swallow that row with no body).
 */
function expandJammedTableLine(line: string): string {
  const pipeCount = (line.match(/\|/g) ?? []).length;
  if (pipeCount < 6 || !/-{3,}/.test(line)) return line;

  const raw = line.split("|").map((s) => s.trim());
  if (raw[0] === "") raw.shift();
  if (raw.length && raw[raw.length - 1] === "") raw.pop();
  const parts = raw;

  const sepStart = parts.findIndex(isMdSepCell);
  if (sepStart < 0) return line;

  let sepCount = 0;
  for (let i = sepStart; i < parts.length && isMdSepCell(parts[i]); i++) {
    sepCount++;
  }
  if (sepCount < 2) return line;

  const header = parts.slice(0, sepStart);
  const body = parts.slice(sepStart + sepCount);
  if (!body.some((c) => c.length > 0)) return line;

  const cols = Math.max(sepCount, header.length, 2);

  const pad = (row: string[]) => {
    const next = row.slice(0, cols);
    while (next.length < cols) next.push("");
    return next;
  };

  const rows: string[][] = [];
  if (header.some((c) => c.length > 0)) rows.push(pad(header));
  rows.push(Array.from({ length: cols }, () => "---"));
  for (let i = 0; i < body.length; i += cols) {
    const slice = body.slice(i, i + cols);
    if (slice.every((c) => c === "")) continue;
    rows.push(pad(slice));
  }

  if (rows.length < 2) return line;
  return rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
}

/** Fix jammed GFM tables + other common free-model markdown breakage. */
function normalizeMargusMarkdown(src: string): string {
  let text = src.replace(/\r\n/g, "\n");

  // Some models escape line breaks as literal backslash-n instead of real
  // newlines, producing an unreadable wall of text. Only fire when there
  // are barely any real newlines but several literal ones, so we never
  // touch normal prose that happens to mention "\n".
  const realNewlines = (text.match(/\n/g) ?? []).length;
  const literalNewlines = (text.match(/\\n/g) ?? []).length;
  if (literalNewlines >= 2 && realNewlines <= 1) {
    text = text.replace(/\\n/g, "\n");
  }

  text = text
    .split("\n")
    .map((line) => expandJammedTableLine(line))
    .join("\n");

  // Drop truly orphaned separator crumbs (bad model output / old normalizer)
  // — but NOT a separator row that legitimately follows a header row, which
  // is required GFM syntax. A blanket regex here was deleting the separator
  // line `expandJammedTableLine` had just generated, leaving a header +
  // data rows with no delimiter in between — remark-gfm then refuses to
  // parse it as a table at all, so it fell back to showing raw `| a | b |`
  // text. Only strip a separator-only line when the line above it has no
  // pipes at all (i.e. it can't be a header row).
  const lines = text.split("\n");
  text = lines
    .filter((line, i) => {
      const sepOnly = /^\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line.trim());
      if (!sepOnly) return true;
      const prev = lines[i - 1] ?? "";
      return prev.includes("|");
    })
    .join("\n");

  // Headers jammed mid-paragraph instead of starting their own line.
  text = text.replace(/([^\n])\n?(#{1,6} [A-Za-z])/g, "$1\n\n$2");

  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function ChatMarkdown({ children }: { children: string }) {
  const md = normalizeMargusMarkdown(children);
  return (
    <div className="w-full min-w-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children: c }) => (
            <h3 className="mb-1.5 mt-3 text-base font-semibold text-foreground first:mt-0">
              {c}
            </h3>
          ),
          h2: ({ children: c }) => (
            <h3 className="mb-1.5 mt-3 text-base font-semibold text-foreground first:mt-0">
              {c}
            </h3>
          ),
          h3: ({ children: c }) => (
            <h4 className="mb-1 mt-2.5 font-semibold text-foreground first:mt-0">
              {c}
            </h4>
          ),
          p: ({ children: c }) => (
            <p className="mb-2.5 break-words text-base leading-relaxed text-foreground last:mb-0">
              {c}
            </p>
          ),
          ul: ({ children: c }) => (
            <ul className="mb-2.5 list-disc pl-4 text-base text-foreground last:mb-0 [&>li+li]:mt-1.5">
              {c}
            </ul>
          ),
          ol: ({ children: c }) => (
            <ol className="mb-2.5 list-decimal pl-4 text-base text-foreground last:mb-0 [&>li+li]:mt-1.5">
              {c}
            </ol>
          ),
          li: ({ children: c }) => (
            <li className="break-words leading-relaxed marker:text-muted-foreground">{c}</li>
          ),
          strong: ({ children: c }) => (
            <strong className="font-semibold text-foreground">{c}</strong>
          ),
          em: ({ children: c }) => (
            <em className="italic text-muted-foreground">{c}</em>
          ),
          a: ({ href, children: c }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-2 hover:text-foreground"
            >
              {c}
            </a>
          ),
          code: ({ children: c, className }) => {
            const block = Boolean(className);
            if (block) {
              return (
                <code className="block w-full overflow-x-auto rounded-md bg-muted px-2 py-1.5 font-mono text-sm text-foreground">
                  {c}
                </code>
              );
            }
            return (
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm text-muted-foreground">
                {c}
              </code>
            );
          },
          pre: ({ children: c }) => (
            <pre className="mb-2.5 w-full overflow-x-auto rounded-md border border-border bg-muted p-2 last:mb-0">
              {c}
            </pre>
          ),
          table: ({ children: c }) => (
            <div className="mb-3 w-full min-w-0 overflow-x-auto last:mb-0">
              <table className={htmlTable}>
                {c}
              </table>
            </div>
          ),
          thead: ({ children: c }) => (
            <thead className="border-b border-border text-sm text-muted-foreground">
              {c}
            </thead>
          ),
          tbody: ({ children: c }) => (
            <tbody className="text-foreground">{c}</tbody>
          ),
          tr: ({ children: c }) => (
            <tr className="border-t border-border first:border-t-0">{c}</tr>
          ),
          th: ({ children: c }) => (
            <th className={`${htmlCell} whitespace-nowrap font-medium`}>
              {c}
            </th>
          ),
          td: ({ children: c }) => (
            <td className={`${htmlCell} break-words tabular-nums text-foreground`}>
              {c}
            </td>
          ),
          hr: () => <hr className="my-3 border-border" />,
          blockquote: ({ children: c }) => (
            <blockquote className="mb-2.5 break-words border-l-2 border-border pl-3 text-base text-muted-foreground last:mb-0">
              {c}
            </blockquote>
          ),
        }}
      >
        {md}
      </ReactMarkdown>
    </div>
  );
}

const WIDE_KEY = "upside-margus-wide";

function loadWidePref(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(WIDE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveWidePref(wide: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WIDE_KEY, wide ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

const ACTION_TYPES = new Set([
  "tool-setCallPct",
  "tool-setCallPctBulk",
  "tool-setUniformCallPct",
  "tool-updateHolding",
  "tool-setCash",
  "tool-addHolding",
  "tool-importPortfolio",
  // Legacy name, kept so chat history saved before the rename still shows
  // its import summary instead of a bare tool blob.
  "tool-importSheet",
  "tool-removeHolding",
  "tool-setStockTarget",
  "tool-setStockTargetBulk",
  "tool-clearStockTarget",
  "tool-proposeWritePlan",
  "tool-applyWritePlan",
]);

const RULES = [
  {
    title: "Table meaning",
    rule: "Stock Target ≠ strike",
    detail:
      "Stock Target = write level. Call % = buffer above that. Next Strike = Target × (1+Call%). Distance = Spot to Target, not the strike gap. Premium uses Next Strike.",
  },
  {
    title: "Market condition",
    rule: "Intraday green rebound",
    detail: "Prefer selling calls when the name is green. Avoid dumping strikes on red days.",
  },
  {
    title: "Contract duration",
    rule: `${STRATEGY.minDaysPreferred} to ${STRATEGY.maxDaysPreferred} days (about 2 to 3 weeks)`,
    detail: `Can extend up to ~${STRATEGY.maxDaysExtended}d when earnings forces a longer dated.`,
  },
  {
    title: "Call %",
    rule: "Scaled to each ticker's own volatility",
    detail: `Roughly ${(STRATEGY.callPctSafeMin * 100).toFixed(0)} to ${(STRATEGY.callPctSafeMax * 100).toFixed(0)}% for calmer names up to ${(STRATEGY.callPctHighBeta * 100).toFixed(0)}%+ for jumpy ones, nudged for earnings / distance. Never one flat "safety" % for the whole book.`,
  },
  {
    title: "Earnings",
    rule: "Prefer expire before earnings",
    detail: "If no clean pre-earnings 2 to 3 week expiry, go past earnings and widen Call %.",
  },
  {
    title: "Yield",
    rule: `Target ~${(STRATEGY.targetYield * 100).toFixed(0)}% (floor ${(STRATEGY.minYield * 100).toFixed(0)}%)`,
    detail: "Margus estimates from live option mid/spot for the chosen Next Strike & expiry when available.",
  },
  {
    title: "Execution window",
    rule: STRATEGY.executionWindow,
    detail: "Skip the first ~15 min after the US open; fill when spreads are tighter.",
  },
  {
    title: "What Margus can change",
    rule: "Shares, cash, Call %, Stock Target, portfolio imports, write plans",
    detail:
      "Paste a spreadsheet screenshot and Margus should import every row via importPortfolio. Critique uses your table values.",
  },
] as const;

export function CcAdvisorChat({
  portfolioId,
  context,
  onApplyActions,
  expandSignal = 0,
  screenshotImport = null,
  onScreenshotImportConsumed,
  onSuggestCsv,
}: Props) {
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState<FileUIPart[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(false);
  // Screenshot imports from the holdings empty-state never open the chat
  // panel. They send immediately and report progress through this small
  // status card instead. "sending" while in flight, "result" once settled
  // (kept on screen briefly for ok/info, until dismissed for errors).
  const [silentPhase, setSilentPhase] = useState<"idle" | "sending" | "result">(
    "idle"
  );
  const [silentSummary, setSilentSummary] = useState<{
    kind: "ok" | "info" | "empty" | "error";
    title?: string;
    lines: string[];
  } | null>(null);
  const awaitingSilentSettleRef = useRef(false);
  const seenExpandSignal = useRef(expandSignal);

  useLayoutEffect(() => {
    setWide(loadWidePref());
  }, []);

  function toggleWide() {
    setWide((prev) => {
      const next = !prev;
      saveWidePref(next);
      return next;
    });
  }
  const initialMessages = useMemo(
    () => loadChatHistory(portfolioId),
    [portfolioId]
  );
  const appliedIds = useRef(collectAppliedToolIds(initialMessages));
  const contextRef = useRef(context);
  contextRef.current = context;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const rulesRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /* Tells the bottom notices that this corner is taken. See the note on
     the element that carries it. */
  const [cornerEl, setCornerEl] = useState<HTMLDivElement | null>(null);
  useBottomCorner(cornerEl);

  useEffect(() => {
    // Only open on a fresh bump, never on mount. This panel remounts
    // whenever the active portfolio changes (`key={portfolioId}`), and a
    // leftover signal used to reopen it (and, with it, the file input).
    if (expandSignal === seenExpandSignal.current) return;
    seenExpandSignal.current = expandSignal;
    if (expandSignal) setOpen(true);
  }, [expandSignal]);

  // Close on Escape when the panel is open (rules popover handles its own Esc).
  useEffect(() => {
    if (!open || rulesOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, rulesOpen]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, id, trigger, messageId }) => ({
          body: {
            messages,
            id,
            trigger,
            messageId,
            ccContext: contextRef.current,
          },
        }),
      }),
    []
  );

  const { messages, sendMessage, status, error, clearError, stop, regenerate } = useChat({
    id: `margus-${portfolioId}`,
    messages: initialMessages,
    transport,
  });

  const chatRetryRef = useRef(false);
  useEffect(() => {
    if (!error) return;
    if (chatRetryRef.current) return;
    if (!isQuietChatFailure(error.message)) return;
    if (awaitingSilentSettleRef.current) return;
    chatRetryRef.current = true;
    clearError();
    void regenerate();
  }, [error, clearError, regenerate]);

  useEffect(() => {
    saveChatHistory(portfolioId, messages);
  }, [portfolioId, messages]);

  const busy = status === "submitted" || status === "streaming";
  const last = messages[messages.length - 1];
  const lastIsEmptyAssistant =
    !busy &&
    last?.role === "assistant" &&
    !extractText(last.parts as Array<{ type: string; text?: string }>) &&
    !(last.parts as ToolPart[]).some(
      (p) =>
        p.state === "output-available" &&
        typeof (p.output as { message?: string })?.message === "string"
    );
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const screenshotTurn = partsHaveImages(
    lastUser?.parts as Array<{ type: string; mediaType?: string }> | undefined
  );
  const screenshotFailCopy = screenshotImportFallbackCopy();

  // Capture the result of a silent screenshot import for the status card
  // once the request settles — one-shot per send via the ref guard.
  useEffect(() => {
    if (!awaitingSilentSettleRef.current || busy) return;
    awaitingSilentSettleRef.current = false;

    const fallback = screenshotImportFallbackCopy();

    if (error) {
      const network = /network|fetch|Failed to fetch|Load failed|aborted/i.test(
        error.message
      );
      setSilentSummary(
        network
          ? { kind: "error", lines: [describeChatUiError(error.message)] }
          : { kind: "empty", title: fallback.title, lines: fallback.lines }
      );
      setSilentPhase("result");
      return;
    }

    if (!last || last.role !== "assistant") {
      setSilentSummary({
        kind: "empty",
        title: fallback.title,
        lines: fallback.lines,
      });
      setSilentPhase("result");
      return;
    }

    const parts = last.parts as ToolPart[];
    const issue = screenshotIssueFromParts(parts);
    if (issue) {
      setSilentSummary({
        kind: "empty",
        title: issue.title,
        lines: issue.lines,
      });
      setSilentPhase("result");
      return;
    }

    const toolNotes = parts
      .filter(
        (p) =>
          p.state === "output-available" &&
          typeof (p.output as { message?: string })?.message === "string"
      )
      .map((p) => (p.output as { message: string }).message);
    const text = extractText(
      last.parts as Array<{ type: string; text?: string }>
    );

    if (toolNotes.length > 0) {
      setSilentSummary({ kind: "ok", lines: toolNotes });
    } else if (text && !isGenericScreenshotFail(text)) {
      // A screenshot import always asks for a forced tool call — text with
      // no tool call means nothing was actually saved, even though the
      // model answered normally (some providers in the fallback chain
      // don't reliably honor a forced tool choice and just narrate the
      // image instead). Flag it like "empty" so it reads as "this didn't
      // work" rather than a neutral update, while still showing what
      // Margus actually said.
      setSilentSummary({
        kind: "empty",
        title: fallback.title,
        lines: [text, ...fallback.lines.slice(1)],
      });
    } else {
      setSilentSummary({
        kind: "empty",
        title: fallback.title,
        lines: fallback.lines,
      });
    }
    setSilentPhase("result");
  }, [busy, error, last]);

  // Auto-dismiss success quickly. Failed imports stay until they tap away
  // so they can actually read what was missing.
  useEffect(() => {
    if (silentPhase !== "result" || !silentSummary) return;
    if (silentSummary.kind === "error" || silentSummary.kind === "empty") {
      return;
    }
    const t = window.setTimeout(() => {
      setSilentPhase("idle");
      setSilentSummary(null);
    }, 7000);
    return () => window.clearTimeout(t);
  }, [silentPhase, silentSummary]);

  useEffect(() => {
    const actions: AdvisorAction[] = [];

    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts as ToolPart[]) {
        if (!part.toolCallId || part.state !== "output-available") continue;
        if (appliedIds.current.has(part.toolCallId)) continue;
        if (!ACTION_TYPES.has(part.type)) continue;

        const output = part.output as AdvisorAction | undefined;
        if (!output?.action) continue;
        // Analysis-only — no portfolio mutation
        if (output.action === "propose_write_plan") {
          appliedIds.current.add(part.toolCallId);
          continue;
        }

        appliedIds.current.add(part.toolCallId);
        actions.push(output);
      }
    }

    if (actions.length) onApplyActions(actions);
  }, [messages, onApplyActions]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    if (!rulesOpen) return;
    function onDocClick(e: MouseEvent) {
      if (rulesRef.current && !rulesRef.current.contains(e.target as Node)) {
        setRulesOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setRulesOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [rulesOpen]);

  async function addImageFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    try {
      const parts = await Promise.all(list.map(fileToImagePart));
      setPendingImages((prev) => [...prev, ...parts].slice(0, 6));
    } catch (err) {
      console.error(err);
    }
  }

  async function onPaste(e: React.ClipboardEvent) {
    const parts = await clipboardImagesToParts(e.clipboardData?.items);
    if (!parts.length) return;
    e.preventDefault();
    setPendingImages((prev) => [...prev, ...parts].slice(0, 6));
  }

  async function handleSilentFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length || busy) return;
    clearError();
    setSilentSummary(null);
    setSilentPhase("sending");
    awaitingSilentSettleRef.current = true;
    try {
      const parts = await Promise.all(list.map(fileToImagePart));
      track("margus_message", {
        has_image: true,
        guest: context.adviseOnly,
        silent: true,
      });
      await sendMessage({ text: DEFAULT_SCREENSHOT_PROMPT, files: parts });
    } catch (err) {
      awaitingSilentSettleRef.current = false;
      setSilentSummary({
        kind: "error",
        lines: [err instanceof Error ? err.message : "Couldn't read that image."],
      });
      setSilentPhase("result");
    }
  }

  useEffect(() => {
    if (!screenshotImport) return;
    if (screenshotImport.portfolioId !== portfolioId) return;
    if (busy) return;
    const files = screenshotImport.files;
    onScreenshotImportConsumed?.();
    void handleSilentFiles(files);
    // handleSilentFiles is render-local; screenshotImport.id is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenshotImport, portfolioId, busy]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (busy) return;
    if (!text && pendingImages.length === 0) return;
    setInput("");
    const files = pendingImages;
    setPendingImages([]);
    clearError();
    chatRetryRef.current = false;
    track("margus_message", {
      has_image: files.length > 0,
      guest: context.adviseOnly,
    });
    await sendMessage({
      text: text || DEFAULT_SCREENSHOT_PROMPT,
      files: files.length ? files : undefined,
    });
  }

  // Openers a first-time reader can actually use. Deliberately plain
  // questions about what they already own, not power-user shortcuts: the
  // old defaults led with the covered-call write plan, which is a blank
  // stare for the large majority of people who never sell a call. The
  // covered-call openers now surface only once there is real CC data to
  // talk about, and they never take the whole row.
  const suggestions = useMemo(() => {
    if (context.holdings.length === 0) {
      return [
        "How do I get my holdings in here?",
        "What can you help me with?",
        "Explain how this portfolio page works",
      ];
    }
    const plain = [
      "What moved today, and why?",
      "Explain my biggest holding in plain English",
      "Am I too heavy in any one company?",
      "What should I keep an eye on this week?",
      "What’s up most since I bought it?",
    ];
    if (context.hideOptions || context.rows.length === 0) return plain.slice(0, 4);
    return [...plain.slice(0, 3), "Give me the updated covered-call plan"];
  }, [context.hideOptions, context.holdings.length, context.rows.length]);

  const canSend = !busy && (Boolean(input.trim()) || pendingImages.length > 0);
  // Suppressed while the full panel is open — that already shows the same
  // message live, so the compact card would just be a redundant echo.
  const showSilentCard = silentPhase !== "idle" && !open;

  return (
    // z-40 is deliberate and load-bearing. Above the sticky mobile bottom
    // nav (z-30) so Margus still floats over the page, but below every
    // modal overlay (z-50 and up) so he can't sit on top of one. At z-60
    // this button covered the confirm action of any bottom-anchored mobile
    // modal, which on a phone is exactly where both of them live: Add
    // holding, Cash, Rename sheet, Delete account, and every ConfirmModal.
    <div
      /*
       * Claims the bottom-right corner while this is actually drawn, so a
       * notice anchored there clears the button instead of landing on it.
       * See `useBottomCorner` and `.bottom-notice`. It has to be measured
       * rather than assumed from the route: `WorkspaceShell` keeps the
       * portfolio room mounted behind whatever room you are in, so the
       * button is in the DOM long after it has left the screen.
       */
      ref={setCornerEl}
      className={
        open
          ? "pointer-events-none fixed z-40 flex flex-col items-end justify-end gap-3 p-3"
          : // `lg:bottom-8` is gone on purpose. The bottom dock is
            // `fixed inset-x-0 bottom-0` at every width, so a flat 2rem
            // offset put this button *underneath* it on desktop: the dock
            // painted over it, and because the dock is translucent with a
            // 24px backdrop blur, the button's warm fill bled through as a
            // soft yellow haze in the corner. It also meant clicks in that
            // corner hit the dock, so Margus was unreachable on desktop.
            // Both were hidden while the dock was near-opaque.
            //
            // `--dock-pad` is the live measured dock height (`useDockPad`),
            // which is exactly the clearance this needs, and the non-`lg`
            // value was already using it. Dropping the override lets every
            // width clear the dock the same way.
            "keyboard-chrome pointer-events-none fixed bottom-[max(1rem,calc(var(--dock-pad,1rem)+0.75rem))] right-[max(1rem,env(safe-area-inset-right))] z-40 flex flex-col items-end gap-3 lg:right-8"
      }
      style={
        open
          ? {
              top: "var(--vv-top, 0px)",
              left: "var(--vv-left, 0px)",
              width: "var(--vv-width, 100%)",
              height: "var(--vv-height, 100%)",
            }
          : undefined
      }
    >
      {showSilentCard && (
        <div
          role="status"
          /* Over the page in the same corner as the panel, so the same
           * material: see the note on the panel below. */
          className="pointer-events-auto w-[min(22rem,calc(100vw-1.5rem))] cursor-pointer overflow-hidden rounded-xl glass-overlay ring-1 ring-foreground/20"
          onClick={() => setOpen(true)}
        >
          <div className="flex items-start gap-2.5 px-3.5 py-3">
            <div className="mt-0.5 rounded-lg bg-muted p-1.5 text-primary">
              {silentPhase === "sending" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : silentSummary?.kind === "error" ||
                silentSummary?.kind === "empty" ? (
                <ImagePlus className="h-3.5 w-3.5 text-caution" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                {silentPhase === "sending"
                  ? "Margus is reading your screenshot …"
                  : silentSummary?.kind === "error"
                    ? "Import failed"
                    : silentSummary?.kind === "empty"
                      ? (silentSummary.title ?? "Couldn't import that screenshot")
                      : "Margus"}
              </p>
              {silentPhase === "sending" ? (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Usually takes a few seconds.
                </p>
              ) : (
                <div className="flex flex-col mt-0.5 gap-1.5">
                  {silentSummary?.lines.map((line, i) => (
                    <p
                      key={i}
                      className={`text-sm leading-relaxed ${
                        silentSummary.kind === "error"
                          ? "text-loss"
                          : silentSummary.kind === "empty" && i === 0
                            ? "text-caution"
                            : silentSummary.kind === "empty"
                              ? "text-muted-foreground"
                              : "text-muted-foreground"
                      }`}
                    >
                      {line}
                    </p>
                  ))}
                </div>
              )}
              {silentPhase === "result" &&
                onSuggestCsv &&
                (silentSummary?.kind === "error" ||
                  silentSummary?.kind === "empty") && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSilentPhase("idle");
                      setSilentSummary(null);
                      onSuggestCsv();
                    }}
                  >
                    Upload a CSV instead
                  </Button>
                )}
              {silentPhase === "result" && (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Tap to open chat
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSilentPhase("idle");
                setSilentSummary(null);
              }}
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-hover hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {open && (
        /*
         * `glass-overlay`, not `glass`.
         *
         * This panel is pinned over the page rather than laid out in it:
         * on a phone it covers the forecast chart and the holdings table,
         * and even on desktop the corner panel sits on top of a table of
         * figures. `glass` is the card material, a 2% white veil at a 6px
         * blur, built to sit over the ambient field and let the black
         * through -- so what came through here was the page, and the two
         * sets of words interleaved. Every other surface that sits over
         * content already takes the heavy fill: Dialog, Sheet, Drawer,
         * Popover, Select, the welcome tour, the cookie banner.
         * DESIGN_TOKENS.md draws the line, and hiding what is beneath is
         * the whole job of a surface like this one.
         */
        <section
          ref={panelRef}
          className={`pointer-events-auto flex flex-col overflow-hidden rounded-xl glass-overlay ring-1 ring-foreground/20 transition-[width,height] duration-200 ease-out ${
            wide
              ? "w-[min(56rem,calc(100vw-1.5rem))]"
              : "w-[min(26rem,calc(100vw-1.5rem))]"
          }`}
          style={{
            height: wide
              ? "min(46rem, 100%)"
              : "min(38rem, 100%)",
          }}
          role="dialog"
          aria-label="Assistant Margus"
        >
          <header className="flex shrink-0 items-start border-b border-border pb-3 pl-6 pr-1 pt-1">
            <div className="min-w-0 flex-1 self-center pr-2">
              <h2 className="font-semibold text-foreground">
                Assistant Margus
              </h2>
              <p className="text-sm leading-snug text-muted-foreground">
                Chat for {context.portfolioName}
              </p>
            </div>
            <div className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={toggleWide}
                className="touch-target inline-flex items-center justify-center rounded-lg p-1.5 text-muted-foreground transition hover:bg-hover hover:text-foreground"
                aria-label={wide ? "Shrink Margus" : "Widen Margus"}
                title={wide ? "Shrink panel" : "Widen panel: more room for tables"}
              >
                {wide ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </button>
              {/* `flex` on the wrapper, matching the header's other controls:
               * a block wrapper puts this button in an inline formatting
               * context and grows to a line box, which centres a few pixels
               * off from its unwrapped siblings. */}
              <div className="relative flex" ref={rulesRef}>
                {!context.hideOptions && (
                  <>
                    <button
                      type="button"
                      onClick={() => setRulesOpen((o) => !o)}
                      className={`touch-target inline-flex items-center justify-center rounded-lg p-1.5 transition ${
                        rulesOpen
                          ? "bg-muted text-primary"
                          : "text-muted-foreground hover:bg-hover hover:text-foreground"
                      }`}
                      aria-label="Strategy rules"
                      aria-expanded={rulesOpen}
                    >
                      <BookOpen className="h-4 w-4" />
                    </button>
                    {rulesOpen && (
                      <div className="absolute right-0 top-full z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-md ring-1 ring-foreground/20">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-muted-foreground">
                            Strategy rules
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => setRulesOpen(false)}
                            aria-label="Close rules"
                          >
                            <X />
                          </Button>
                        </div>
                        <ul className="flex flex-col max-h-72 gap-2.5 overflow-y-auto">
                          {RULES.map((r) => (
                            <li
                              key={r.title}
                              className="border-b border-border pb-2.5 last:border-0 last:pb-0"
                            >
                              <p className="text-sm font-medium text-muted-foreground">
                                {r.title}
                              </p>
                              <p className="mt-0.5 text-sm font-semibold text-primary">
                                {r.rule}
                              </p>
                              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                                {r.detail}
                              </p>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2.5 border-t border-border pt-2.5 text-sm leading-relaxed text-muted-foreground">
                          {ADVICE_DISCLAIMER_SHORT}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="touch-target inline-flex items-center justify-center rounded-lg p-1.5 text-muted-foreground transition hover:bg-hover hover:text-foreground"
                aria-label="Close Margus"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <p className="shrink-0 border-b border-border px-6 py-2 text-center text-sm leading-snug text-muted-foreground">
            {ADVICE_DISCLAIMER_SHORT}
          </p>

          <div
            ref={scrollerRef}
            className="min-h-0 flex-1 gap-3 overflow-y-auto px-6 py-5"
          >
            {messages.length === 0 && (
              <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted p-4">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {context.hideOptions
                    ? "I can read holdings and update shares, buy price, cash, or add/remove tickers."
                    : "I can read holdings and covered calls, and update shares, buy price, cash, Call %, or add/remove tickers. Open the book icon for the strategy rules."}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((s) => (
                    <Button
                      key={s}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => sendMessage({ text: s })}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message, index) => {
              const text = extractText(
                message.parts as Array<{ type: string; text?: string }>
              );
              const images = extractImages(
                message.parts as Array<{
                  type: string;
                  url?: string;
                  mediaType?: string;
                }>
              );
              const toolParts = message.parts as ToolPart[];
              const prev = messages[index - 1];
              const afterScreenshot =
                message.role === "assistant" &&
                prev?.role === "user" &&
                partsHaveImages(
                  prev.parts as Array<{ type: string; mediaType?: string }>
                );
              const screenshotIssue =
                screenshotIssueFromParts(toolParts) ??
                (afterScreenshot && text && isGenericScreenshotFail(text)
                  ? screenshotImportFallbackCopy()
                  : null);
              const toolNotes = screenshotIssue
                ? []
                : toolParts
                    .filter(
                      (p) =>
                        p.state === "output-available" &&
                        typeof (p.output as { message?: string })?.message ===
                          "string"
                    )
                    .map((p) => (p.output as { message: string }).message);
              const toolPending = toolParts.some(
                (p) =>
                  p.toolCallId &&
                  p.state !== "output-available" &&
                  p.state !== "output-error"
              );

              if (
                !text &&
                !images.length &&
                toolNotes.length === 0 &&
                !screenshotIssue &&
                !toolPending
              )
                return null;

              return (
                <div
                  key={message.id}
                  className={
                    message.role === "user"
                      ? "ml-0 max-w-[95%] rounded-lg bg-accent/80 px-3 py-2 text-sm text-foreground sm:ml-6"
                      : /* A well inside the panel, never a second pane on
                         * top of it: the panel is already doing the
                         * refraction, and a `glass` bubble stacked on a
                         * `glass-overlay` body is a second backdrop-filter
                         * over a surface that has nothing left to show
                         * through it. */
                        "card-sheen glass-well w-full min-w-0 rounded-xl px-4 py-3 text-base text-foreground"
                  }
                >
                  <p
                    className={
                      message.role === "assistant"
                        ? "mb-1 text-sm font-medium text-muted-foreground"
                        : "mb-1 text-sm font-medium text-muted-foreground"
                    }
                  >
                    {message.role === "user" ? "You" : "Margus"}
                  </p>
                  {images.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {images.map((img, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={`${message.id}-img-${i}`}
                          src={img.url}
                          alt="Attached"
                          className="max-h-40 max-w-full rounded-md border border-border object-contain"
                        />
                      ))}
                    </div>
                  )}
                  {screenshotIssue ? (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-sm font-semibold text-foreground">
                        {screenshotIssue.title}
                      </p>
                      {screenshotIssue.lines.map((line, i) => (
                        <p
                          key={i}
                          className={`text-sm leading-relaxed ${
                            i === 0 ? "text-caution" : "text-muted-foreground"
                          }`}
                        >
                          {line}
                        </p>
                      ))}
                    </div>
                  ) : text ? (
                    <div className="w-full min-w-0 text-base leading-relaxed">
                      {message.role === "assistant" ? (
                        <ChatMarkdown>{text}</ChatMarkdown>
                      ) : (
                        <p className="whitespace-pre-wrap break-words">{text}</p>
                      )}
                    </div>
                  ) : null}
                  {toolPending && !text && toolNotes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Running analysis …</p>
                  ) : null}
                  {toolNotes.map((note, i) => (
                    <p
                      key={i}
                      className="mt-1.5 whitespace-pre-wrap break-words text-sm font-medium text-primary"
                    >
                      {note}
                    </p>
                  ))}
                </div>
              );
            })}

            {busy && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Thinking …
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => stop()}
                >
                  <Square data-icon="inline-start" className="fill-current" />
                  Stop
                </Button>
              </div>
            )}

            {error && isQuietChatFailure(error.message) && chatRetryRef.current ? (
              <Alert>
                <AlertDescription>
                  Didn&apos;t land that time. Send it again.
                </AlertDescription>
              </Alert>
            ) : screenshotTurn && !busy && (lastIsEmptyAssistant || error) ? (
              <Alert>
                <AlertTitle>{screenshotFailCopy.title}</AlertTitle>
                <AlertDescription>
                  {screenshotFailCopy.lines.map((line, i) => (
                    <p
                      key={i}
                      className={i === 0 ? "text-caution" : undefined}
                    >
                      {line}
                    </p>
                  ))}
                </AlertDescription>
              </Alert>
            ) : error && !isQuietChatFailure(error.message) ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {describeChatUiError(error.message)}
                </AlertDescription>
              </Alert>
            ) : lastIsEmptyAssistant && !error ? (
              <Alert>
                <AlertDescription>
                  Didn&apos;t land that time. Send it again.
                </AlertDescription>
              </Alert>
            ) : null}
          </div>

          <form
            onSubmit={onSubmit}
            className="flex shrink-0 flex-col gap-2 border-t border-border px-6 py-4"
          >
            {pendingImages.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pendingImages.map((img, i) => (
                  <div
                    key={`${img.filename ?? "img"}-${i}`}
                    className="relative h-16 w-16 overflow-hidden rounded-md border border-border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.filename ?? "Pending"}
                      className="h-full w-full object-cover"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="absolute right-0.5 top-0.5"
                      onClick={() =>
                        setPendingImages((prev) =>
                          prev.filter((_, j) => j !== i)
                        )
                      }
                      aria-label="Remove image"
                    >
                      <X />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach image"
                title="Attach screenshot"
              >
                <ImagePlus />
              </Button>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={(e) => void onPaste(e)}
                placeholder="Ask Margus …"
                aria-label="Paste a screenshot or ask Margus"
                disabled={busy}
                className="min-w-0 w-auto flex-1"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                tabIndex={-1}
                aria-hidden="true"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) void addImageFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!canSend}
                aria-label="Send"
              >
                <Send />
              </Button>
            </div>
          </form>
        </section>
      )}

      {/*
       * Gold means "open Margus". The launcher is gone while the panel is
       * open, so close lives on the header X alone: two dismiss controls
       * in the same corner fought each other, and the round button sat on
       * top of send.
       */}
      {!open && (
        <Button
          type="button"
          variant="default"
          size="icon-lg"
          className="pointer-events-auto size-14 rounded-full [&_svg:not([class*='size-'])]:size-6 lg:size-16"
          onClick={() => setOpen(true)}
          aria-label="Open Assistant Margus"
          title="Assistant Margus"
        >
          <Sparkles />
        </Button>
      )}
    </div>
  );
}
