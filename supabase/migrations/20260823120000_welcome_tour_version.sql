/*
  The walkthrough, and the number that decides who is owed one.

  Upside Lab could explain itself in one place: a first-run wizard that had
  been switched off since 2026-08-18, and which even when it ran was skipped
  by `shouldSkipExperienceOnboarding` for anybody who already owned anything.
  Between those two facts, the set of people who have ever been told what
  Pulse is, where Lab lives, or that a circle is opt-in, is close to empty --
  and it certainly does not include a single existing holder.

  So the walkthrough is back, it says the whole thing, and everybody sees it
  once. That last part is what this column is for.

  An integer rather than a boolean, deliberately. `onboarded boolean` answers
  "have they seen a walkthrough", which stops being the useful question the
  first time the walkthrough changes. This answers "which one", so raising
  WELCOME_TOUR_VERSION in src/lib/welcome-tour.ts shows the new one to
  everybody exactly once and this file never has to move again.

  Zero is nobody, which is where every existing row starts. That is the reset:
  no backfill, no script, no flag to clear. Somebody who signed in yesterday
  is at zero and is therefore due the walkthrough on their next visit, which
  is exactly the intent.

  Separate from experience_tier and knows_options on purpose. Those two are
  answers the reader gave about themselves and must survive a walkthrough
  being rewritten; this is a record of what the app has shown them. Folding
  them together would mean re-asking the questions every time the copy
  changes, or never showing new copy to anybody who has answered.
*/

alter table public.portfell_profiles
  add column if not exists welcome_tour_version integer not null default 0;

comment on column public.portfell_profiles.welcome_tour_version is
  'Highest walkthrough version this reader has finished. 0 = never. Compared against WELCOME_TOUR_VERSION in src/lib/welcome-tour.ts; raising that constant re-shows the walkthrough to everybody once.';
