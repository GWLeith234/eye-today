# Sprint 15 — Reader comments & moderation

Branch: `sprint-15-comments`. Migration: `0015_comments.sql` (0014 is held by the unmerged Sprint 13 PR).

## Rules
- Comments are off by default: `sites.comments_enabled` and `articles.comments_enabled` must both be true. Seed data does not turn them on.
- Plain text only. No anonymous comments, no reactions, no replies to replies.
- No new secrets. The assistant uses `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`; when either is missing comments still save and stay pending.
- No `NEXT_PUBLIC_` flag turns moderation off.
- Story comments mount on `/[section]/[slug]`.

## Tasks
1. **Migration** — switches, `comments`, `comment_reports`, `comment_user_status`, RLS enabled and forced, `post_comment`, `comments_for_article`, `comments_for_author`, `report_comment`, editor queue functions.
2. **Screening** — server action calls `post_comment`, then `callClaude` with `comment-screen-1`. Flags: abuse, medical_advice, dosing, sourcing (max 10). Any flag, an assistant error, or fewer than 3 other published comments keeps it pending; a shadow-banned user's comment becomes shadow. The database re-decides the final status in `apply_comment_screen` (service role only).
3. **Article UI** — client region fetching `/api/comments` with no-store; signed-out readers see the list and a sign-in link; signed-in readers get a form, reply on top-level comments, and report.
4. **Reports and admin** — `/admin/comments`: approve, reject with reason, remove, shadow-ban, ban until a date or permanently, lift; bulk approve/reject one id at a time; site-wide switch; article editor checkbox.
5. **Guidelines** — `/community-guidelines` from `src/content/community-guidelines.md` (draft for legal review), in sitemap, footer and reserved slugs.
6. **Tests** — `supabase/tests/0015_comments.sql`, unit tests for `decideCommentStatus`, Playwright E2E_FULL flow with the assistant unset.

## Done when
A new reader's comment waits in the queue, an editor approves it, and it shows with the reader's name. An AI-flagged dosing question is held with the flag reason. A banned user cannot post through the API.
