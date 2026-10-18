# Sprint 25 — The Legal Map, verified

**Status:** brief, not started. Written 2026-10-17 against `main`.

## Why this one

Every outlet covering ibogaine covers United States policy. Nobody maintains a reliable picture of where the
drug actually stands country by country. The closest thing is a Wikipedia table with a dead citation on South
Africa, an unsourced entry for Germany, an Israel entry that may be a decade stale, and no row at all for the
Czech Republic or Iceland. Everything else that ranks is clinic marketing dressed as a legal guide.

Eye Today already has the feature built (Sprint 21) and exactly one country published. The differentiated
product is not more aggregation. It is being the place where the global legal picture is **verified, sourced
and dated** — which is what a specialty title is for, and what no competitor owns.

## What scoping four countries actually found

I took the four George named and tried to settle each from primary law. The spread is the finding:

| Country | Status after scoping | What it needs |
| --- | --- | --- |
| **Canada** | **Verified.** Health Canada added "ibogaine and its salts, derivatives or analogues" to the Human and Veterinary Prescription Drug List, effective on posting, 19 May 2017, under C.01.040.3 of the Food and Drug Regulations. | Nothing. Entry drafted. |
| **South Africa** | **Claimed, unverified.** Secondary sources say a 2016 Medicines Control Council listing put ibogaine in Schedule 6, prescribable by a licensed practitioner. The cited MCC statement is a dead link, and the consolidated regulations on SAFLII run only to Schedule 3. | SAHPRA scheduling desk. A Durban phone call. |
| **Czech Republic** | **Unknown.** Czechia appears on no ibogaine legal-status list I can find. Separately and not to be confused with it: a Criminal Code amendment in force 1 January 2026 permits therapeutic *psilocybin* in specialised facilities, and NUDZ says that treatment is still not available pending reimbursement rules. | A Czech source. George has connections. |
| **Iceland** | **Unknown.** Not on any list. Searches return only SEO aggregators and clinic pages — precisely the sources this sprint exists to replace. | Lyfjastofnun (Icelandic Medicines Agency). |

One country in four was settleable from the desk in ten minutes. Two need a human in-country. That ratio is
the sprint plan.

The Canada result is also a reminder of why the map is worth building: the Prescription Drug List is **not**
the Controlled Drugs and Substances Act. In Canada ibogaine is a prescription drug, not a scheduled narcotic
— a materially different position from the United States, and one almost no coverage makes.

## The evidence standard (this is the product)

Every published entry carries:

1. **A primary source.** A statute, a gazette notice, a regulator's own publication, or a named official
   response on the record. Never Wikipedia. Never a clinic. Never an SEO "is it legal in X" page.
2. **An `as_of` date**, shown to the reader as "Last reviewed".
3. **A plain-English line** answering the only two questions a reader actually has: can a doctor legally give
   me this here, and is possessing it a crime.
4. **Honest silence where we do not know.** An entry we cannot source stays `unclear` and says what we asked
   and who did not answer. "We could not confirm this" is a publishable, trust-building sentence; a confident
   guess is a liability on a page people may use to make a treatment decision.

Any entry failing 1 or 2 does not publish.

## The one design decision

`legal_category` (migration 0025) offers `unregulated · permitted · decriminalised · prohibited · unclear`.
Canada and South Africa fit none of them. Both are *prescription-only*: lawful for a doctor to prescribe,
unlawful to sell or supply otherwise, and not criminalised the way the United States criminalises it.
Filing Canada as "permitted" overstates it; "unregulated" is simply wrong, and is what Mexico is.

**Proposed:** add `prescription` to the check constraint (migration 0030) and use it for Canada, South Africa,
Australia and New Zealand. Alternative, if we would rather not migrate: keep five values and carry the
nuance in the summary. My recommendation is the migration — the category drives the grouping on `/legal-map`,
and a reader scanning the page should be able to see "a doctor can prescribe this here" as its own group.

**Jeff and George to confirm before 25a.**

## Scope

### 25a — Schema and the entries we can already prove (migration 0030)
- Add `prescription` to `legal_category`; update the editor select and `/legal-map` grouping.
- Publish **Canada** (drafted, primary-sourced).
- Re-review **Mexico**, the one existing published entry, against this standard and set its category.
- Entry template and an editor's checklist in `docs/` so a contributor can add a country without inventing a
  house style.
- **DoD:** two entries published to the standard, every claim traceable to a primary document.

### 25b — The ones that need a human
- **South Africa**, **Czech Republic**, **Iceland**, **Gabon**. Each needs an approach to the regulator or a
  local source; each is a publishable short story in its own right, not only a map entry.
- Gabon is already half-reported: Mongabay's 9 October piece on Gabon wanting a fairer share of the iboga
  boom is in our feed, and iboga is a protected cultural property there under the 1994 law.
- **DoD:** four entries, each either sourced or explicitly marked unconfirmed with the attempt described.

### 25c — The long tail, triaged
- The remaining countries in circulation (Australia, Brazil, New Zealand, Netherlands, Costa Rica, the EU
  members, the United Kingdom, Uruguay). Work in order of reader demand: where people actually travel for
  treatment first.
- **DoD:** every entry either verified and published, or visibly `unclear` with the reason.

## What only George can do

- A SAHPRA contact, or a Durban-side call, to settle South Africa.
- A Czech source to settle whether ibogaine has any status there at all.
- An Iceland approach — Lyfjastofnun, and whatever the Iceland365 side already has.

## Not in scope

Legal advice. The page describes the law as published and is not guidance for a reader's own situation; the
standing disclaimer stays, and the lawyer review already queued for the legal pages covers this one.

## Rollback

25a is one migration and a grouping change; `git revert` plus a migration dropping the added value. Content
entries are rows, and unpublishing is a status change.
