import { DB_ERROR_MESSAGE } from "@/lib/db-error";

/**
 * Turn an API or thrown error into a sentence a person would say.
 * Snake_case keys and "X required" never reach a toast or banner.
 */

const KNOWN: Record<string, string> = {
  "portfolio_id required": "Pick a portfolio first.",
  "portfolioId required": "Pick a portfolio first.",
  "id required": "Something went missing. Try again.",
  "name required": "Give it a name first.",
  "cash or holdings required": "Add cash or at least one holding.",
  "token required": "That invite link is missing a code.",
  "Days must be at least 1.": "Put a number of days, or leave it empty to keep the link live.",
  "Those email addresses do not look right.":
    "Those email addresses do not look right.",
  "Keep it to 20 emails on one invite.":
    "Keep it to 20 emails on one invite.",
  "Invite code required": "Paste an invite code first.",
  /*
    What every API route returns once a session has quietly lapsed. It used
    to reach the reader verbatim: the Fund room rendered it as six red words
    on an otherwise black page, which reads as a crash rather than as the
    one problem in the app a person can fix in a single click. The rule two
    lines down catches anything else ending in "required"; this one is
    spelled out because "sign in again" is a genuinely useful instruction
    and the generic fallback would throw it away.
  */
  "Sign in required": "You're signed out. Sign in again to see this.",
  "Sign in required to load your portfolio":
    "You're signed out. Sign in again to see your portfolio.",
  "snapshotId required": "Pick a save first.",
  "snapshotId and portfolioId required": "Pick a save and a portfolio first.",
  "This save has none of your portfolios.":
    "This save has none of your portfolios.",
  // Legacy wording from before portfolios stopped being called sheets. Kept
  // so a response from an older deploy still resolves to plain English.
  "This save has none of your sheets.":
    "This save has none of your portfolios.",
  "Unknown action": "That action is not one we recognize.",
  "No pulse candidates supplied": "Nothing on this list yet.",
  "sunday required": "Pick whether you want the Sunday email.",
  "userId required": "Pick a person first.",
  "userId and decision required": "Pick approve or decline.",
  "role required": "Pick a role first.",
  "portfolioId and forecast snapshot required": "Need a portfolio and a forecast first.",
  "Not a member": "You're not in this circle.",
  "Admin only": "Only an admin can do that.",
  "Already a member": "You're already in this circle.",
  "This community is invite-only": "This circle is invite-only.",
  "Not found": "Couldn't find that.",
  "Member not found": "That person isn't in this circle.",
  "No pending request": "There's no request waiting.",
  "Join failed": "Couldn't join. Try the link again.",
  "Forbidden": "You don't have access to that.",
  "Database unavailable": "The database is not responding. Try again in a minute.",
  "nothing to update": "Nothing changed.",
  "Nothing to update": "Nothing changed.",
  /*
    The en dash in this key is load-bearing and must stay.

    Keys in this map are matched against the string the server actually
    sent, so the key is a fingerprint of somebody else's output rather than
    copy of ours. Rewriting it to read the way the rest of the app reads
    would simply stop it matching, and the reader would get the raw server
    error instead of the plain line under it. Nothing renders the key: the
    value is what a person sees, and it has no dash in it.
  */
  "Display name must be 1–80 characters":
    "Display name has to be between 1 and 80 characters",
  "Avatar URL must start with http(s)://":
    "Photo link has to start with http:// or https://",
  "invalid visibility": "Pick private or public.",
  "Classes stay invite-only": "Classes stay invite-only.",
  "Not a class": "That isn't a class.",
  "Class portfolios stay until the class ends.":
    "Class portfolios stay until the class ends.",
  "Class sheets stay until the class ends.":
    "Class portfolios stay until the class ends.",
  "This class only shows the paper portfolio you were given.":
    "This class only shows the paper portfolio you were given.",
  "This class only shows the paper sheet you were given.":
    "This class only shows the paper portfolio you were given.",
  "Your class portfolio stays in the circle.":
    "Your class portfolio stays in the circle.",
  "Your class sheet stays in the circle.":
    "Your class portfolio stays in the circle.",
  "invalid starting cash":
    "Starting cash has to be between $1,000 and $10,000,000.",
  "Pick what students can do.": "Pick what students can do.",
  "You can buy, sell, and move money.":
    "You can buy, sell, and move money.",
  "You can add companies. You cannot sell yet.":
    "You can add companies. You cannot sell yet.",
  // Older deploys still send the wording this replaced.
  "You can add names. You cannot sell yet.":
    "You can add companies. You cannot sell yet.",
  "The teacher closed the portfolio. You can look, you cannot buy or sell.":
    "The teacher closed the portfolio. You can look, you cannot buy or sell.",
  "The teacher closed the sheet. You can look, you cannot buy or sell.":
    "The teacher closed the portfolio. You can look, you cannot buy or sell.",
  "Couldn't make the paper portfolio.":
    "Couldn't make the paper portfolio.",
  "Couldn't make the paper sheet.":
    "Couldn't make the paper portfolio.",
  "You can sell and move money. You cannot add new companies.":
    "You can sell and move money. You cannot add new companies.",
  // Older deploys still send the wording this replaced.
  "You can sell and move money. You cannot add new names.":
    "You can sell and move money. You cannot add new companies.",
  "Invalid ticker": "That ticker doesn't look right.",
  "Invalid tier": "That experience level isn't valid.",
  "Invalid knowsOptions": "That options answer isn't valid.",
  "Unrecognized ticker": "That ticker is not one we recognize.",
  "Use community book endpoint for peer portfolios":
    "Open that portfolio from the circle, not here.",
  "Supabase not configured": "Cloud save isn't available right now.",
  "Supabase not configured, use local demo store":
    "Cloud save isn't available. This copy of the app is local only.",
  "Supabase not configured, Lab stays local":
    "Cloud save isn't available. Lab stays on this device.",
  "Missing invite token": "That invite link is missing a code.",
  "Lab sync failed": "Couldn't save your Lab notes. They're still on this device.",
};

