# Sprint 23 — Podcasts section, Podcast directory, reader survey `EDITORIAL + BUILD`

**Origin:** George, 2026-10-11 late: "We should have a section for Podcasts and add Scientia Prima and others to the Podcast Directory." Same night, from Psychedelic Alpha's reader-survey email: one ask per send, founder signoff, reply-to open.
Runs after Sprint 22.1 (#32, merged 2026-10-12). Branch `sprint-23-podcasts-survey` from `main`; migration **0028**.

## Scope

**1. Podcasts as a section** — a `podcasts` row in `sections` (name "Podcasts", colour/icon chosen in the build), so episodes are articles with the normal byline, hero, tags and rails. An episode is an article in the Podcasts section with an **embed** (YouTube or Spotify) in the body; the editor's existing YouTube extension covers the first. `/podcasts` is therefore the ordinary section front, no new route. Scientia Prima's recorded episode (14 Aug 2026, in the Transcend folder) is the first story.

**2. Podcast category in the directory** — `directory_categories` gains `podcast` ("Podcast"), and `directory_listings` gains three nullable columns: `feed_url` (RSS, https), `platform_links` jsonb (`[{platform, url}]` for Apple, Spotify, YouTube, Amazon, RSS) and `host_names` text. The listing card shows the platform links as small labelled buttons; the listing page shows the latest episodes **only if** `feed_url` is set, fetched server-side at request time with the same host/redirect rules as the news-feed link preview (8 s, 512 KB, https, private hosts refused), cached for an hour. Seed listings (published, verified by the editor who knows them): **Scientia Prima**, **OZCast** (Mark "Oz" Geist; "coming to Spotify, YouTube and Apple Podcasts"), **Evolved Pros** (George's own — disclosure line as with Transcend), **Conquer Local** (archive), plus **The Psychedelic News Feed Podcast** (Psychedelic Alpha) and any other ibogaine/psychedelic-recovery shows Jeff names.

**3. Reader survey** — `/survey`: a short form (what brought you here; who you are — patient/family, clinician, researcher, policy, press, clinic; what we should cover; optional email), Turnstile-protected, rate-limited, stored in `reader_surveys` (site_id, answers jsonb, email nullable, created_at), editor-only read with CSV export at Admin → Survey. Newsletter: a **single-CTA block** (heading, one line, one button) added to the issue builder as `cta_heading / cta_text / cta_url` on `newsletter_issues`, rendered between the intro and the stories, so a survey send is intro + one button and nothing else. Every issue is signed by the editor (`profiles.display_name` of the sender, with "reply to this email").

## Not in scope
Transcript ingestion, audio hosting, per-episode pages beyond the article, podcast JSON-LD (a `PodcastEpisode` schema is cheap and can ride along if time allows).

## Decisions for George
- Keep "Podcasts" in the main nav or under Stories? (Brief assumes main nav, after Stories.)
- The Evolved Pros disclosure wording on its listing.
- Survey questions: the five above, or a different set?

## Definition of done
`/podcasts` shows the Scientia Prima episode with an embed; `/directory?category=podcast` lists five shows with platform buttons; `/survey` accepts a response that lands in Admin → Survey and exports; a newsletter issue with the CTA block renders and sends in the mock mailbox; migrations via guarded script; e2e for the three.

## Rollback
`git revert` the merge commit; a new migration drops the three columns, the category and the survey table.
