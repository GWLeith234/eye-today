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

## Cookies

Plausible is cookieless. It does not set an analytics cookie.

The cookies we do set are essential:

- An auth session cookie when you sign in.
- A Cloudflare Turnstile cookie on the write-for-us form.
- A short-lived cookie that caps how often the same ad is shown to one browser.

## Access and correction

You can ask what we hold about you and ask us to correct it. Use the address on the [contact](/contact) page. We will respond within the time PIPEDA requires.

## Contact

Privacy questions go to the same newsroom contact as everything else, marked "Privacy". The publisher will publish a dedicated privacy contact before launch if the lawyer asks for one.
