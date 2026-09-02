"use client";

import type { AdvisorAction, SilentScreenshotImport } from "@/components/CcAdvisorChat";
import { CashModal } from "@/components/CashModal";
import { CommandPalette, type CommandItem } from "@/components/CommandPalette";
import { CostBasisModal, type CostBasisRow } from "@/components/CostBasisModal";
import { CsvImportModal } from "@/components/CsvImportModal";
import { HoldingModal, type HoldingFormValues } from "@/components/HoldingModal";
import { InvitePartnerModal } from "@/components/InvitePartnerModal";
import type { HoldingPatch } from "@/components/PortfolioTable";
import { RenameSheetModal } from "@/components/RenameSheetModal";
import { SnapshotsModal } from "@/components/SnapshotsModal";
import { TickerDrawer } from "@/components/TickerDrawer";
import { WidgetErrorBoundary } from "@/components/WidgetErrorBoundary";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import type { ToastKind } from "@/components/ui/Toast";
import type { CcChatContext } from "@/lib/ai/cc-advisor";
import { sheetCashBalance, tracksTradeCash } from "@/lib/cash-balance";
import { setConviction, type ConvictionMap } from "@/lib/conviction";
import type { CsvHoldingRow } from "@/lib/csv-import";
import type { ForecastYear } from "@/lib/forecast";
import type { PortfolioEoyOverrides } from "@/lib/forecast-overrides";
import type { LabBundle } from "@/lib/lab-bundle";
import { OVERVIEW_TAB_ID } from "@/lib/overview";
import type { CoveredCallRow, Holding, Portfolio, Quote } from "@/lib/types";
import dynamic from "next/dynamic";
import type { Dispatch, SetStateAction } from "react";

const CcAdvisorChat = dynamic(
  () => import("@/components/CcAdvisorChat").then((m) => m.CcAdvisorChat),
  { ssr: false }
);

export type DashboardModalsProps = {
  modalOpen: boolean;
  setModalOpen: Dispatch<SetStateAction<boolean>>;
  csvImportOpen: boolean;
  setCsvImportOpen: Dispatch<SetStateAction<boolean>>;
  inviteOpen: boolean;
  setInviteOpen: Dispatch<SetStateAction<boolean>>;
  cashModalOpen: boolean;
  setCashModalOpen: Dispatch<SetStateAction<boolean>>;
  creatingSheet: boolean;
  setCreatingSheet: Dispatch<SetStateAction<boolean>>;
  renameTarget: { id: string; name: string } | null;
  setRenameTarget: Dispatch<SetStateAction<{ id: string; name: string } | null>>;
  confirmDelete:
    | { kind: "holding"; id: string; label: string }
    | { kind: "sheet"; id: string; label: string }
    | null;
  setConfirmDelete: Dispatch<
    SetStateAction<
      | { kind: "holding"; id: string; label: string }
      | { kind: "sheet"; id: string; label: string }
      | null
    >
  >;
  snapshotsOpen: boolean;
  setSnapshotsOpen: Dispatch<SetStateAction<boolean>>;
  cmdOpen: boolean;
  setCmdOpen: Dispatch<SetStateAction<boolean>>;
  costBasisOpen: boolean;
  setCostBasisOpen: Dispatch<SetStateAction<boolean>>;
  costBasisRows: CostBasisRow[];
  setCostBasisRows: Dispatch<SetStateAction<CostBasisRow[]>>;
  drawerTicker: string | null;
  setDrawerTicker: Dispatch<SetStateAction<string | null>>;
  inviteSheet: Portfolio | null;
  activePortfolio: Portfolio | null;
  margusPortfolio: Portfolio | null;
  holdings: Holding[];
  quotes: Record<string, Quote>;
  hideOptionsUI: boolean;
  isMetaTab: boolean;
  eoyOverrides: PortfolioEoyOverrides;
  convictionMap: ConvictionMap;
  drawerCoveredCallRow: CoveredCallRow | null;
  commandItems: CommandItem[];
  silentScreenshot: SilentScreenshotImport | null;
  screenshotPending: boolean;
  setSilentScreenshot: Dispatch<SetStateAction<SilentScreenshotImport | null>>;
  setScreenshotPending: Dispatch<SetStateAction<boolean>>;
  margusExpandSignal: number;
  setMargusExpandSignal: Dispatch<SetStateAction<number>>;
  /** The address is `/margus`: Home with the panel open. */
  margusAddressed: boolean;
  onMargusOpenChange: (open: boolean) => void;
  margusContext: CcChatContext;
  toast: (message: string, kind?: ToastKind) => void;
  handleSave: (batch: HoldingFormValues[]) => void;
  handleCsvImport: (
    input: { rows: CsvHoldingRow[]; cash: number | null; replace: boolean },
    into?: Portfolio
  ) => void;
  handleSaveCash: (cash: number) => void;
  handleAddSheet: (
    name: string,
    opts?: { silent?: boolean }
  ) => Promise<Portfolio | undefined>;
  handleRenameSheet: (id: string, name: string) => void;
  deleteSheetById: (id: string) => Promise<boolean>;
  deleteHoldingById: (id: string) => boolean;
  handlePatch: (patch: HoldingPatch) => boolean;
  applyAdvisorActions: (actions: AdvisorAction[], into?: Portfolio) => void;
  commitEoyPrice: (ticker: string, year: ForecastYear, price: number) => void;
  patchLab: (patch: Partial<LabBundle>) => void;
  loadPortfolios: (opts?: { silent?: boolean; retry?: boolean }) => Promise<void>;
  onCreatedAwayFromBook?: (created: Portfolio) => void;
};

