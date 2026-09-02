/**
 * The one reminder a person gets about an empty portfolio.
 *
 * It used to open with "Your portfolio is still empty." and only then say
 * hello, which is the subject line said twice before the greeting. A person
 * writing a note starts with the greeting, so the body does, and the
 * subject is passed to the HTML separately as the headline. Both halves
 * matter: dropping the headline would leave the letter opening on "Hi
 * Martin." in 26px type.
 *
 * The rest of it is the name of the one scheduled email. It is the Sunday
 * letter everywhere a person can read it, and this footer was one of the
 * last places still calling it the Sunday email.
 */
import { describe, expect, it } from "vitest";
import { emptyBookNudgeHtml } from "@/lib/email-letter";
import {
  emptyBookNudgeSubject,
  emptyBookNudgeText,
} from "@/lib/empty-book-nudge";

function letter(name: string | null) {
  const text = emptyBookNudgeText(name);
  return {
    text,
    html: emptyBookNudgeHtml({ heading: emptyBookNudgeSubject(), text }),
  };
}

describe("the empty-portfolio reminder", () => {
  it("greets before it says anything else", () => {
    const { text } = letter("Martin Aasa");
    const blocks = text.split(/\n{2,}/);
    expect(blocks[0]).toBe("Hi Martin.");
    expect(blocks[1]).toMatch(/^You signed up about a week ago/);
  });

  it("does not repeat its own subject line in the body", () => {
    const { text } = letter("Martin Aasa");
    expect(text).not.toContain(`${emptyBookNudgeSubject()}.`);
  });

  it("still greets somebody whose name we do not have", () => {
    const { text } = letter(null);
    expect(text.split(/\n{2,}/)[0]).toBe("Hi.");
  });

  it("keeps the subject as the headline of the HTML", () => {
    const { html } = letter("Martin Aasa");
    expect(html).toContain(emptyBookNudgeSubject());
    expect(html).toContain("Hi Martin.");
  });

  it("calls the Sunday letter the Sunday letter, in both shapes", () => {
    const { text, html } = letter("Martin Aasa");
    expect(text).toContain("The Sunday letter starts once");
    expect(html).toContain("The Sunday letter starts once");
    expect(text).not.toMatch(/Sunday email/);
    expect(html).not.toMatch(/Sunday email/);
  });

  it("never calls a company a name", () => {
    const { text, html } = letter("Martin Aasa");
    for (const body of [text, html]) {
      expect(body).not.toMatch(/\bnames\b/);
    }
  });
});
