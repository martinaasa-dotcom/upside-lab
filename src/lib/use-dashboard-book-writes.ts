"use client";

import { track } from "@vercel/analytics";
import type { AdvisorAction, SilentScreenshotImport } from "@/components/CcAdvisorChat";
import type { HoldingFormValues } from "@/components/HoldingModal";
import type { HoldingPatch } from "@/components/PortfolioTable";
import {
  captureSheetSnapshot,
  popUndoSnapshot,
  pushUndoSnapshot,
  type BookUndoSnapshot,
} from "@/lib/book-undo";
import { STRATEGY } from "@/lib/calculations";
import { isLiveSheetId } from "@/lib/book-isolation";
import { tradeCashDelta } from "@/lib/cash-delta";
import { clearChatHistory } from "@/lib/chat-history";
import { imageFilesFromList } from "@/lib/chat-images";
import type { CostBasisRow } from "@/components/CostBasisModal";
import type { CsvHoldingRow } from "@/lib/csv-import";
import {
  addPortfolio,
  deleteHolding,
  deletePortfolio,
  hasLockedSave,
  loadDemoStore,
  lockDemoStore,
  patchHolding,
  renamePortfolio,
  resetDemoStore,
  updateCash,
  upsertHolding,
} from "@/lib/demo-store";
import { saveEoyOverrides, type PortfolioEoyOverrides } from "@/lib/forecast-overrides";
import { isRecord, readFiniteNumber } from "@/lib/unknown";
import { isSafePositiveMoney, isSafeShares, sanitizeSheetName } from "@/lib/input-guard";
import { roundMoney } from "@/lib/money";
import { OVERVIEW_TAB_ID } from "@/lib/overview";
import { parseHolding, parsePortfolio } from "@/lib/parse-book";
import { plainError } from "@/lib/plain-error";
import { FIRST_SHEET_NAME } from "@/lib/product";
import { markSheetImported } from "@/lib/sheet-import-stamp";
import { normalizeYahooTicker } from "@/lib/ticker";
import type { Holding, OptionCandidate, Portfolio, Quote } from "@/lib/types";
import type { ToastKind } from "@/components/ui/Toast";
import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

export type DashboardBookWritesArgs = {
  source: "demo" | "supabase";
  setSource: Dispatch<SetStateAction<"demo" | "supabase">>;
  user: { id: string } | null;
  toast: (message: string, kind?: ToastKind) => void;
  later: (fn: () => void, ms: number) => number;
  portfolios: Portfolio[];
  holdings: Holding[];
  setPortfolios: Dispatch<SetStateAction<Portfolio[]>>;
  setHoldings: Dispatch<SetStateAction<Holding[]>>;
  setOptions: Dispatch<SetStateAction<Record<string, OptionCandidate | null>>>;
  quotes: Record<string, Quote>;
  activePortfolio: Portfolio | null;
  margusPortfolio: Portfolio | null;
  inviteSheet: Portfolio | null;
  activeId: string;
  /**
   * Opens a tab. A navigation rather than a state write since every room
   * has a path of its own; the `SetStateAction` shape is kept so callers
   * that reach for the previous value ("close this sheet if it is the one
   * open") read as they did. See `hrefForTabId`.
   */
  goToTab: Dispatch<SetStateAction<string>>;
  eoyOverrides: PortfolioEoyOverrides;
  setEoyOverrides: Dispatch<SetStateAction<PortfolioEoyOverrides>>;
  undoStack: BookUndoSnapshot[];
  setUndoStack: Dispatch<SetStateAction<BookUndoSnapshot[]>>;
  setModalOpen: Dispatch<SetStateAction<boolean>>;
  setCsvImportOpen: Dispatch<SetStateAction<boolean>>;
  setCashModalOpen: Dispatch<SetStateAction<boolean>>;
  setScreenshotPending: Dispatch<SetStateAction<boolean>>;
  setSilentScreenshot: Dispatch<SetStateAction<SilentScreenshotImport | null>>;
  setLocked: Dispatch<SetStateAction<boolean>>;
  setSaveFlash: Dispatch<SetStateAction<boolean>>;
  setConfirmDelete: Dispatch<
    SetStateAction<
      | { kind: "holding"; id: string; label: string }
      | { kind: "sheet"; id: string; label: string }
      | null
    >
  >;
  setRenameTarget: Dispatch<SetStateAction<{ id: string; name: string } | null>>;
  setCostBasisOpen: Dispatch<SetStateAction<boolean>>;
  setCostBasisRows: Dispatch<SetStateAction<CostBasisRow[]>>;
  bookRef: MutableRefObject<{ portfolios: Portfolio[]; holdings: Holding[] }>;
  holdingPatchSeqRef: MutableRefObject<Map<string, number>>;
  cashWriteSeqRef: MutableRefObject<Map<string, number>>;
  pendingBookWritesRef: MutableRefObject<number>;
  reloadAfterWritesRef: MutableRefObject<boolean>;
  bookWriteChainRef: MutableRefObject<Promise<void>>;
  addingSheetRef: MutableRefObject<Promise<Portfolio | undefined> | null>;
  creatingFirstSheetRef: MutableRefObject<Promise<Portfolio | undefined> | null>;
  silentScreenshotSeq: MutableRefObject<number>;
  loadPortfolios: (opts?: { silent?: boolean; retry?: boolean }) => Promise<void>;
  refreshMarkets: (
    tickers: string[],
    rows: Holding[],
    existingQuotes?: Record<string, Quote>,
    opts?: { quotesOnly?: boolean; silent?: boolean }
  ) => Promise<void>;
  seedNewSheetPanelDefaults: (portfolio: { id: string; slug?: string | null }) => void;
};