export function DashboardModals({
  modalOpen,
  setModalOpen,
  csvImportOpen,
  setCsvImportOpen,
  inviteOpen,
  setInviteOpen,
  cashModalOpen,
  setCashModalOpen,
  creatingSheet,
  setCreatingSheet,
  renameTarget,
  setRenameTarget,
  confirmDelete,
  setConfirmDelete,
  snapshotsOpen,
  setSnapshotsOpen,
  cmdOpen,
  setCmdOpen,
  costBasisOpen,
  setCostBasisOpen,
  costBasisRows,
  setCostBasisRows,
  drawerTicker,
  setDrawerTicker,
  inviteSheet,
  activePortfolio,
  margusPortfolio,
  holdings,
  quotes,
  hideOptionsUI,
  isMetaTab,
  eoyOverrides,
  convictionMap,
  drawerCoveredCallRow,
  commandItems,
  silentScreenshot,
  screenshotPending,
  setSilentScreenshot,
  setScreenshotPending,
  margusExpandSignal,
  setMargusExpandSignal,
  margusAddressed,
  onMargusOpenChange,
  margusContext,
  toast,
  handleSave,
  handleCsvImport,
  handleSaveCash,
  handleAddSheet,
  handleRenameSheet,
  deleteSheetById,
  deleteHoldingById,
  handlePatch,
  applyAdvisorActions,
  commitEoyPrice,
  patchLab,
  loadPortfolios,
  onCreatedAwayFromBook,
}: DashboardModalsProps) {
  return (
    <>
      <HoldingModal
        open={modalOpen}
        portfolioName={inviteSheet?.name ?? ""}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        hideCallPct={hideOptionsUI}
      />

      <CsvImportModal
        open={csvImportOpen}
        portfolioName={inviteSheet?.name ?? ""}
        onClose={() => setCsvImportOpen(false)}
        onImport={handleCsvImport}
        hideCallPct={hideOptionsUI}
      />

      {inviteSheet && (
        <InvitePartnerModal
          open={inviteOpen}
          portfolioId={inviteSheet.id}
          portfolioName={inviteSheet.name}
          onClose={() => setInviteOpen(false)}
        />
      )}

      <CashModal
        open={cashModalOpen}
        portfolioName={activePortfolio?.name ?? ""}
        initialCash={
          activePortfolio ? sheetCashBalance(activePortfolio) : 0
        }
        paperCash={activePortfolio ? tracksTradeCash(activePortfolio) : false}
        onClose={() => setCashModalOpen(false)}
        onSave={handleSaveCash}
      />

      <RenameSheetModal
        open={Boolean(renameTarget) || creatingSheet}
        initialName={creatingSheet ? "" : renameTarget?.name ?? ""}
        title={creatingSheet ? "New portfolio" : undefined}
        confirmLabel={creatingSheet ? "Add" : undefined}
        onClose={() => {
          setRenameTarget(null);
          setCreatingSheet(false);
        }}
        onSave={(name) => {
          if (creatingSheet) {
            setCreatingSheet(false);
            void handleAddSheet(name).then((created) => {
              // Created from Circle or Fund: go to the sheet, or the new
              // portfolio is only reachable by finding it yourself.
              if (created) onCreatedAwayFromBook?.(created);
            });
            return;
          }
          if (!renameTarget) return;
          void handleRenameSheet(renameTarget.id, name);
        }}
      />

      <ConfirmModal
        open={Boolean(confirmDelete)}
        title={
          confirmDelete?.kind === "sheet"
            ? "Delete this portfolio?"
            : "Delete holding?"
        }
        body={
          confirmDelete?.kind === "sheet"
            ? `Delete “${confirmDelete.label}” and all of its holdings? We take a backup save first.`
            : `Remove ${confirmDelete?.label ?? "this holding"} from this portfolio?`
        }
        confirmLabel="Delete"
        destructive
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return false;
          if (confirmDelete.kind === "sheet") {
            return deleteSheetById(confirmDelete.id);
          }
          return deleteHoldingById(confirmDelete.id);
        }}
      />

      <SnapshotsModal
        open={snapshotsOpen}
        onClose={() => setSnapshotsOpen(false)}
        activePortfolioId={
          !isMetaTab ? activePortfolio?.id ?? null : null
        }
        activePortfolioName={
          !isMetaTab ? activePortfolio?.name ?? null : null
        }
        onRestored={(mode) => {
          toast(
            mode === "sheet"
              ? "Portfolio put back to how it looked in that save"
              : "All portfolios put back to how they looked in that save",
            "success"
          );
          void loadPortfolios({ silent: true });
        }}
      />

      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        items={commandItems}
      />

      <CostBasisModal
        open={costBasisOpen}
        rows={costBasisRows}
        onChangeRow={(ticker, buyPrice) =>
          setCostBasisRows((prev) =>
            prev.map((r) =>
              r.ticker === ticker ? { ...r, buyPrice } : r
            )
          )
        }
        onClose={() => setCostBasisOpen(false)}
        onApply={async () => {
          if (!activePortfolio) {
            setCostBasisOpen(false);
            return;
          }
          for (const row of costBasisRows) {
            const h = holdings.find(
              (x) =>
                x.portfolio_id === activePortfolio.id &&
                x.ticker.toUpperCase() === row.ticker.toUpperCase()
            );
            if (!h) continue;
            await handlePatch({
              id: h.id,
              buy_price: row.buyPrice,
            });
          }
          setCostBasisOpen(false);
          toast("Buy prices saved", "success");
        }}
      />

      <WidgetErrorBoundary name="Ticker">
      <TickerDrawer
        open={Boolean(drawerTicker)}
        ticker={drawerTicker}
        spot={drawerTicker ? quotes[drawerTicker]?.price ?? null : null}
        shares={
          drawerTicker
            ? holdings
                .filter((h) => h.ticker === drawerTicker)
                .reduce((s, h) => s + h.shares, 0)
            : null
        }
        buyPrice={
          drawerTicker
            ? (() => {
                const rows = holdings.filter((h) => h.ticker === drawerTicker);
                const sh = rows.reduce((s, h) => s + h.shares, 0);
                const cost = rows.reduce(
                  (s, h) => s + h.shares * h.buy_price,
                  0
                );
                const avg = sh > 0 ? cost / sh : NaN;
                return Number.isFinite(avg) && avg > 0 ? avg : null;
              })()
            : null
        }
        sparkline={
          drawerTicker ? quotes[drawerTicker]?.sparkline : undefined
        }
        todayChangePct={
          drawerTicker ? quotes[drawerTicker]?.changePercent ?? null : null
        }
        conviction={
          drawerTicker
            ? convictionMap[drawerTicker.toUpperCase()] ?? null
            : null
        }
        overrides={eoyOverrides}
        coveredCallRow={drawerCoveredCallRow}
        onSetEoyPrice={commitEoyPrice}
        onConviction={(level, thesis) => {
          if (!drawerTicker) return;
          patchLab({
            conviction: setConviction(convictionMap, drawerTicker, {
              level,
              thesis,
            }),
          });
        }}
        onClose={() => setDrawerTicker(null)}
        onAskMargus={() => {
          setMargusExpandSignal((n) => n + 1);
        }}
      />
      </WidgetErrorBoundary>

      <WidgetErrorBoundary name="Margus">
      <CcAdvisorChat
        key={margusPortfolio?.id ?? OVERVIEW_TAB_ID}
        portfolioId={margusPortfolio?.id ?? OVERVIEW_TAB_ID}
        expandSignal={margusExpandSignal}
        addressed={margusAddressed}
        onOpenChange={onMargusOpenChange}
        screenshotImport={silentScreenshot}
        screenshotPending={screenshotPending}
        onScreenshotImportConsumed={(id) => {
          setSilentScreenshot((cur) => (cur?.id === id ? null : cur));
          setScreenshotPending(false);
        }}
        onSuggestCsv={() => setCsvImportOpen(true)}
        onApplyActions={applyAdvisorActions}
        context={margusContext}
      />
      </WidgetErrorBoundary>
    </>
  );
}
