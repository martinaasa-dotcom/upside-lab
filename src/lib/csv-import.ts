/**
 * CSV holdings import — lets anyone onboard a portfolio from a spreadsheet
 * export without needing a broker screenshot for Margus to read. Deliberately
 * dependency-free (no papaparse) since the shape is simple: a header row plus
 * ticker/shares/price columns, tolerant of common column-name variations.
 */
import { isSafePositiveMoney, isSafeShares, isSafeSignedMoney } from "@/lib/input-guard";
import { resolveImportTicker } from "@/lib/ticker";

export type CsvHoldingRow = {
  ticker: string;
  shares: number;
  buyPrice: number;
  callPct?: number;
};

export type CsvSkippedRow = {
  line: number;
  reason: string;
  raw: string;
};

export type CsvImportResult = {
  rows: CsvHoldingRow[];
  /** Cash balance in USD if a Cash column or CASH row was present. */
  cash: number | null;
  skipped: CsvSkippedRow[];
};

const CASH_KEYS = new Set(["CASH", "CASH BALANCE", "CASHBALANCE"]);

export type CsvDialect = {
  /** The single character separating cells in this file. */
  delimiter: "," | ";" | "\t";
  /**
   * True when a comma in a number means the decimal point, not thousands.
   *
   * This is not guesswork. Excel writes `;` (or a tab) precisely because
   * the machine's locale already uses `,` as its decimal separator -- it
   * cannot use `,` for both jobs in one file. So the delimiter tells us
   * which convention the numbers inside follow, which is the only reliable
   * signal available in a bare CSV.
   */
  commaIsDecimal: boolean;
};

/**
 * Work out how one file is punctuated, from its header row.
 *
 * Treating `,` `;` and tab as interchangeable separators -- which this used
 * to do -- quietly destroys European exports: `AAPL;10;150,25` splits into
 * four cells, the price column reads `150`, and the 25 cents are gone with
 * no error to notice. One file uses one delimiter; find it and use only it.
 */
export function detectCsvDialect(headerLine: string): CsvDialect {
  const count = (ch: string) => headerLine.split(ch).length - 1;
  const semis = count(";");
  const tabs = count("\t");
  const commas = count(",");

  if (semis > 0 && semis >= tabs && semis >= commas) {
    return { delimiter: ";", commaIsDecimal: true };
  }
  if (tabs > 0 && tabs >= commas) {
    return { delimiter: "\t", commaIsDecimal: true };
  }
  return { delimiter: ",", commaIsDecimal: false };
}

/** Minimal RFC4180-ish line splitter: handles quoted fields, "" escapes. */
function parseCsvLine(line: string, delimiter: string = ","): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function normalizeHeaderCell(cell: string): string {
  return cell.trim().toLowerCase().replace(/[^a-z%]/g, "");
}

function findColumn(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normalizeHeaderCell);
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * Read a number written by a human in either convention.
 *
 * The old version stripped every comma and then called `Number`, which is
 * correct for `1,234.56` and silently, catastrophically wrong for the
 * European `1.234,56` -- it became `1.23456`, off by a factor of a
 * thousand, accepted without a murmur. `1 234,56` became `123456`. Nothing
 * was skipped and nothing was flagged, so a buy price of 1,234.56 euros
 * landed as 1.23 and the position showed a six-figure percentage gain that
 * then fed the Sunday letter, Pulse, and the position-size arithmetic.
 *
 * That is the worst failure shape available to an import: not a rejection
 * the person can see and fix, but a number that looks plausible and is not
 * theirs. This product is Estonian and its CSV import exists to onboard
 * people who are not Martin, so European punctuation is the common case,
 * not the exotic one.
 *
 * @param commaIsDecimal What the file's delimiter implies (see CsvDialect).
 *   Only consulted when a value is genuinely ambiguous.
 */
