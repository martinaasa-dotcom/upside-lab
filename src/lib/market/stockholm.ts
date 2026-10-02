/**
 * Nasdaq Stockholm listings people actually hold, so a search box finds
 * them by the name a Swede would type.
 *
 * Yahoo's own search is weak here: "Investor" answers with US mutual
 * funds, "H&M" answers with currency pairs, and "VOLV B", which is how
 * Avanza and Nordnet print a share class, answers with nothing. Every
 * symbol below was checked against Yahoo's quote endpoint on 2026-10-02
 * and quotes in SEK. It is a list of listings, not of opinions: nothing is
 * on it because anybody rates the company, only because it is widely held.
 *
 * Share classes are spelt the way Yahoo spells them (VOLV-B.ST). The bare
 * class form (VOLV-B, or VOLV B with a space) is mapped to the listing by
 * `stockholmFromClassTicker`; a bare single-class stem (SAND, BOL) is
 * deliberately NOT mapped, because SAND is also a US ticker and a quote
 * already falls back to .ST when the US listing is empty.
 */
export type StockholmListing = {
  symbol: string;
  name: string;
  /** Extra words somebody might search for (company names, nicknames). */
  aliases?: string[];
};

export const STOCKHOLM_LISTINGS: readonly StockholmListing[] = [
  { symbol: "AAK.ST", name: "AAK" },
  { symbol: "ABB.ST", name: "ABB" },
  { symbol: "ADDT-B.ST", name: "Addtech B" },
  { symbol: "ALFA.ST", name: "Alfa Laval" },
  { symbol: "ALIV-SDB.ST", name: "Autoliv SDB" },
  { symbol: "ASSA-B.ST", name: "Assa Abloy B" },
  { symbol: "AZN.ST", name: "AstraZeneca" },
  { symbol: "ATCO-A.ST", name: "Atlas Copco A" },
  { symbol: "ATCO-B.ST", name: "Atlas Copco B" },
  { symbol: "ATRLJ-B.ST", name: "Atrium Ljungberg B" },
  { symbol: "AXFO.ST", name: "Axfood", aliases: ["Willys", "Hemkop"] },
  { symbol: "AZA.ST", name: "Avanza Bank" },
  { symbol: "BALD-B.ST", name: "Balder B" },
  { symbol: "BEIJ-B.ST", name: "Beijer Ref B" },
  { symbol: "BILL.ST", name: "Billerud" },
  { symbol: "BOL.ST", name: "Boliden" },
  { symbol: "CAST.ST", name: "Castellum" },
  { symbol: "CLAS-B.ST", name: "Clas Ohlson B" },
  { symbol: "ELUX-A.ST", name: "Electrolux A" },
  { symbol: "ELUX-B.ST", name: "Electrolux B" },
  { symbol: "EMBRAC-B.ST", name: "Embracer B" },
  { symbol: "EPI-A.ST", name: "Epiroc A" },
  { symbol: "EPI-B.ST", name: "Epiroc B" },
  { symbol: "EQT.ST", name: "EQT" },
  { symbol: "ERIC-A.ST", name: "Ericsson A" },
  { symbol: "ERIC-B.ST", name: "Ericsson B" },
  { symbol: "ESSITY-B.ST", name: "Essity B" },
  { symbol: "EVO.ST", name: "Evolution" },
  { symbol: "FABG.ST", name: "Fabege" },
  { symbol: "GETI-B.ST", name: "Getinge B" },
  { symbol: "HEXA-B.ST", name: "Hexagon B" },
  { symbol: "HM-B.ST", name: "H&M B", aliases: ["Hennes", "Hennes & Mauritz", "HM"] },
  { symbol: "HMS.ST", name: "HMS Networks" },
  { symbol: "HOLM-B.ST", name: "Holmen B" },
  { symbol: "HPOL-B.ST", name: "Hexpol B" },
  { symbol: "HUSQ-B.ST", name: "Husqvarna B" },
  { symbol: "INDT.ST", name: "Indutrade" },
  { symbol: "INDU-A.ST", name: "Industrivarden A", aliases: ["Industrivärden"] },
  { symbol: "INDU-C.ST", name: "Industrivarden C", aliases: ["Industrivärden"] },
  { symbol: "INVE-A.ST", name: "Investor A" },
  { symbol: "INVE-B.ST", name: "Investor B" },
  { symbol: "INWI.ST", name: "Inwido" },
  { symbol: "KINV-B.ST", name: "Kinnevik B" },
  { symbol: "LATO-B.ST", name: "Latour B" },
  { symbol: "LIFCO-B.ST", name: "Lifco B" },
  { symbol: "LUND-B.ST", name: "Lundbergforetagen B", aliases: ["Lundbergs"] },
  { symbol: "MTRS.ST", name: "Munters" },
  { symbol: "NCC-B.ST", name: "NCC B" },
  { symbol: "NDA-SE.ST", name: "Nordea" },
  { symbol: "NIBE-B.ST", name: "NIBE B" },
  { symbol: "NOLA-B.ST", name: "Nolato B" },
  { symbol: "PEAB-B.ST", name: "Peab B" },
  { symbol: "SAAB-B.ST", name: "Saab B" },
  { symbol: "SAGA-B.ST", name: "Sagax B" },
  { symbol: "SAGA-D.ST", name: "Sagax D" },
  { symbol: "SAND.ST", name: "Sandvik" },
  { symbol: "SAVE.ST", name: "Nordnet" },
  { symbol: "SBB-B.ST", name: "SBB B", aliases: ["Samhallsbyggnadsbolaget"] },
  { symbol: "SCA-B.ST", name: "SCA B" },
  { symbol: "SEB-A.ST", name: "SEB A" },
  { symbol: "SEB-C.ST", name: "SEB C" },
  { symbol: "SECU-B.ST", name: "Securitas B" },
  { symbol: "SHB-A.ST", name: "Handelsbanken A" },
  { symbol: "SHB-B.ST", name: "Handelsbanken B" },
  { symbol: "SINCH.ST", name: "Sinch" },
  { symbol: "SKA-B.ST", name: "Skanska B" },
  { symbol: "SKF-B.ST", name: "SKF B" },
  { symbol: "SKIS-B.ST", name: "SkiStar B" },
  { symbol: "SOBI.ST", name: "Sobi", aliases: ["Swedish Orphan Biovitrum"] },
  { symbol: "SSAB-A.ST", name: "SSAB A" },
  { symbol: "SSAB-B.ST", name: "SSAB B" },
  { symbol: "STE-R.ST", name: "Stora Enso R" },
  { symbol: "SWEC-B.ST", name: "Sweco B" },
  { symbol: "SWED-A.ST", name: "Swedbank A" },
  { symbol: "SYSR.ST", name: "Systemair" },
  { symbol: "TEL2-B.ST", name: "Tele2 B" },
  { symbol: "TELIA.ST", name: "Telia" },
  { symbol: "THULE.ST", name: "Thule" },
  { symbol: "TREL-B.ST", name: "Trelleborg B" },
  { symbol: "VITR.ST", name: "Vitrolife" },
  { symbol: "VOLCAR-B.ST", name: "Volvo Cars B" },
  { symbol: "VOLV-A.ST", name: "Volvo A" },
  { symbol: "VOLV-B.ST", name: "Volvo B" },
  { symbol: "WALL-B.ST", name: "Wallenstam B" },
];

