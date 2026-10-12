import type { Metadata } from "next";
import Link from "next/link";

import { type AudiencePanel, AudiencePanels } from "@/components/public/audience-panels";
import { StaticPage } from "@/components/public/static-page";
import { AD_SLOT_NAMES, MAX_CAMPAIGN_MONTHS, PREMIUM_LISTING_ANNUAL_USD, ROS_MONTHLY_USD, SLOT_SIZES } from "@/lib/ads/slots";

export const metadata: Metadata = {
  title: "Advertise",
  description: `Reach the people who make treatment decisions. Run-of-site display from $${ROS_MONTHLY_USD} a month, premium directory listings at $${PREMIUM_LISTING_ANNUAL_USD} a year.`,
  alternates: { canonical: "/advertise" },
};

const CONTACT = "advertise@theeye.today";

const PANELS: AudiencePanel[] = [
  {
    id: "clinics",
    kicker: "Clinics & practitioners",
    title: "Be found by people comparing treatment",
    body: `A free directory listing is the baseline. A premium listing ($${PREMIUM_LISTING_ANNUAL_USD} a year) pins you to the top of the directory and your country page, and run-of-site advertising ($${ROS_MONTHLY_USD} a month) puts your creative in front of every reader. Neither changes how a listing is verified, and both are labelled.`,
    links: [
      { href: "/directory/submit", label: "Add a listing" },
      { href: "/account/advertise", label: "Start a campaign" },
    ],
  },
  {
    id: "families",
    kicker: "Families & patients",
    title: "Why the reporting is free, and who pays for it",
    body: "Nothing on Eye Today sits behind a paywall and no clinic can buy a story. Listings, job postings, supporters and labelled advertising pay the bills. If you want to help without buying placement, become a supporter.",
    links: [
      { href: "/support", label: "Become a supporter" },
      { href: "/ad-policy", label: "How ads are labelled" },
    ],
  },
  {
    id: "researchers",
    kicker: "Researchers & funders",
    title: "Reach the people who run the trials",
    body: "Study recruitment, grant calls, conference and job announcements reach the researchers and clinicians who read the Trials & Funding Tracker. Job postings go on the board and into the newsletter after an editor reads them.",
    links: [
      { href: "/tracker", label: "Trials & Funding Tracker" },
      { href: "/account/postings/new?kind=job", label: "Post a job" },
    ],
  },
  {
    id: "policy",
    kicker: "Policy & press",
    title: "Briefings, the Legal Map and a newsroom you can call",
    body: "Legislators, regulators, lobbyists and reporters use the Legal Map and our trackers for the primary sources behind the headlines. For briefings, interviews or a sponsored newsletter, write to the newsroom.",
    links: [
      { href: "/legal-map", label: "Legal Map" },
      { href: "/contact", label: "Contact the newsroom" },
    ],
  },
];

