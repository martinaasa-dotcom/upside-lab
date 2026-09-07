import { ImageResponse } from "next/og";
import { loadResearchPage } from "@/lib/research/page-data";
import { plainCompanyName } from "@/lib/research/seo-copy";
import {
  isResearchTicker,
  normalizeResearchTicker,
} from "@/lib/research/universe";
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from "@/lib/seo-routes";
import { PRODUCT_NAME } from "@/lib/product";
import { currency, signedPercent } from "@/lib/format";

export const size = { width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT };
export const contentType = "image/png";
export const alt = `A company on ${PRODUCT_NAME}`;

/*
  CACHED FOR A DAY, AND `force-static` IS WHAT MAKES THAT TRUE.

  A day rather than the page's six hours because the card is a ticker, a
  name and a price, and of those only the price moves. A card is read in a
  feed hours after somebody posted the link, so a price on it is
  approximate by nature and the page behind it stamps its own.

  `revalidate` alone did not cache it, which is the part worth recording.
  The page beside this one is prerendered and gets Next's own
  `s-maxage=21600, stale-while-revalidate=31514400`; this route sits under
  a segment that prerenders nothing at build, and without `force-static`
  it was built as a dynamic route and answered `max-age=0,
  must-revalidate` in spite of its own `revalidate`. Every scrape of a
  shared link would then have re-run the renderer, which is a seven second
  render, and a link doing the rounds is exactly when that happens most.

  Setting the header in `next.config.ts` instead does nothing: the route's
  own header wins, measured. `force-static` does work, and it was measured
  the same way: cold **7.3s**, then **39ms** on every request after it,
  with the two tickers checked producing two different images, so the
  params still reach it. The renderer runs once per company per day.
*/
export const revalidate = 86400;
export const dynamic = "force-static";

/*
  The generic product card, in the two colours the mark uses. Painted with
  the font the platform provides rather than one fetched at render time: a
  card that fails to draw because a font download timed out is worse than
  one set in a system face, and this is generated on a machine nobody is
  watching.
*/
const INK = "#0a0a0a";
const GOLD = "#e8c86a";
const PAPER = "#fafafa";
const MUTED = "#8a8a8a";

export default async function Image({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker: raw } = await params;
  const ticker = normalizeResearchTicker(raw ?? "");
  const page = isResearchTicker(ticker) ? await loadResearchPage(ticker) : null;
  const facts = page?.facts ?? null;
  const name = facts ? plainCompanyName(facts) : ticker;
  const code = facts?.currency ?? "USD";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: INK,
          padding: 72,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 20,
              height: 20,
              background: GOLD,
              borderRadius: 4,
              display: "flex",
            }}
          />
          <div
            style={{
              color: PAPER,
              fontSize: 26,
              letterSpacing: 6,
              textTransform: "uppercase",
              display: "flex",
            }}
          >
            {PRODUCT_NAME}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ color: GOLD, fontSize: 74, display: "flex" }}>
            {ticker}
          </div>
          <div
            style={{
              color: PAPER,
              fontSize: 52,
              lineHeight: 1.15,
              display: "flex",
            }}
          >
            {name}
          </div>
          {facts?.price ? (
            <div
              style={{
                color: PAPER,
                fontSize: 40,
                display: "flex",
                gap: 18,
                alignItems: "baseline",
              }}
            >
              <span>{currency(facts.price, 2, code)}</span>
              {facts.changePercent !== null && (
                <span style={{ color: MUTED, fontSize: 30 }}>
                  {signedPercent(facts.changePercent)} on the day
                </span>
              )}
            </div>
          ) : null}
        </div>

        <div style={{ color: MUTED, fontSize: 26, display: "flex" }}>
          Fair value, price targets and the accounts, in plain words.
        </div>
      </div>
    ),
    size
  );
}
