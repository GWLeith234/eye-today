import type { Metadata } from "next";
import Link from "next/link";

import { TopAds } from "@/components/public/page-ads";
import { SupportNote } from "@/components/public/support-note";
import { countryName } from "@/lib/directory/countries";
import { groupByCategory, LEGAL_CATEGORIES, LEGAL_CATEGORY_LABELS, LEGAL_CATEGORY_NOTES } from "@/lib/directory/legal-map";
import { getLegalMap } from "@/lib/directory/public";
import { dateLabel } from "@/lib/newsroom/model";
import { MEDICAL_DISCLAIMER } from "@/lib/public/disclaimer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Legal Map",
  description: "Where ibogaine is unregulated, permitted, decriminalised or prohibited, country by country, with the date each entry was last reviewed and its sources.",
  alternates: { canonical: "/legal-map" },
};

export default async function LegalMapPage() {
  const rows = await getLegalMap();
  const groups = groupByCategory(rows);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Eye Today tracker</p>
        <h1 className="font-serif text-4xl font-bold">Legal Map</h1>
        <p>
          The legal status of ibogaine, country by country, maintained by our editors from primary sources. Each entry shows when it was last reviewed. This is
          not legal advice: laws change, and enforcement differs from the statute book.
        </p>
      </header>
      <TopAds page="other" />

      <nav aria-label="Categories" className="flex flex-wrap gap-2 text-sm">
        {LEGAL_CATEGORIES.map((category) => {
          const count = rows.filter((row) => row.legal_category === category).length;
          return (
            <a key={category} href={`#${category}`} className="rounded border border-rule px-3 py-1 hover:underline">
              {LEGAL_CATEGORY_LABELS[category]} <span className="text-muted">({count})</span>
            </a>
          );
        })}
      </nav>

      {rows.length === 0 ? <p role="status">The first country entries are on their way.</p> : null}

      {groups.map(({ category, rows: countries }) => (
        <section key={category} id={category} aria-labelledby={`legal-${category}`} className="flex flex-col gap-3 border-t-2 border-ink pt-4">
          <h2 id={`legal-${category}`} className="font-display text-2xl font-semibold">{LEGAL_CATEGORY_LABELS[category]}</h2>
          <p className="text-sm text-muted">{LEGAL_CATEGORY_NOTES[category]}</p>
          <ul className="flex flex-col divide-y divide-rule">
            {countries.map((row) => (
              <li key={row.country_code} data-legal-country={row.country_code} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3">
                <Link href={`/directory/${row.country_code.toLowerCase()}`} className="font-serif text-xl font-semibold hover:underline">
                  {countryName(row.country_code)}
                </Link>
                {row.title ? <span className="text-sm">{row.title}</span> : null}
                <span className="ml-auto text-xs text-muted">
                  {row.as_of ? `Last reviewed ${dateLabel(row.as_of)}` : "Review date not set"} · {row.source_count} {row.source_count === 1 ? "source" : "sources"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="text-xs text-muted">{MEDICAL_DISCLAIMER} Corrections: <a href="mailto:newsroom@theeye.today" className="underline">newsroom@theeye.today</a>.</p>
      <SupportNote />
    </div>
  );
}