export default function AdvertisePage() {
  return (
    <StaticPage title="Advertise">
      <div className="flex flex-col gap-8 text-base">
        <p className="text-lg">
          Eye Today is read by clinics, researchers, conference organisers, advocates and the families weighing treatment. Four things pay for the reporting: premium
          directory listings, job postings, supporters, and run-of-site advertising. All four are self-serve, priced in US dollars, and labelled on the page.
        </p>

        <AudiencePanels
          heading="Who advertises on Eye Today, and why"
          intro="Four audiences read us for four reasons. Find yours, then the rate card below."
          panels={PANELS}
        />

        <section aria-labelledby="products" className="flex flex-col gap-4">
          <h2 id="products" className="font-display text-2xl font-semibold">
            What you can buy
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <article className="flex flex-col gap-2 border border-rule p-4">
              <h3 className="font-semibold">Run-of-site advertising</h3>
              <p className="font-display text-3xl font-semibold">
                ${ROS_MONTHLY_USD}
                <span className="text-base font-normal"> / month</span>
              </p>
              <p className="text-sm">
                Your creatives rotate at random through every unit on every page: home, sections, stories, the directory, events, jobs and editions. Upload your own
                artwork, choose 1 to {MAX_CAMPAIGN_MONTHS} months, pay once. Every campaign shares the rotation equally; nothing is targeted and nothing is exclusive.
              </p>
              <p className="text-sm">
                <Link href="/account/advertise" className="font-semibold underline">
                  Start a campaign
                </Link>{" "}
                (sign in or create a free account first).
              </p>
            </article>
            <article className="flex flex-col gap-2 border border-rule p-4">
              <h3 className="font-semibold">Premium directory listing</h3>
              <p className="font-display text-3xl font-semibold">
                ${PREMIUM_LISTING_ANNUAL_USD}
                <span className="text-base font-normal"> / year</span>
              </p>
              <p className="text-sm">
                Every listing in the directory is free. A premium listing is pinned to the top of the directory and its country page with a &ldquo;Featured&rdquo; label,
                and is rotated as a labelled card on section and story pages. It never changes how a listing is verified.
              </p>
              <p className="text-sm">
                <Link href="/directory/submit" className="font-semibold underline">
                  Add your listing
                </Link>
                , claim it, then upgrade it from your account.
              </p>
            </article>
            <article className="flex flex-col gap-2 border border-rule p-4">
              <h3 className="font-semibold">Job postings</h3>
              <p className="text-sm">
                Roles at clinics, research groups and harm-reduction services, read by an editor before they appear, on the jobs board and in the newsletter. Priced per
                posting for 30 or 60 days.
              </p>
              <p className="text-sm">
                <Link href="/account/postings/new?kind=job" className="font-semibold underline">
                  Post a job
                </Link>{" "}
                ·{" "}
                <Link href="/jobs/policy" className="underline">
                  Posting policy
                </Link>
              </p>
            </article>
            <article className="flex flex-col gap-2 border border-rule p-4">
              <h3 className="font-semibold">Support the reporting</h3>
              <p className="text-sm">
                Readers and organisations who want Eye Today to exist, without buying placement. Supporters see fewer ads and get early access to each edition.
              </p>
              <p className="text-sm">
                <Link href="/support" className="font-semibold underline">
                  Become a supporter
                </Link>
              </p>
            </article>
          </div>
        </section>

        <section aria-labelledby="units" className="flex flex-col gap-3">
          <h2 id="units" className="font-display text-2xl font-semibold">
            Unit sizes
          </h2>
          <p className="text-sm">
            One image per unit, at exactly this pixel size: JPEG, PNG, WebP or GIF, up to 1 MB. Cover as many units as you like; the leaderboard, medium rectangle and
            mobile banner reach most readers, and the half page is the most-seen desktop unit.
          </p>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b-2 border-ink">
                <th className="py-1 pr-3">Unit</th>
                <th className="pr-3">IAB size</th>
                <th className="pr-3">Pixels</th>
                <th>Where it appears</th>
              </tr>
            </thead>
            <tbody>
              {AD_SLOT_NAMES.map((name) => (
                <tr key={name} className="border-t border-rule">
                  <td className="py-1 pr-3 font-semibold">{SLOT_SIZES[name].label}</td>
                  <td className="pr-3">{SLOT_SIZES[name].iab}</td>
                  <td className="pr-3 whitespace-nowrap">
                    {SLOT_SIZES[name].width} × {SLOT_SIZES[name].height}
                  </td>
                  <td>{SLOT_SIZES[name].where}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm">Standard IAB sizes, so artwork you already run elsewhere fits here without a resize.</p>
        </section>

        <section aria-labelledby="how" className="flex flex-col gap-3">
          <h2 id="how" className="font-display text-2xl font-semibold">
            How it works
          </h2>
          <ol className="list-decimal flex flex-col gap-1 pl-6 text-sm">
            <li>
              Sign in and go to{" "}
              <Link href="/account/advertise" className="underline">
                Account → Advertise
              </Link>
              . Name the campaign and give it the address readers go to.
            </li>
            <li>Upload a creative for each unit size you want. The upload checks the pixel size for you.</li>
            <li>Choose how many months and pay by card. One payment, no renewal.</li>
            <li>
              An editor reviews every creative under the{" "}
              <Link href="/ad-policy" className="underline">
                ad policy
              </Link>
              , usually within two working days. Approved campaigns start serving at once, or on the start date you chose.
            </li>
            <li>Watch impressions and clicks by unit and page type in your account, and download them as CSV.</li>
          </ol>
        </section>

        <section aria-labelledby="counts" className="flex flex-col gap-2">
          <h2 id="counts" className="font-display text-2xl font-semibold">
            What you get, and what we don&rsquo;t do
          </h2>
          <p className="text-sm">
            Counts are first-party: an impression is your unit at least half visible for a second; a click is a reader leaving through it. There is no third-party ad
            network, no programmatic auction, no cookies for advertising, and no tracking of individual readers. Every ad is labelled &ldquo;Advertisement&rdquo;, and
            sponsored content is never written or edited by the newsroom.
          </p>
        </section>

        <section aria-labelledby="contact" className="flex flex-col gap-2 border-t-2 border-ink pt-4">
          <h2 id="contact" className="font-display text-2xl font-semibold">
            Anything else
          </h2>
          <p className="text-sm">
            Sponsored content, newsletter sponsorship, event partnerships, or a campaign that doesn&rsquo;t fit the rate card: write to{" "}
            <a href={`mailto:${CONTACT}`} className="font-semibold underline">
              {CONTACT}
            </a>
            .
          </p>
        </section>
      </div>
    </StaticPage>
  );
}
