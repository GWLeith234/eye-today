---
status: draft-for-legal-review
updated: 2026-10-02
---

This page describes how Eye Today handles personal information. It is written for readers in Canada and follows the principles of the Personal Information Protection and Electronic Documents Act (PIPEDA). A lawyer has not yet signed off on this draft.

## What we collect

- **Account email.** If you create an account, we store the email address you use to sign in, and the role attached to that account.
- **Newsletter consent.** If you subscribe, we store your email, the lists you chose, a timestamp, and a salted hash of the IP address the request came from. That record is how we show consent under Canada's Anti-Spam Legislation (CASL). We do not keep the raw IP address.
- **Article views and ads.** View counts and ad events store a salted hash of the visitor IP, not the address itself.
- **Payments.** If you support the site, Stripe gives us a customer id. We never receive or store your card number.
- **Contributor applications.** A pitch includes the name, email and background you send us.
- **Editor tools.** Editors may send article text to an AI assistant. That text is the draft, not a reader's account.

## Why

We use this information to run the site, send newsletters you asked for, count which stories are read, show and measure advertising, take supporter payments, and edit the newsroom's own drafts.

## How long we keep it

Account data stays while the account exists. Newsletter records stay while you are subscribed and for a short period afterwards so we can honour unsubscribe requests and CASL. View and ad hashes are aggregates used for counts. Payment records follow Stripe's retention and our accounting needs. You can ask us to delete an account or a newsletter address; we will say if a law requires us to keep a record.

## Who processes it

- **Supabase** stores the database, accounts and media.
- **Railway** hosts the website.
- **Resend** sends editorial email and newsletters.
- **Stripe** processes supporter payments.
- **Anthropic** powers the editor-only AI assistant. It is not used on the public site and it does not publish stories.
- **Plausible** counts pageviews without cookies.
- **Sentry** receives error reports so we can fix breakage. Those reports are scrubbed of email addresses, tokens and Authorization headers before they are stored.
- **Cloudflare Turnstile** checks the write-for-us form for abuse.

We do not sell personal information.

## Cookies and local storage

**We do not ask you to accept cookies, because we do not set any that you would need to refuse.**
There is no advertising cookie, no tracking pixel and no third-party analytics script on this site.

Our analytics is Plausible, which is cookieless and hosted in the EU. It counts a pageview without
storing anything on your device and without building a profile of you. Advertising on Eye Today is
measured on our own server against a one-way hash of your IP address, so that an advertiser can be
told how many times an ad was seen — never who saw it. Neither sets a cookie.

What we do store on your device, all of it necessary for something you asked for:

- **A sign-in session**, only if you have an account and sign in. It keeps you signed in, and it is cleared when you sign out.
- **`et_voter`**, only when you vote in a poll. A random value so that one browser votes once. We store only a salted hash of it — never the value itself, and never your IP address.
- **A Cloudflare Turnstile cookie**, only on pages with a form. It tells people apart from bots so the forms stay usable.
- **A dismissal note**, only if you dismiss the support note under a story. It remembers that you dismissed it, for 30 days, so we do not ask again. It stays in your browser and is never sent to us.

You can clear all of these in your browser at any time. Clearing them signs you out and lets you see
the support note again; nothing else about the site changes.

If a story embeds a video or a post from another site, that embed is served by them and may set
their cookies when it loads. We rewrite every YouTube embed to the no-cookie host so that watching a
video here does not hand YouTube an advertising profile of you.

If we ever add something that does need your consent, we will ask for it before it loads — not after.

## Access and correction

You can ask what we hold about you and ask us to correct it. Use the address on the [contact](/contact) page. We will respond within the time PIPEDA requires.

## Contact

Privacy questions go to the same newsroom contact as everything else, marked "Privacy". The publisher will publish a dedicated privacy contact before launch if the lawyer asks for one.
