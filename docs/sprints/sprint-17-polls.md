# Sprint 17 — Polls & contests `ENGAGEMENT`

**Goal:** Editors can drop quick polls into stories and run simple contests.

**Definition of done:** Embed a poll in an article → vote as a signed-out reader → results show → a second vote from the same browser is refused; create a contest → submit an entry → editor draws a winner and the draw is recorded.

**Won't change:** No quizzes, no paid entries.

## Pre-flight (Claude, 2026-10-10): GO WITH CHANGES

Checked against `main` at `c516f65` (0001–0017 in production, so 0018 is next).

| # | Severity | Area | Finding | Decision |
|---|---|---|---|---|
| 1 | blocker | Schema | The brief assumes 0001–0011. | Migration `0018_polls_contests.sql`. |
| 2 | blocker | Votes | If anon could call a vote function with its own "device hash", one script could stuff the ballot with random hashes. | `cast_poll_vote` is **service-role only**. The server action reads an httpOnly random device cookie, hashes it with `VIEW_HASH_SALT` (sha256), rate-limits by IP and device, and passes either the signed-in profile id or the hash. No raw IP or raw token is stored. A unique index enforces one vote per poll per voter. |
| 3 | high | Results | "After voting" can't be decided by a public SQL function that doesn't know the voter. | `poll_public(id)` returns the question, options and state, plus counts only when `results = 'always'` or the poll is closed. Voters get counts from the server, which checks their vote with the service role (`poll_results_for`). |
| 4 | high | Embedding | Article HTML is static and sanitised, so a live widget can't sit inside it. | A TipTap `poll` node renders `<div data-poll="<uuid>">`. The sanitiser allows `data-poll` only with a UUID value. A client `PollMounts` component portals a `PollWidget` into each placeholder on the article page. |
| 5 | high | Contests | Entry spam, and consent to process data. | `enter_contest` (definer, anon and authenticated) requires consent, a valid email and an open contest, allows one entry per email per contest, and caps entries at 2000 per contest per day. The public form uses Turnstile (fails closed without the secret) and an in-memory rate limit. Entrant emails are never public. |
| 6 | high | Draw | A draw must be auditable and reproducible. | The seed comes from `crypto.randomBytes(32)`. The winner is index `sha256(seed) mod n` over eligible entries sorted by id. `contest_draws` stores the seed, entry count, winner and drawer. A unit test proves the same seed gives the same winner. |
| 7 | medium | Routes | `/contests` would be caught by `/[section]`. | Reserve `contests`. |
| 8 | medium | Export | Entries are personal data. | CSV export is an editor-only route handler using the editor's own client (RLS), `Cache-Control: no-store`. |

## Env vars
None new. Uses `VIEW_HASH_SALT` (already listed) for device hashing and `TURNSTILE_SECRET_KEY` for contest entries.
