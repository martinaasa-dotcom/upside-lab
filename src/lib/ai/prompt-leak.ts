/**
 * Guard against a model that echoes its own instructions instead of writing
 * the letter. Shared by any background writer that ships copy to a person
 * without a human reading it first.
 */

/** Phrases that only show up when the model dumps the prompt instead of the note. */
const LEAK = [
  /banned words/i,
  /cashtags?/i,
  /no em[- ]dash/i,
  /avoid em[- ]dash/i,
  /avoid en dash/i,
  /the instruction says/i,
  /we need to produce/i,
  /sunday note block/i,
  /weekly letter block/i,
  /no greeting/i,
  /sign-off/i,
  /hard rules/i,
  /as an AI/i,
  /do not invent holdings/i,
  /use only names from facts/i,
  /tickers as cashtags/i,
  /4\s*(?:to|-)\s*6 short sentences/i,
  /2 or 3 short sentences/i,
  /3 or 4 short sentences/i,
  /two to four sentences/i,
  /write a complete thought/i,
  /pile of leftover/i,
  /loud movers \(name every/i,
  /background only, do not paste/i,
  /part 1\./i,
  /part 2\./i,
  /12-year-old/i,
  /75-year-old/i,
  /working vocabulary/i,
  /plan out loud/i,
  /restate these rules/i,
  /list words to avoid/i,
  /MARGUS_PERSONA/i,
  /partner Slack/i,
  /three short paragraphs/i,
  /Paragraph 1\./i,
  /Paragraph 2\./i,
  /Paragraph 3\./i,
  /Paragraph 4\./i,
  /Section 1\./i,
  /Section 2\./i,
  /Section 3\./i,
  /Narrative Arc/i,
  /Institutional Portfolio/i,

  /*
    A reasoning model narrating itself, which is a different leak from a
    model quoting the prompt back and needs its own patterns: these carry no
    prompt vocabulary at all, so nothing above catches them.

    Measured on the free tier 2026-08-24, this is the normal failure rather
    than an odd one. nemotron-3-super-120b opened a reply to "explain what a
    covered call is" with "The user asks:" and then several paragraphs of
    "We must follow policy", quoting forbidden phrases out of the system
    prompt on the way. nemotron-3.5-lightning opens with "Here's a thinking
    process". Both are models a reader can be served by today.

    Anchored to the start of a line, because a sentence may legitimately
    contain "we should" in the middle of a thought.
  */
  /(^|\n)\s*we (must|should|need to|can|will|have to)\b/i,
  /(^|\n)\s*the user (asks|wants|is asking)/i,
  /(^|\n)\s*(okay|ok|so),? (let's|lets|we)\b/i,
  /let'?s craft/i,
  /here'?s (a|my) thinking process/i,
  /\banalyze user request\b/i,
  /according to the instruction/i,
  /must (refuse|comply|not comply)/i,
  /we must not mention/i,
];

export function looksLikePromptLeak(text: string): boolean {
  const s = text.trim();
  if (!s) return false;
  return LEAK.some((re) => re.test(s));
}
