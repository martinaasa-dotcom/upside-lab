/*
  Does this domain have anywhere to put mail?

  Spelling rules catch gmial.com only because somebody thought to write it
  down. The domain name system knows the answer for every domain there has
  ever been: a name with no mail exchanger and no address record has nothing
  listening, and a confirmation sent there bounces without exception. One
  lookup before the send is what turns a bounce into a sentence on the form.

  The bias is deliberately one-sided. Only a definite no counts as a no. A
  timeout, a refused resolver, a server failure, anything at all that is not
  the domain system saying "that name does not exist" is treated as a yes,
  because turning somebody away over a slow DNS server would be a far worse
  fault than the bounce this exists to prevent.
*/

const LOOKUP_TIMEOUT_MS = 2_500;

/** Answers are held so a busy form does not re-ask about gmail.com all day. */
const YES_TTL_MS = 6 * 60 * 60 * 1000;

/*
  A no is held for minutes rather than hours. A domain that was just
  registered, or one whose records were being edited while somebody tried to
  add it, should not be turned away for the rest of the day over it.
*/
const NO_TTL_MS = 10 * 60 * 1000;

const answers = new Map<string, { accepts: boolean; until: number }>();

/** Keeps the cache from growing without bound on a long-lived server. */
const MAX_CACHED = 500;

function remember(domain: string, accepts: boolean) {
  if (answers.size >= MAX_CACHED) {
    const oldest = answers.keys().next();
    if (!oldest.done) answers.delete(oldest.value);
  }
  answers.set(domain, {
    accepts,
    until: Date.now() + (accepts ? YES_TTL_MS : NO_TTL_MS),
  });
}

/** The domain system's word for "no such name", as opposed to "I could not tell you". */
function isDefinitelyMissing(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "ENOTFOUND" || code === "NXDOMAIN" || code === "ENODATA";
}

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("dns timeout")), LOOKUP_TIMEOUT_MS).unref?.()
    ),
  ]);
}

/**
 * Whether mail addressed to this domain has anywhere to arrive.
 *
 * True unless the domain system is certain there is nothing there.
 */
export async function domainAcceptsMail(domain: string): Promise<boolean> {
  const cached = answers.get(domain);
  if (cached && cached.until > Date.now()) return cached.accepts;

  let dns: typeof import("node:dns/promises");
  try {
    dns = await import("node:dns/promises");
  } catch {
    // No Node resolver here, which happens on an edge runtime. Not knowing is
    // not a reason to turn somebody away.
    return true;
  }

  try {
    const exchangers = await withTimeout(dns.resolveMx(domain));
    /*
      An empty answer, and a single exchanger pointed at the root, are both
      the published way of saying "this domain receives no mail". Rare, and a
      definite no when it happens.
    */
    const usable = exchangers.filter((row) => row.exchange && row.exchange !== ".");
    if (usable.length > 0) {
      remember(domain, true);
      return true;
    }
    if (exchangers.length > 0) {
      remember(domain, false);
      return false;
    }
  } catch (error) {
    if (!isDefinitelyMissing(error)) return true;
    // ENODATA only means no MX record. A plain address record still accepts
    // mail, by RFC 5321, so that is the next question rather than the answer.
  }

  /*
    No mail exchanger. An address record makes the host its own implicit
    exchanger, which is how a good many small domains are set up, so this is
    the difference between a strict check and a wrong one.
  */
  try {
    const addresses = await withTimeout(dns.resolve4(domain));
    if (addresses.length > 0) {
      remember(domain, true);
      return true;
    }
  } catch (error) {
    if (!isDefinitelyMissing(error)) return true;
  }

  try {
    const addresses = await withTimeout(dns.resolve6(domain));
    if (addresses.length > 0) {
      remember(domain, true);
      return true;
    }
  } catch (error) {
    if (!isDefinitelyMissing(error)) return true;
  }

  remember(domain, false);
  return false;
}