/**
 * Postgres/PostgREST/driver error text never has a plain-English source —
 * unlike the developer-key patterns below, these come straight from the
 * database and were never meant for a person to read. Route anything that
 * looks like one of these to the fallback instead of showing it raw.
 */
const TECHNICAL_MARKERS = [
  "duplicate key",
  "violates",
  "constraint",
  "relation \"",
  "column \"",
  "syntax error",
  "permission denied",
  "null value in column",
  "invalid input syntax",
  "row-level security",
  "econnrefused",
  "etimedout",
  "fetch failed",
  "jwt",
  "pgrst",
  "stack trace",
  " at Object.",
  " at async ",
];

function looksTechnical(s: string): boolean {
  const lower = s.toLowerCase();
  if (TECHNICAL_MARKERS.some((m) => lower.includes(m.toLowerCase()))) return true;
  // Postgres always double-quotes the identifier in these errors
  // (relation "x", column "y", constraint "z") — a stray quote in an
  // otherwise-unmapped message is the single strongest signal it's a raw
  // driver error rather than a sentence someone wrote for a human.
  if (s.includes('"')) return true;
  // A long, unmapped string is far more likely to be a dumped error object
  // than a short sentence someone actually wrote for this dictionary.
  if (s.length > 160) return true;
  return false;
}

export function plainError(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const s = raw.trim();
  if (!s) return fallback;
  if (KNOWN[s]) return KNOWN[s];
  if (/supabase not configured/i.test(s)) {
    return "Cloud save isn't available right now.";
  }
  if (/^lab sync failed/i.test(s)) {
    return "Couldn't save your Lab notes. They're still on this device.";
  }
  // Bare developer keys: portfolio_id required, foo_bar, HTTP 500 text.
  //
  // The second rule is the general form of the first. "X required" is how a
  // route names a missing argument to another programmer, and the shape is
  // never a sentence a person should read — but the original pattern only
  // matched a single snake_case token, so anything with a space in it
  // ("Sign in required", "userId and decision required") walked straight
  // through to the reader. Whatever genuinely deserves its own wording is
  // mapped in KNOWN above and has already returned by this point.
  if (/^[a-z][a-z0-9_]* required$/i.test(s)) return fallback;
  if (/\brequired\.?$/i.test(s)) return fallback;
  if (/^[a-z]+_[a-z0-9_]+$/i.test(s)) return fallback;
  /*
    What a failed database call now sends instead of the driver's own
    sentence (see `db-error.ts`). It is routed to the caller's fallback
    for the same reason the raw text was: the fallback is contextual
    ("Couldn't save your holding.") and this is not.
  */
  if (s === DB_ERROR_MESSAGE) return fallback;
  if (looksTechnical(s)) return fallback;
  return s;
}