export function useDashboardBookWrites(args: DashboardBookWritesArgs) {
  const {
    source,
    setSource,
    user,
    toast,
    later,
    portfolios,
    holdings,
    setPortfolios,
    setHoldings,
    setOptions,
    quotes,
    activePortfolio,
    margusPortfolio,
    inviteSheet,
    activeId,
    goToTab,
    eoyOverrides,
    setEoyOverrides,
    undoStack,
    setUndoStack,
    setModalOpen,
    setCsvImportOpen,
    setCashModalOpen,
    setScreenshotPending,
    setSilentScreenshot,
    setLocked,
    setSaveFlash,
    setConfirmDelete,
    setRenameTarget,
    setCostBasisOpen,
    setCostBasisRows,
    bookRef,
    holdingPatchSeqRef,
    cashWriteSeqRef,
    pendingBookWritesRef,
    reloadAfterWritesRef,
    bookWriteChainRef,
    addingSheetRef,
    creatingFirstSheetRef,
    silentScreenshotSeq,
    loadPortfolios,
    refreshMarkets,
    seedNewSheetPanelDefaults,
  } = args;

  function beginBookWrite() {
    pendingBookWritesRef.current += 1;
  }
  function endBookWrite() {
    pendingBookWritesRef.current = Math.max(0, pendingBookWritesRef.current - 1);
    if (pendingBookWritesRef.current === 0 && reloadAfterWritesRef.current) {
      reloadAfterWritesRef.current = false;
      void loadPortfolios({ silent: true });
    }
  }
  function enqueueBookWrite(task: () => Promise<void>) {
    const run = bookWriteChainRef.current.then(task, task);
    bookWriteChainRef.current = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
  /**
   * fetch for our own API that reports a dead network as a failed response
   * instead of throwing.
   *
   * Every optimistic write here follows the same shape: apply the change to
   * local state, fire the request, and roll back when `!res.ok`. A bare fetch
   * rejects rather than returning when the device is offline or DNS fails, so
   * those blocks skipped their own rollback and left the person looking at a
   * number that was never saved, plus an unhandled rejection in the console.
   * Offline is the normal failure for a phone app, so it has to travel the same
   * path as a 500 rather than a separate one every caller must remember.
   */
  async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {
      ...(init?.headers as Record<string, string> | undefined),
    };
    if (init?.body && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
    try {
      return await fetch(input, { ...init, headers });
    } catch (err) {
      console.warn("[api] request failed", input, err);
      return Response.json(
        { error: "You look offline. Nothing was saved." },
        { status: 503 }
      );
    }
  }

  function applyCashBalance(portfolioId: string, cash: number | null | undefined) {
    if (cash == null || !Number.isFinite(Number(cash))) return;
    const next = Number(cash);
    setPortfolios((prev) =>
      prev.map((p) => (p.id === portfolioId ? { ...p, cash_balance: next } : p))
    );
  }

  function applyCashDelta(portfolioId: string, delta: number) {
    if (!Number.isFinite(delta) || delta === 0) return;
    setPortfolios((prev) =>
      prev.map((p) =>
        p.id === portfolioId
          ? { ...p, cash_balance: roundMoney(p.cash_balance + delta) }
          : p
      )
    );
  }

  function salePx(ticker: string, fallback: number) {
    const p = quotes[ticker]?.price ?? quotes[ticker.toUpperCase()]?.price;
    return typeof p === "number" && p > 0 ? p : fallback;
  }

  function handleSave(batch: HoldingFormValues[]) {
    if (!activePortfolio || batch.length === 0) return;

    let working = bookRef.current.holdings.slice();
    const applied: {
      values: HoldingFormValues;
      ticker: string;
      existing: Holding | undefined;
      optimistic: Holding;
      cashDelta: number;
      sortOrder: number;
    }[] = [];

    for (const values of batch) {
      const ticker = normalizeYahooTicker(values.ticker);
      const sortOrder =
        working.filter((h) => h.portfolio_id === activePortfolio.id).length +
        1;
      const existing = working.find(
        (h) =>
          h.portfolio_id === activePortfolio.id &&
          h.ticker.toUpperCase() === ticker
      );
      const optimistic: Holding = existing
        ? {
            ...existing,
            shares: values.shares,
            buy_price: values.buy_price,
            target_call_pct: values.target_call_pct,
          }
        : {
            id: `tmp-${crypto.randomUUID()}`,
            portfolio_id: activePortfolio.id,
            ticker,
            shares: values.shares,
            buy_price: values.buy_price,
            eoy_target: null,
            target_call_pct: values.target_call_pct,
            stock_target_override: null,
            sort_order: sortOrder,
          };

      working = existing
        ? working.map((h) =>
            h.id === existing.id ? { ...optimistic, id: existing.id } : h
          )
        : [...working, optimistic];

      let cashDelta = 0;
      if (!existing) {
        cashDelta = tradeCashDelta({
          buyShares: values.shares,
          buyPrice: values.buy_price,
        });
      } else if (values.shares > existing.shares) {
        cashDelta = tradeCashDelta({
          buyShares: values.shares - existing.shares,
          buyPrice: values.buy_price,
        });
      } else if (values.shares < existing.shares) {
        cashDelta = tradeCashDelta({
          sellShares: existing.shares - values.shares,
          sellPrice: salePx(ticker, existing.buy_price),
        });
      }
      applyCashDelta(activePortfolio.id, cashDelta);
      applied.push({
        values,
        ticker,
        existing,
        optimistic,
        cashDelta,
        sortOrder,
      });
    }

    setHoldings(working);
    setModalOpen(false);
    toast(batch.length === 1 ? "Holding saved" : "Holdings saved", "success");
    for (const row of applied) {
      track("holding_added", { ticker: row.ticker });
    }
    void refreshMarkets(
      applied.map((row) => row.ticker),
      working.filter((h) => h.portfolio_id === activePortfolio.id)
    );

    if (source === "supabase") {
      for (const row of applied) {
        const writeKey = row.existing?.id ?? row.optimistic.id;
        const writeSeq = (holdingPatchSeqRef.current.get(writeKey) ?? 0) + 1;
        holdingPatchSeqRef.current.set(writeKey, writeSeq);
        beginBookWrite();
        enqueueBookWrite(async () => {
          try {
            const res = await apiFetch("/api/holdings", {
              method: "POST",
              body: JSON.stringify({
                ...row.values,
                ticker: row.ticker,
                portfolio_id: activePortfolio.id,
                sort_order: row.sortOrder,
              }),
            });
            const raw: unknown = await res.json().catch(() => ({}));
            const data = isRecord(raw) ? raw : {};
            if (!res.ok) {
              applyCashDelta(activePortfolio.id, -row.cashDelta);
              if (holdingPatchSeqRef.current.get(writeKey) === writeSeq) {
                setHoldings((prev) => {
                  if (row.existing) {
                    return prev.map((h) =>
                      h.id === row.existing!.id ? row.existing! : h
                    );
                  }
                  return prev.filter((h) => h.id !== row.optimistic.id);
                });
              } else {
                reloadAfterWritesRef.current = true;
              }
              toast(
                plainError(
                  data.error,
                  "Couldn't save that holding. We put it back how it was."
                ),
                "error"
              );
              return;
            }
            if (holdingPatchSeqRef.current.get(writeKey) === writeSeq) {
              applyCashBalance(
                activePortfolio.id,
                readFiniteNumber(data.cash_balance)
              );
            }
            const saved = parseHolding(data.holding);
            if (saved) {
              holdingPatchSeqRef.current.set(saved.id, writeSeq);
              setHoldings((prev) => {
                const withoutTemp = prev.filter(
                  (h) => h.id !== row.optimistic.id
                );
                const exists = withoutTemp.some((h) => h.id === saved.id);
                return exists
                  ? withoutTemp.map((h) => (h.id === saved.id ? saved : h))
                  : [...withoutTemp, saved];
              });
            }
          } catch (err) {
            applyCashDelta(activePortfolio.id, -row.cashDelta);
            if (holdingPatchSeqRef.current.get(writeKey) === writeSeq) {
              setHoldings((prev) => {
                if (row.existing) {
                  return prev.map((h) =>
                    h.id === row.existing!.id ? row.existing! : h
                  );
                }
                return prev.filter((h) => h.id !== row.optimistic.id);
              });
            } else {
              reloadAfterWritesRef.current = true;
            }
            toast(
              plainError(
                err instanceof Error ? err.message : null,
                "Couldn't save that holding. We put it back how it was."
              ),
              "error"
            );
          } finally {
            endBookWrite();
          }
        });
      }
      return;
    }

    let store = loadDemoStore();
    for (const row of applied) {
      store = upsertHolding(store, {
        ...row.values,
        ticker: row.ticker,
        eoy_target: null,
        stock_target_override: null,
        portfolio_id: activePortfolio.id,
        sort_order: row.sortOrder,
      });
    }
    setPortfolios(store.portfolios);
    setHoldings(store.holdings);
  }

  function handlePatch(patch: HoldingPatch): boolean {
    const { id, ...fields } = patch;
    if (
      fields.shares != null &&
      !isSafeShares(fields.shares)
    ) {
      toast("Share count has to be bigger than 0 and not enormous.", "error");
      return false;
    }
    if (
      fields.buy_price != null &&
      !isSafePositiveMoney(fields.buy_price)
    ) {
      toast("Buy price has to be bigger than 0 and not enormous.", "error");
      return false;
    }
    const patchSeq = (holdingPatchSeqRef.current.get(id) ?? 0) + 1;
    holdingPatchSeqRef.current.set(id, patchSeq);
    const previous = bookRef.current.holdings.find((h) => h.id === id);

    // Clear stale option when strike-driving fields change
    if (
      fields.target_call_pct !== undefined ||
      fields.stock_target_override !== undefined
    ) {
      const ticker = previous?.ticker;
      if (ticker) {
        setOptions((prev) => ({ ...prev, [ticker]: null }));
      }
    }

    // Optimistic: apply immediately so every keystroke commit feels instant,
    // regardless of Supabase round-trip time. Background request rolls the
    // field back (via the same setHoldings the UI already reads from) and
    // toasts on failure instead of making the input wait.
    setHoldings((prev) =>
      prev.map((h) => (h.id === id ? { ...h, ...fields } : h))
    );
    let cashDelta = 0;
    if (previous && fields.shares != null && fields.shares !== previous.shares) {
      const buyPrice = fields.buy_price ?? previous.buy_price;
      if (fields.shares > previous.shares) {
        cashDelta = tradeCashDelta({
          buyShares: fields.shares - previous.shares,
          buyPrice,
        });
      } else {
        cashDelta = tradeCashDelta({
          sellShares: previous.shares - fields.shares,
          sellPrice: salePx(previous.ticker, previous.buy_price),
        });
      }
      applyCashDelta(previous.portfolio_id, cashDelta);
    }

    if (source === "supabase") {
      beginBookWrite();
      enqueueBookWrite(async () => {
        try {
          const res = await apiFetch("/api/holdings", {
            method: "PATCH",
            body: JSON.stringify({ id, ...fields }),
          });
          const raw: unknown = await res.json().catch(() => ({}));
          const data = isRecord(raw) ? raw : {};
          if (holdingPatchSeqRef.current.get(id) !== patchSeq) {
            if (!res.ok) reloadAfterWritesRef.current = true;
            return;
          }
          if (!res.ok) {
            if (previous) {
              setHoldings((prev) =>
                prev.map((h) => (h.id === id ? previous : h))
              );
              applyCashDelta(previous.portfolio_id, -cashDelta);
            }
            toast(
              plainError(data.error, "Couldn't update that holding. We put it back how it was."),
              "error"
            );
            return;
          }
          if (previous) {
            applyCashBalance(
              previous.portfolio_id,
              readFiniteNumber(data.cash_balance)
            );
          }
        } catch (err) {
          if (holdingPatchSeqRef.current.get(id) !== patchSeq) {
            reloadAfterWritesRef.current = true;
            return;
          }
          if (previous) {
            setHoldings((prev) =>
              prev.map((h) => (h.id === id ? previous : h))
            );
            applyCashDelta(previous.portfolio_id, -cashDelta);
          }
          toast(
            plainError(
              err instanceof Error ? err.message : null,
              "Couldn't update that holding. We put it back how it was."
            ),
            "error"
          );
        } finally {
          endBookWrite();
        }
      });
      return true;
    }
    const next = patchHolding(loadDemoStore(), id, fields);
    setHoldings(next.holdings);
    setPortfolios(next.portfolios);
    return true;
  }

  /**
   * `into` is the portfolio to write to when the caller already knows it and
   * this render does not yet.
   *
   * Every write here used to read `activePortfolio` straight off the render
   * closure and return silently when it was null. That is correct for the
   * advisor tools, which only ever run on a portfolio the reader is looking
   * at, and quietly wrong for the one path that matters most: the very
   * first paste on an empty account.
   *
   * There, `onPasteHoldings` creates the first portfolio and then imports
   * into it in the same tick. Creating it calls `goToTab`, but React has
   * not re-rendered by the time the import runs, so `activePortfolio` is
   * still the `null` it was when the empty state was drawn. The import hit
   * this guard and returned. The portfolio appeared, the page navigated to
   * it, the holdings were dropped, and nothing anywhere said so: the button
   * simply did nothing, on the first thing a new person ever asks the app to
   * do.
   *
   * Passing the freshly created portfolio in removes the dependency on a
   * render that has not happened yet. Callers that are already on a
   * portfolio pass nothing and keep the old behaviour.
   */
  const applyAdvisorActions = useCallback(
    (actions: AdvisorAction[], into?: Portfolio) => {
      const sheet = into ?? margusPortfolio ?? activePortfolio;
      if (!actions.length || !sheet) return;

      setUndoStack((stack) =>
        pushUndoSnapshot(
          stack,
          captureSheetSnapshot({
            label: `Margus · ${actions.map((a) => a.action).slice(0, 3).join(", ")}`,
            portfolio: sheet,
            holdings,
            eoyOverrides,
          })
        )
      );

      const findHolding = (ticker: string, list: Holding[]) =>
        list.find(
          (h) =>
            h.portfolio_id === sheet.id &&
            h.ticker.toUpperCase() === ticker.toUpperCase()
        );

      if (source === "demo") {
        let store = loadDemoStore();
        let nextHoldings = store.holdings;

        for (const action of actions) {
          if (action.action === "set_call_pct") {
            const h = findHolding(action.ticker, nextHoldings);
            if (!h) continue;
            store = patchHolding(store, h.id, {
              target_call_pct: action.callPct,
            });
            nextHoldings = store.holdings;
            setOptions((opts) => ({ ...opts, [h.ticker]: null }));
          } else if (action.action === "set_call_pct_bulk") {
            for (const u of action.updates) {
              const h = findHolding(u.ticker, nextHoldings);
              if (!h) continue;
              store = patchHolding(store, h.id, {
                target_call_pct: u.callPct,
              });
              nextHoldings = store.holdings;
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            }
          } else if (action.action === "set_uniform_call_pct") {
            for (const h of nextHoldings.filter(
              (x) => x.portfolio_id === sheet.id
            )) {
              store = patchHolding(store, h.id, {
                target_call_pct: action.callPct,
              });
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            }
            nextHoldings = store.holdings;
          } else if (action.action === "update_holding") {
            const h = findHolding(action.ticker, nextHoldings);
            if (!h) continue;
            const fields: Partial<Holding> = {};
            if (action.shares != null) fields.shares = action.shares;
            if (action.buyPrice != null) fields.buy_price = action.buyPrice;
            if (Object.keys(fields).length === 0) continue;
            store = patchHolding(store, h.id, fields);
            nextHoldings = store.holdings;
            if (fields.shares != null) {
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            }
          } else if (action.action === "set_cash") {
            store = updateCash(store, sheet.id, action.cash);
          } else if (action.action === "add_holding") {
            const existing = findHolding(action.ticker, nextHoldings);
            store = upsertHolding(store, {
              id: existing?.id,
              portfolio_id: sheet.id,
              ticker: action.ticker,
              shares: action.shares,
              buy_price: action.buyPrice,
              eoy_target: existing?.eoy_target ?? null,
              target_call_pct: action.callPct,
              stock_target_override: existing?.stock_target_override ?? null,
              sort_order:
                existing?.sort_order ??
                nextHoldings.filter(
                  (h) => h.portfolio_id === sheet.id
                ).length + 1,
            });
            nextHoldings = store.holdings;
            void refreshMarkets(
              [action.ticker],
              nextHoldings.filter((h) => h.portfolio_id === sheet.id)
            );
          } else if (action.action === "import_portfolio") {
            let sortBase = nextHoldings.filter(
              (h) => h.portfolio_id === sheet.id
            ).length;
            const imported = new Set<string>();
            for (const row of action.holdings) {
              const existing = findHolding(row.ticker, nextHoldings);
              if (!existing) sortBase += 1;
              store = upsertHolding(store, {
                id: existing?.id,
                portfolio_id: sheet.id,
                ticker: row.ticker,
                shares: row.shares,
                buy_price: row.buyPrice,
                eoy_target: existing?.eoy_target ?? null,
                target_call_pct: row.callPct,
                stock_target_override: existing?.stock_target_override ?? null,
                sort_order: existing?.sort_order ?? sortBase,
              });
              nextHoldings = store.holdings;
              imported.add(row.ticker.toUpperCase());
            }
            if (action.replace !== false) {
              for (const h of nextHoldings.filter(
                (x) => x.portfolio_id === sheet.id
              )) {
                if (imported.has(h.ticker.toUpperCase())) continue;
                store = deleteHolding(store, h.id);
                setOptions((opts) => {
                  const next = { ...opts };
                  delete next[h.ticker];
                  return next;
                });
              }
              nextHoldings = store.holdings;
            }
            const tickers = action.holdings.map((h) => h.ticker);
            void refreshMarkets(
              tickers,
              nextHoldings.filter((h) => h.portfolio_id === sheet.id)
            );
            setCostBasisRows(
              action.holdings.map((row) => ({
                ticker: row.ticker,
                shares: row.shares,
                suggestedBuy: row.buyPrice,
                buyPrice: row.buyPrice,
              }))
            );
            setCostBasisOpen(true);
            if (action.cash != null) {
              store = updateCash(store, sheet.id, action.cash);
            }
          } else if (action.action === "remove_holding") {
            const h = findHolding(action.ticker, nextHoldings);
            if (!h) continue;
            store = deleteHolding(store, h.id);
            nextHoldings = store.holdings;
            setOptions((opts) => {
              const next = { ...opts };
              delete next[h.ticker];
              return next;
            });
          } else if (action.action === "set_stock_target") {
            const h = findHolding(action.ticker, nextHoldings);
            if (!h) continue;
            store = patchHolding(store, h.id, {
              stock_target_override: action.stockTarget,
            });
            nextHoldings = store.holdings;
            setOptions((opts) => ({ ...opts, [h.ticker]: null }));
          } else if (action.action === "set_stock_target_bulk") {
            for (const u of action.updates) {
              const h = findHolding(u.ticker, nextHoldings);
              if (!h) continue;
              store = patchHolding(store, h.id, {
                stock_target_override: u.stockTarget,
              });
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            }
            nextHoldings = store.holdings;
          } else if (action.action === "clear_stock_target") {
            const h = findHolding(action.ticker, nextHoldings);
            if (!h) continue;
            store = patchHolding(store, h.id, {
              stock_target_override: null,
            });
            nextHoldings = store.holdings;
            setOptions((opts) => ({ ...opts, [h.ticker]: null }));
          } else if (action.action === "apply_write_plan") {
            for (const u of action.updates) {
              const h = findHolding(u.ticker, nextHoldings);
              if (!h) continue;
              store = patchHolding(store, h.id, {
                stock_target_override: u.stockTarget,
                target_call_pct: u.callPct,
              });
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            }
            nextHoldings = store.holdings;
          }
        }

        setPortfolios(store.portfolios);
        setHoldings(store.holdings);
        return;
      }

      // Supabase path — await mutations + dedicated import endpoint
      beginBookWrite();
      enqueueBookWrite(async () => {
        try {
        let working = [...holdings];
        const findH = (ticker: string) =>
          working.find(
            (h) =>
              h.portfolio_id === sheet.id &&
              h.ticker.toUpperCase() === ticker.toUpperCase()
          );

        let failures = 0;
        const patchHoldingApi = async (
          id: string,
          fields: Record<string, number | null>
        ) => {
          const res = await apiFetch("/api/holdings", {
            method: "PATCH",
            body: JSON.stringify({ id, ...fields }),
          });
          if (!res.ok) {
            failures += 1;
            return false;
          }
          const data = (await res.json().catch(() => ({}))) as {
            cash_balance?: number | null;
          };
          applyCashBalance(sheet.id, data.cash_balance);
          working = working.map((x) =>
            x.id === id ? ({ ...x, ...fields } as Holding) : x
          );
          setHoldings((prev) =>
            prev.map((x) => (x.id === id ? { ...x, ...fields } : x))
          );
          return true;
        };

        for (const action of actions) {
          if (
            action.action === "set_call_pct" ||
            action.action === "update_holding"
          ) {
            const h = findH(action.ticker);
            if (!h) continue;
            const fields: Record<string, number | null> = {};
            if (action.action === "set_call_pct") {
              fields.target_call_pct = action.callPct;
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            } else {
              if (action.shares != null) fields.shares = action.shares;
              if (action.buyPrice != null) fields.buy_price = action.buyPrice;
              if (action.shares != null) {
                setOptions((opts) => ({ ...opts, [h.ticker]: null }));
              }
            }
            if (!Object.keys(fields).length) continue;
            await patchHoldingApi(h.id, fields);
          } else if (action.action === "set_call_pct_bulk") {
            for (const u of action.updates) {
              const h = findH(u.ticker);
              if (!h) continue;
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
              await patchHoldingApi(h.id, { target_call_pct: u.callPct });
            }
          } else if (action.action === "set_uniform_call_pct") {
            for (const h of working.filter(
              (x) => x.portfolio_id === sheet.id
            )) {
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
              await patchHoldingApi(h.id, { target_call_pct: action.callPct });
            }
          } else if (action.action === "set_cash") {
            const res = await apiFetch("/api/portfolios", {
              method: "PATCH",
              body: JSON.stringify({
                id: sheet.id,
                cash_balance: action.cash,
              }),
            });
            if (!res.ok) failures += 1;
            else {
              setPortfolios((prev) =>
                prev.map((p) =>
                  p.id === sheet.id
                    ? { ...p, cash_balance: action.cash }
                    : p
                )
              );
            }
          } else if (action.action === "add_holding") {
            const res = await apiFetch("/api/holdings", {
              method: "POST",
              body: JSON.stringify({
                portfolio_id: sheet.id,
                ticker: action.ticker,
                shares: action.shares,
                buy_price: action.buyPrice,
                target_call_pct: action.callPct,
                sort_order:
                  working.filter((h) => h.portfolio_id === sheet.id)
                    .length + 1,
              }),
            });
            if (!res.ok) failures += 1;
            else {
              const data = (await res.json().catch(() => ({}))) as {
                cash_balance?: number | null;
              };
              applyCashBalance(sheet.id, data.cash_balance);
              await loadPortfolios({ silent: true });
            }
          } else if (action.action === "import_portfolio") {
            const res = await apiFetch("/api/holdings/import", {
              method: "POST",
              body: JSON.stringify({
                portfolio_id: sheet.id,
                cash: action.cash ?? null,
                replace: action.replace !== false,
                holdings: action.holdings.map((row) => ({
                  ticker: row.ticker,
                  shares: row.shares,
                  buy_price: row.buyPrice,
                  target_call_pct: row.callPct,
                })),
              }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              failures += 1;
              toast(
                plainError(data.error, "Couldn't import that file. Try again."),
                "error"
              );
            } else {
              const upserted = Number(data.upserted ?? 0);
              const removed = Number(data.removed ?? 0);
              const failed = Array.isArray(data.failed) ? data.failed.length : 0;
              const cashBit = data.cashUpdated ? " - cash updated" : "";
              const removeBit = removed ? ` - removed ${removed}` : "";
              toast(
                `Imported ${upserted} ticker${upserted === 1 ? "" : "s"}${cashBit}${removeBit}${
                  failed ? ` - ${failed} failed` : ""
                }`,
                failed ? "error" : "success"
              );
              await loadPortfolios({ silent: true });
              if (upserted > 0) {
                setCostBasisRows(
                  action.holdings.map((row) => ({
                    ticker: row.ticker,
                    shares: row.shares,
                    suggestedBuy: row.buyPrice,
                    buyPrice: row.buyPrice,
                  }))
                );
                setCostBasisOpen(true);
              }
            }
          } else if (action.action === "remove_holding") {
            const h = findH(action.ticker);
            if (!h) continue;
            const res = await apiFetch(`/api/holdings?id=${h.id}`, {
              method: "DELETE",
            });
            if (!res.ok) failures += 1;
            else {
              const data = (await res.json().catch(() => ({}))) as {
                cash_balance?: number | null;
              };
              applyCashBalance(sheet.id, data.cash_balance);
              working = working.filter((x) => x.id !== h.id);
              setHoldings((prev) => prev.filter((x) => x.id !== h.id));
            }
          } else if (action.action === "set_stock_target") {
            const h = findH(action.ticker);
            if (!h) continue;
            setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            await patchHoldingApi(h.id, {
              stock_target_override: action.stockTarget,
            });
          } else if (action.action === "set_stock_target_bulk") {
            for (const u of action.updates) {
              const h = findH(u.ticker);
              if (!h) continue;
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
              await patchHoldingApi(h.id, {
                stock_target_override: u.stockTarget,
              });
            }
          } else if (action.action === "clear_stock_target") {
            const h = findH(action.ticker);
            if (!h) continue;
            setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            await patchHoldingApi(h.id, { stock_target_override: null });
          } else if (action.action === "apply_write_plan") {
            for (const u of action.updates) {
              const h = findH(u.ticker);
              if (!h) continue;
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
              await patchHoldingApi(h.id, {
                stock_target_override: u.stockTarget,
                target_call_pct: u.callPct,
              });
            }
          }
        }

        if (failures > 0) {
          toast(
            failures === 1
              ? "Couldn't save what Margus suggested. Try again."
              : `Couldn't save ${failures} of Margus's suggestions. Try again.`,
            "error"
          );
          await loadPortfolios({ silent: true });
        }
        } catch (err) {
          toast(
            plainError(
              err instanceof Error ? err.message : null,
              "Couldn't save what Margus suggested. Try again."
            ),
            "error"
          );
          await loadPortfolios({ silent: true });
        } finally {
          endBookWrite();
        }
      });
    },
    // refreshMarkets / loadPortfolios are stable enough via closure for advisor tools
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activePortfolio, margusPortfolio, holdings, source, eoyOverrides]
  );

  /**
   * First-run actions fire from Overview, which is a meta-tab with no
   * active sheet, and every write path bails out without one (handleSave
   * returns early on a null activePortfolio). Create the first sheet if
   * needed, then switch to it so the import lands where they can see it.
   */
  const startFirstRunAction = useCallback(
    (kind: "manual" | "csv") => {
      void (async () => {
        try {
          const target = await ensureFirstSheet();
          if (!target) return;
          if (activeId !== target.id) goToTab(target.id);
          if (kind === "manual") setModalOpen(true);
          else setCsvImportOpen(true);
        } catch (err) {
          toast(
            plainError(
              err instanceof Error ? err.message : null,
              "Couldn't create the first portfolio. Try again."
            ),
            "error"
          );
        }
      })();
    },
    // ensureFirstSheet is a function declaration in this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, portfolios]
  );

  const handleCsvImport = useCallback(
    (
      input: { rows: CsvHoldingRow[]; cash: number | null; replace: boolean },
      // The portfolio to land in, for a caller that just created it. See the
      // note on `applyAdvisorActions`.
      into?: Portfolio
    ) => {
      if (input.rows.length === 0 && input.cash == null) return;
      track("csv_import", { rows: input.rows.length, replace: input.replace });
      applyAdvisorActions(
        [
          {
            action: "import_portfolio",
            cash: input.cash,
            replace: input.replace,
            holdings: input.rows.map((r) => ({
              ticker: r.ticker,
              shares: r.shares,
              buyPrice: r.buyPrice,
              callPct: r.callPct ?? STRATEGY.defaultCallPct,
            })),
          },
        ],
        into
      );
      const sheetId = into?.id ?? inviteSheet?.id ?? activePortfolio?.id;
      if (sheetId) markSheetImported(sheetId);
    },
    [applyAdvisorActions, inviteSheet?.id, activePortfolio?.id]
  );

  function undoLastMargusWrite() {
    const { stack, snap } = popUndoSnapshot(undoStack);
    if (!snap) {
      toast("Nothing to undo", "info");
      return;
    }
    setUndoStack(stack);
    setPortfolios((prev) =>
      prev.map((p) =>
        p.id === snap.portfolioId ? { ...p, cash_balance: snap.cashBalance } : p
      )
    );
    setHoldings((prev) => [
      ...prev.filter((h) => h.portfolio_id !== snap.portfolioId),
      ...snap.holdings,
    ]);
    setEoyOverrides(snap.eoyOverrides);
    saveEoyOverrides(snap.portfolioId, snap.eoyOverrides);
    if (source === "demo") {
      const store = loadDemoStore();
      let next = updateCash(store, snap.portfolioId, snap.cashBalance);
      for (const h of next.holdings.filter(
        (x) => x.portfolio_id === snap.portfolioId
      )) {
        next = deleteHolding(next, h.id);
      }
      for (const h of snap.holdings) {
        next = upsertHolding(next, { ...h });
      }
      setPortfolios(next.portfolios);
      setHoldings(next.holdings);
    }
    toast(`Undid: ${snap.label}`, "success");
  }

  function requestDeleteHolding(id: string) {
    const h = holdings.find((x) => x.id === id);
    setConfirmDelete({
      kind: "holding",
      id,
      label: h?.ticker ?? "holding",
    });
  }

  function deleteHoldingById(id: string): boolean {
    const removed = bookRef.current.holdings.find((h) => h.id === id);
    const cashDelta = removed
      ? tradeCashDelta({
          sellShares: removed.shares,
          sellPrice: salePx(removed.ticker, removed.buy_price),
        })
      : 0;
    if (removed) applyCashDelta(removed.portfolio_id, cashDelta);
    if (source === "supabase") {
      const writeSeq = (holdingPatchSeqRef.current.get(id) ?? 0) + 1;
      holdingPatchSeqRef.current.set(id, writeSeq);
      setHoldings((prev) => prev.filter((h) => h.id !== id));
      beginBookWrite();
      enqueueBookWrite(async () => {
        try {
          const res = await apiFetch(`/api/holdings?id=${id}`, {
            method: "DELETE",
          });
          const raw: unknown = await res.json().catch(() => ({}));
          const data = isRecord(raw) ? raw : {};
          if (holdingPatchSeqRef.current.get(id) !== writeSeq) {
            if (!res.ok) reloadAfterWritesRef.current = true;
            return;
          }
          if (!res.ok) {
            if (removed) {
              setHoldings((prev) => [...prev, removed]);
              applyCashDelta(removed.portfolio_id, -cashDelta);
            }
            toast(
              plainError(data.error, "Couldn't delete that holding. It's still there."),
              "error"
            );
            return;
          }
          if (removed) {
            applyCashBalance(
              removed.portfolio_id,
              readFiniteNumber(data.cash_balance)
            );
          }
        } catch (err) {
          if (holdingPatchSeqRef.current.get(id) !== writeSeq) {
            reloadAfterWritesRef.current = true;
            return;
          }
          if (removed) {
            setHoldings((prev) => [...prev, removed]);
            applyCashDelta(removed.portfolio_id, -cashDelta);
          }
          toast(
            plainError(
              err instanceof Error ? err.message : null,
              "Couldn't delete that holding. It's still there."
            ),
            "error"
          );
        } finally {
          endBookWrite();
        }
      });
    } else {
      const next = deleteHolding(loadDemoStore(), id);
      setHoldings(next.holdings);
      setPortfolios(next.portfolios);
    }
    toast("Holding deleted", "success");
    return true;
  }

  async function handleAddSheet(
    name: string,
    opts?: { silent?: boolean }
  ): Promise<Portfolio | undefined> {
    if (addingSheetRef.current) return addingSheetRef.current;
    const run = (async () => {
    const isFirstSheet = bookRef.current.portfolios.filter((p) =>
      isLiveSheetId(p.id)
    ).length === 0;
    const trimmed = sanitizeSheetName(name);
    if (!trimmed) return undefined;
    if (user) {
      const res = await apiFetch("/api/portfolios", {
        method: "POST",
        body: JSON.stringify({ name: trimmed }),
      });
      const raw: unknown = await res.json().catch(() => ({}));
      const data = isRecord(raw) ? raw : {};
      if (!res.ok) {
        toast(
          plainError(data.error, "Couldn't add that portfolio. Try again."),
          "error"
        );
        return undefined;
      }
      const created = parsePortfolio(data.portfolio);
      if (!created) {
        toast("Couldn't add that portfolio. Try again.", "error");
        return undefined;
      }
      setSource("supabase");
      setPortfolios((prev) => {
        const own = prev.filter((p) => isLiveSheetId(p.id));
        return own.some((p) => p.id === created.id) ? own : [...own, created];
      });
      setHoldings((prev) => prev.filter((h) => isLiveSheetId(h.portfolio_id)));
      seedNewSheetPanelDefaults(created);
      goToTab(created.id);
      track("sheet_created", { first_sheet: isFirstSheet });
      if (!opts?.silent) toast("Portfolio added", "success");
      return created;
    }
    const next = addPortfolio(loadDemoStore(), trimmed);
    setPortfolios(next.portfolios);
    const created = next.portfolios[next.portfolios.length - 1];
    seedNewSheetPanelDefaults(created);
    goToTab(created.id);
    track("sheet_created", { first_sheet: isFirstSheet });
    if (!opts?.silent) toast("Portfolio added", "success");
    return created;
    })();
    addingSheetRef.current = run;
    try {
      return await run;
    } finally {
      addingSheetRef.current = null;
    }
  }

  async function ensureFirstSheet(): Promise<Portfolio | undefined> {
    const own = portfolios.filter((p) => isLiveSheetId(p.id));
    if (own[0]) return own[0];
    if (creatingFirstSheetRef.current) return creatingFirstSheetRef.current;
    const pending = handleAddSheet(FIRST_SHEET_NAME, { silent: true });
    creatingFirstSheetRef.current = pending;
    try {
      return await pending;
    } finally {
      creatingFirstSheetRef.current = null;
    }
  }

  async function beginSilentScreenshotImport(files: File[]) {
    const images = imageFilesFromList(files).slice(0, 1);
    if (images.length === 0) return;
    setScreenshotPending(true);
    try {
      let targetId = margusPortfolio?.id ?? activePortfolio?.id ?? null;
      if (!targetId) {
        const created = await ensureFirstSheet();
        if (!created) {
          setScreenshotPending(false);
          return;
        }
        targetId = created.id;
        if (activeId !== created.id) goToTab(created.id);
      }
      silentScreenshotSeq.current += 1;
      setSilentScreenshot({
        id: silentScreenshotSeq.current,
        portfolioId: targetId,
        files: images,
      });
    } catch (err) {
      setScreenshotPending(false);
      toast(
        plainError(
          err instanceof Error ? err.message : null,
          "Couldn't start that screenshot import. Try again."
        ),
        "error"
      );
    }
  }

  function handleRenameSheet(id: string, name: string) {
    const previousName = bookRef.current.portfolios.find((p) => p.id === id)?.name;
    const renameSeq = (cashWriteSeqRef.current.get(`rename:${id}`) ?? 0) + 1;
    cashWriteSeqRef.current.set(`rename:${id}`, renameSeq);
    setPortfolios((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name } : p))
    );
    setRenameTarget(null);
    toast("Portfolio renamed", "success");

    if (source === "supabase") {
      beginBookWrite();
      enqueueBookWrite(async () => {
        try {
          const res = await apiFetch("/api/portfolios", {
            method: "PATCH",
            body: JSON.stringify({ id, name }),
          });
          if (!res.ok) {
            const raw: unknown = await res.json().catch(() => ({}));
            const data = isRecord(raw) ? raw : {};
            if (cashWriteSeqRef.current.get(`rename:${id}`) === renameSeq && previousName != null) {
              setPortfolios((prev) =>
                prev.map((p) => (p.id === id ? { ...p, name: previousName } : p))
              );
            }
            toast(
              plainError(data.error, "Couldn't rename that portfolio. We put the old name back."),
              "error"
            );
          }
        } catch (err) {
          if (cashWriteSeqRef.current.get(`rename:${id}`) === renameSeq && previousName != null) {
            setPortfolios((prev) =>
              prev.map((p) => (p.id === id ? { ...p, name: previousName } : p))
            );
          }
          toast(
            plainError(
              err instanceof Error ? err.message : null,
              "Couldn't rename that portfolio. We put the old name back."
            ),
            "error"
          );
        } finally {
          endBookWrite();
        }
      });
    } else {
      renamePortfolio(loadDemoStore(), id, name);
    }
  }

  async function deleteSheetById(id: string): Promise<boolean> {
    try {
    if (source === "supabase") {
      const res = await apiFetch(`/api/portfolios?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const raw: unknown = await res.json().catch(() => ({}));
        const data = isRecord(raw) ? raw : {};
        toast(
          plainError(data.error, "Couldn't delete that portfolio. Try again."),
          "error"
        );
        return false;
      }
      clearChatHistory(id);
      setPortfolios((prev) => prev.filter((p) => p.id !== id));
      setHoldings((prev) => prev.filter((h) => h.portfolio_id !== id));
      goToTab((prev) => (prev === id ? OVERVIEW_TAB_ID : prev));
    } else {
      const next = deletePortfolio(loadDemoStore(), id);
      clearChatHistory(id);
      setPortfolios(next.portfolios);
      setHoldings(next.holdings);
      if (activeId === id) goToTab(OVERVIEW_TAB_ID);
    }
    toast("Portfolio deleted", "success");
    return true;
    } catch (err) {
      toast(
        plainError(
          err instanceof Error ? err.message : null,
          "Couldn't delete that portfolio. Try again."
        ),
        "error"
      );
      return false;
    }
  }

  function handleSaveCash(cash: number) {
    if (!activePortfolio) return;
    const portfolioId = activePortfolio.id;
    const previousCash = activePortfolio.cash_balance;
    const cashSeq = (cashWriteSeqRef.current.get(portfolioId) ?? 0) + 1;
    cashWriteSeqRef.current.set(portfolioId, cashSeq);

    if (source === "demo") {
      const next = updateCash(loadDemoStore(), portfolioId, cash);
      setPortfolios(next.portfolios);
    } else {
      setPortfolios((prev) =>
        prev.map((p) => (p.id === portfolioId ? { ...p, cash_balance: cash } : p))
      );
      beginBookWrite();
      enqueueBookWrite(async () => {
        try {
          const res = await apiFetch("/api/portfolios", {
            method: "PATCH",
            body: JSON.stringify({ id: portfolioId, cash_balance: cash }),
          });
          if (!res.ok) {
            const raw: unknown = await res.json().catch(() => ({}));
            const data = isRecord(raw) ? raw : {};
            if (cashWriteSeqRef.current.get(portfolioId) === cashSeq) {
              setPortfolios((prev) =>
                prev.map((p) =>
                  p.id === portfolioId ? { ...p, cash_balance: previousCash } : p
                )
              );
            }
            toast(
              plainError(data.error, "Couldn't update cash. We put the old number back."),
              "error"
            );
          }
        } catch (err) {
          if (cashWriteSeqRef.current.get(portfolioId) === cashSeq) {
            setPortfolios((prev) =>
              prev.map((p) =>
                p.id === portfolioId ? { ...p, cash_balance: previousCash } : p
              )
            );
          }
          toast(
            plainError(
              err instanceof Error ? err.message : null,
              "Couldn't update cash. We put the old number back."
            ),
            "error"
          );
        } finally {
          endBookWrite();
        }
      });
    }
    setCashModalOpen(false);
    toast("Cash updated", "success");
  }

  function resetDemo() {
    // v1–v7 are legacy schema versions; v8 is today's STORAGE_KEY in
    // demo-store.ts — included here on purpose so Reset fully reseeds it.
    // Do NOT remove portfell-locked — Reset restores the last Save.
    for (let v = 1; v <= 8; v++) {
      localStorage.removeItem(`portfell-demo-v${v}`);
    }
    const demo = resetDemoStore();
    setPortfolios(demo.portfolios);
    setHoldings(demo.holdings);
    goToTab(OVERVIEW_TAB_ID);
    setLocked(hasLockedSave());
  }

  function saveLock() {
    const lockedStore = lockDemoStore({ portfolios, holdings });
    setPortfolios(lockedStore.portfolios);
    setHoldings(lockedStore.holdings);
    setLocked(true);
    setSaveFlash(true);
    later(() => setSaveFlash(false), 1600);
    void fetch("/api/demo/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lockedStore),
    }).catch((err) => {
      console.warn("[demo] lock snapshot failed", err);
    });
  }

  return {
    handleSave,
    handlePatch,
    applyAdvisorActions,
    startFirstRunAction,
    handleCsvImport,
    undoLastMargusWrite,
    requestDeleteHolding,
    deleteHoldingById,
    handleAddSheet,
    ensureFirstSheet,
    beginSilentScreenshotImport,
    handleRenameSheet,
    deleteSheetById,
    handleSaveCash,
    resetDemo,
    saveLock,
  };
}