const BY_STEM = new Map(
  STOCKHOLM_LISTINGS.map((row) => [row.symbol.slice(0, -3), row])
);

/**
 * VOLV-B or VOLV B (Avanza, Nordnet) → VOLV-B.ST, for share-class forms
 * only. BRK-B is not on the list, so a US class ticker is left alone.
 */
export function stockholmFromClassTicker(raw: string): string | null {
  const t = raw
    .trim()
    .toUpperCase()
    .replace(/^([A-Z0-9]+)\s+([A-Z]{1,3})$/, "$1-$2");
  if (!t.includes("-")) return null;
  return BY_STEM.get(t)?.symbol ?? null;
}

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

function words(text: string): string[] {
  return fold(text).split(/[^A-Z0-9&]+/).filter(Boolean);
}

/** Stockholm listings matching what somebody typed, best first. */
export function stockholmSuggestions(
  query: string,
  exclude: Set<string> = new Set(),
  limit = 6
): { symbol: string; name: string }[] {
  const q = fold(query.trim()).replace(/\s+/g, " ");
  if (q.length < 2) return [];
  const asClass = stockholmFromClassTicker(query);
  const scored: { row: StockholmListing; score: number }[] = [];
  for (const row of STOCKHOLM_LISTINGS) {
    if (exclude.has(row.symbol)) continue;
    const stem = row.symbol.slice(0, -3);
    const names = [row.name, ...(row.aliases ?? [])].map(fold);
    let score = 0;
    if (asClass === row.symbol || row.symbol === q) score = 100;
    else if (stem === q) score = 95;
    else if (names.some((n) => n === q)) score = 90;
    else if (names.some((n) => n.startsWith(q))) score = 80;
    else if (names.some((n) => words(n).some((w) => w.startsWith(q)))) score = 70;
    else if (q.length >= 3 && stem.startsWith(q)) score = 60;
    if (score > 0) scored.push({ row, score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row }) => ({ symbol: row.symbol, name: row.name }));
}
