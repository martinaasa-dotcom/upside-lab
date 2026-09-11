/**
 * One column for every signed-in page. Header, banners, main, and the
 * book dock all use this, so Book → Fund → Communities does not move
 * the side gutters or the page pad.
 */
export const PAGE_MAX_CLASS = "max-w-[1200px]";
/**
 * 16px on a phone, 24px from `sm` up.
 *
 * A flat 24px was 48px of the 390px a phone actually has — an eighth of
 * the screen spent on margin before a card's own padding starts, which is
 * where several of the "it bleeds outside the box" readings came from:
 * a two-up score cell was left with about 118px of content. It also put
 * the page column on a different edge from the phone chrome, which sits at
 * 16px, so the top bar's wordmark and the dock never lined up with the
 * cards between them. Both are the same 8px.
 */
export const PAGE_GUTTER_CLASS = "px-4 sm:px-6";
export const PAGE_COLUMN_CLASS = `mx-auto w-full min-w-0 ${PAGE_MAX_CLASS} ${PAGE_GUTTER_CLASS}`;

export const PAGE_FRAME_CLASS =
  "page-frame flex min-h-dvh flex-col bg-background text-foreground [--dock-pad:10.5rem] md:[--dock-pad:11.5rem]";

/**
 * Desktop chrome: header row 3rem + status row 2.25rem + the strip's own
 * `border-b` = **85px, not 84**. The spacer reserves that height in the
 * document, so it and the chrome's two rows have to move together.
 *
 * Written out as arithmetic rather than a rounded number because the
 * hairline is easy to forget, and once was — at a flat `h-21` the page's top
 * pixel row sat under the chrome's bottom edge. Written literally rather
 * than composed from a constant because Tailwind extracts classes by
 * scanning source text, so a template literal yields a class that never gets
 * a rule and the spacer silently collapses to zero.
 */
export const PAGE_CHROME_SPACER_CLASS =
  "hidden h-[calc(5.25rem_+_1px)] shrink-0 md:block";

/**
 * Top pad only. Bottom pad is the live dock height. A shorthand
 * vertical pad would wipe that clearance and hide the last section.
 *
 * The gap between panels is the loudest spacing number in the product,
 * because it is the one a reader meets over and over on the way down a
 * room. At a flat 24px it was the same distance as a panel's own inside
 * padding, so a panel's last line sat as far from the next panel's first
 * line as it did from its own edge, and the boxes stopped reading as
 * separate things: a room read as one long ribbon of text rather than as
 * a stack of answers. Separation between groups has to beat separation
 * inside one, or the grouping is not doing any work.
 *
 * 32px on a phone and 40px from `sm` up, against a panel's own 20/28px of
 * inside padding, so the rule holds at both widths. It is vertical only,
 * so it costs no width on the phone, which is the one budget that is
 * actually tight (see PAGE_GUTTER_CLASS above).
 */
export const PAGE_MAIN_CLASS = `${PAGE_COLUMN_CLASS} flex flex-1 flex-col gap-8 pt-6 pb-[var(--dock-pad)] sm:gap-10 sm:pt-8`;