function parseNumber(
  raw: string | undefined,
  commaIsDecimal = false
): number | null {
  if (raw == null) return null;

  // Currency marks and every flavour of space, including the non-breaking
  // and narrow no-break spaces European exports use for thousands.
  let t = raw.replace(/[$€£¥]/g, "").replace(/[\s\u00A0\u202F\u2009']/g, "").trim();
  if (!t) return null;

  let negative = false;
  // Accounting style: (1 234,56) means negative.
  if (/^\(.*\)$/.test(t)) {
    negative = true;
    t = t.slice(1, -1);
  }
  if (t.startsWith("-")) {
    negative = true;
    t = t.slice(1);
  } else if (t.startsWith("+")) {
    t = t.slice(1);
  }
  if (!/^[0-9.,]*$/.test(t) || !/[0-9]/.test(t)) return null;

  const lastDot = t.lastIndexOf(".");
  const lastComma = t.lastIndexOf(",");
  let normalized: string;

  if (lastDot >= 0 && lastComma >= 0) {
    // Both present: whichever comes last is the decimal point. Unambiguous.
    const decimalSep = lastDot > lastComma ? "." : ",";
    const groupSep = decimalSep === "." ? "," : ".";
    normalized = t.split(groupSep).join("").replace(decimalSep, ".");
  } else if (lastComma >= 0) {
    const parts = t.split(",");
    const tail = parts[parts.length - 1]!;
    if (parts.length > 2) {
      // 1,234,567 -- repeated separators can only be grouping.
      normalized = parts.join("");
    } else if (tail.length === 3 && parts[0]!.length > 0 && !commaIsDecimal) {
      /*
       * "1,234" is genuinely ambiguous: 1234 to an American, 1.234 to a
       * European, and no amount of staring at the string settles it. The
       * file's own delimiter is the tiebreaker -- a `;`-delimited file was
       * written by a machine whose decimal separator is `,`. Absent that
       * signal, three trailing digits is the thousands convention.
       */
      normalized = parts.join("");
    } else {
      normalized = `${parts[0]}.${tail}`;
    }
  } else if (lastDot >= 0) {
    const parts = t.split(".");
    // 1.234.567 -- repeated dots can only be grouping.
    normalized = parts.length > 2 ? parts.join("") : t;
  } else {
    normalized = t;
  }

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

const TICKER_ALIASES = ["ticker", "symbol", "stock", "asset", "name"];
const SHARES_ALIASES = [
  "shares",
  "quantity",
  "qty",
  "units",
  "amount",
  "coins",
  "coin",
];
const BUY_PRICE_ALIASES = [
  "buyprice",
  "buy",
  "avgprice",
  "avgbuyprice",
  "averageprice",
  "averagecost",
  "costbasis",
  "cost",
  "price",
];
const CALL_PCT_ALIASES = ["callpct", "call%", "targetcallpct", "targetcall%"];
const CASH_COL_ALIASES = ["cash", "cashbalance"];

/**
 * Fold a second lot of a ticker into the first instead of replacing it.
 *
 * Broker exports list purchase lots, not positions: buy AAPL twice and the
 * file has two AAPL rows. `byTicker.set(...)` kept only the last one, so
 * someone importing 100 shares at $50 and 100 at $150 ended up owning 100
 * at $150 -- half their position gone, the cost basis wrong, and not a word
 * about it in the skipped list.
 *
 * Summing the shares and taking the share-weighted average price is both
 * what the person meant and exactly what the app displays that field as:
 * the average price paid.
 */
function mergeLot(existing: CsvHoldingRow, incoming: CsvHoldingRow): CsvHoldingRow {
  const shares = existing.shares + incoming.shares;
  if (!(shares > 0)) return incoming;
  return {
    ticker: existing.ticker,
    shares,
    buyPrice:
      (existing.buyPrice * existing.shares + incoming.buyPrice * incoming.shares) /
      shares,
    // Keep whichever lot actually specified a target; a later blank must
    // not erase an earlier answer.
    callPct: incoming.callPct ?? existing.callPct,
  };
}

/**
 * Parse CSV text into holdings rows. Header row is required; column order
 * and exact naming are flexible (Ticker/Symbol, Shares/Quantity,
 * "Buy Price"/"Avg Cost"/"Cost Basis", optional "Call %", optional "Cash").
 * A row whose ticker is literally CASH is treated as a cash balance instead
 * of a holding, same convention as the screenshot-import path.
 */
export function parseHoldingsCsv(text: string): CsvImportResult {
  const lines = text
    .split(/\r\n|\n|\r/)
    .map((l) => l)
    .filter((l) => l.trim().length > 0);

  const result: CsvImportResult = { rows: [], cash: null, skipped: [] };
  if (lines.length === 0) return result;

  const dialect = detectCsvDialect(lines[0]!);
  const header = parseCsvLine(lines[0]!, dialect.delimiter);
  const num = (cell: string | undefined) => parseNumber(cell, dialect.commaIsDecimal);
  const tickerCol = findColumn(header, TICKER_ALIASES);
  const sharesCol = findColumn(header, SHARES_ALIASES);
  const buyCol = findColumn(header, BUY_PRICE_ALIASES);
  const callCol = findColumn(header, CALL_PCT_ALIASES);
  const cashCol = findColumn(header, CASH_COL_ALIASES);

  if (tickerCol === -1 || sharesCol === -1 || buyCol === -1) {
    result.skipped.push({
      line: 1,
      raw: lines[0]!,
      reason:
        "Couldn't find Ticker, Shares, and Buy Price columns in the header row",
    });
    return result;
  }

  const byTicker = new Map<string, CsvHoldingRow>();
  /** The Cash column's value, taken once rather than once per row. */
  let cashColumnValue: number | null = null;
  /** CASH rows, which genuinely do add up. */
  let cashRowTotal: number | null = null;

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]!;
    const cells = parseCsvLine(raw, dialect.delimiter);
    const tickerRaw = (cells[tickerCol] ?? "").trim();
    if (!tickerRaw) continue;

    if (cashCol >= 0) {
      /*
       * A Cash column carries the account's cash balance, and a broker
       * export repeats it on every row. Adding it up once per holding --
       * which is what this did -- turned 1,000 into 3,000 for a
       * three-position book, silently.
       *
       * So the first value wins. A later row that disagrees is reported
       * rather than quietly folded in, because at that point the file means
       * something this importer does not understand and guessing is how the
       * original bug happened.
       */
      const cashHere = num(cells[cashCol]);
      if (cashHere != null && isSafeSignedMoney(cashHere)) {
        if (cashColumnValue == null) {
          cashColumnValue = cashHere;
        } else if (cashColumnValue !== cashHere) {
          result.skipped.push({
            line: i + 1,
            raw,
            reason: `Cash column says ${cashHere} here but ${cashColumnValue} earlier. Kept the first one.`,
          });
        }
      }
    }

    if (CASH_KEYS.has(tickerRaw.toUpperCase())) {
      const amount = num(cells[buyCol]) ?? num(cells[sharesCol]);
      if (amount != null && isSafeSignedMoney(amount)) {
        cashRowTotal = (cashRowTotal ?? 0) + amount;
      }
      continue;
    }

    const ticker = resolveImportTicker(tickerRaw);
    if (!ticker) {
      result.skipped.push({ line: i + 1, raw, reason: "Don't recognize that ticker" });
      continue;
    }

    const shares = num(cells[sharesCol]);
    if (!(shares != null && isSafeShares(shares))) {
      result.skipped.push({
        line: i + 1,
        raw,
        reason: "Share count is missing, isn't a number, or is enormous",
      });
      continue;
    }

    const buyPrice = num(cells[buyCol]);
    if (!(buyPrice != null && isSafePositiveMoney(buyPrice))) {
      result.skipped.push({
        line: i + 1,
        raw,
        reason:
          "Buy price is missing, isn't a number, or is enormous. Put the price you paid per share in that column, like 85.10",
      });
      continue;
    }

    const callRaw = callCol >= 0 ? num(cells[callCol]) : null;
    const callPct =
      callRaw != null && callRaw > 0
        ? callRaw > 1
          ? callRaw / 100
          : callRaw
        : undefined;

    const incoming: CsvHoldingRow = { ticker, shares, buyPrice, callPct };
    const existing = byTicker.get(ticker);
    byTicker.set(ticker, existing ? mergeLot(existing, incoming) : incoming);
  }

  if (cashColumnValue != null || cashRowTotal != null) {
    result.cash = (cashColumnValue ?? 0) + (cashRowTotal ?? 0);
  }

  result.rows = [...byTicker.values()];
  return result;
}

/** Downloadable starter template — matches the flexible column names above. */
export const HOLDINGS_CSV_TEMPLATE = `Ticker,Shares,Buy Price,Call %
AAPL,10,150.25,15
MSFT,5,310.10,12
CASH,,2500,
`;

/**
 * Paste box: one holding per line.
 * `NBIS 500 85.10` or `NBIS, 500, 85.10`.
 *
 * The buy price is **required**: a line without one is skipped, and the
 * skip reason names the fix rather than only the problem. This comment
 * used to promise a 0.01 placeholder so the row could land and the cost
 * be fixed later — nothing in `parseHoldingsPaste` has ever done that,
 * and it stays that way on purpose: a 0.01 basis reads as a +1,000,000%
 * gain, which then feeds the Sunday letter's trim suggestions, the
 * position-size arithmetic and Pulse. Skipping the line and saying what
 * to type is the honest failure.
 */
export function parseHoldingsPaste(text: string): CsvImportResult {
  const result: CsvImportResult = { rows: [], cash: null, skipped: [] };
  const lines = text
    .split(/\r\n|\n|\r/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const byTicker = new Map<string, CsvHoldingRow>();

  lines.forEach((raw, i) => {
    const cells = raw.includes(",")
      ? parseCsvLine(raw)
      : raw.split(/\s+/);
    const tickerRaw = (cells[0] ?? "").trim();
    if (!tickerRaw) return;
    if (CASH_KEYS.has(tickerRaw.toUpperCase())) {
      const amount = parseNumber(cells[1]) ?? parseNumber(cells[2]);
      // Same ceiling the CSV path applies. Without it this route accepted a
      // cash balance the rest of the app treats as impossible.
      if (amount != null && isSafeSignedMoney(amount)) {
        result.cash = (result.cash ?? 0) + amount;
      }
      return;
    }
    const ticker = resolveImportTicker(tickerRaw);
    if (!ticker) {
      result.skipped.push({ line: i + 1, raw, reason: "Don't recognize that ticker" });
      return;
    }
    const shares = parseNumber(cells[1]);
    if (!(shares != null && isSafeShares(shares))) {
      result.skipped.push({
        line: i + 1,
        raw,
        reason:
          "Need how many shares you own, right after the ticker. Like: NBIS 500 85.10",
      });
      return;
    }
    const buyPrice = parseNumber(cells[2]);
    if (!(buyPrice != null && isSafePositiveMoney(buyPrice))) {
      result.skipped.push({
        line: i + 1,
        raw,
        reason:
          "Need the price you paid per share, after the share count. Like: NBIS 500 85.10",
      });
      return;
    }
    const incoming: CsvHoldingRow = { ticker, shares, buyPrice };
    const existing = byTicker.get(ticker);
    byTicker.set(ticker, existing ? mergeLot(existing, incoming) : incoming);
  });

  result.rows = [...byTicker.values()];
  return result;
}

export function downloadHoldingsCsvTemplate() {
  if (typeof window === "undefined") return;
  const blob = new Blob([HOLDINGS_CSV_TEMPLATE], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "upside-holdings-template.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
