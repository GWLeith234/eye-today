import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DirectoryFrame } from "@/components/public/directory-frame";
import { ListingCardView } from "@/components/public/listing-card";
import { countryName, isCountryCode } from "@/lib/directory/countries";
import { getLegalStatus, searchDirectory } from "@/lib/directory/public";
import { parseDirectoryFilters } from "@/lib/directory/query";
import { readSources } from "@/lib/directory/sources";
import { sanitizeLegalHtml } from "@/lib/public/content-doc";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/directory/[country]">): Promise<Metadata> {
  const code = (await params).country;
  if (!isCountryCode(code)) return {};
  const name = countryName(code);
  const canonical = `/directory/${code.toLowerCase()}`;
  return {
    title: `${name} directory`,
    description: `Listings and the legal-status note for ${name}. This is not legal advice.`,
    alternates: { canonical },
  };
}

export default async function CountryDirectoryPage({ params, searchParams }: PageProps<"/directory/[country]">) {
  const code = (await params).country;
  if (!isCountryCode(code)) notFound();
  const country = code.toUpperCase();
  const name = countryName(country);
  const page = parseDirectoryFilters(await searchParams).page;
  const [legal, cards] = await Promise.all([
    getLegalStatus(country),
    searchDirectory({ q: "", country, category: "", service: "", verification: "", page }),
  ]);
  const sources = readSources(legal?.sources);
  const html = legal ? sanitizeLegalHtml(legal.summary_html) : "";

  return (
    <DirectoryFrame>
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-4xl font-bold">{name}</h1>
        <p className="text-sm text-muted">Country code {country}</p>
      </header>
      <section aria-labelledby="legal-status" className="flex flex-col gap-3 border border-rule p-4">
        <h2 id="legal-status" className="font-serif text-2xl font-bold">Legal status</h2>
        {legal && html ? (
          <>
            {legal.title ? <p className="font-semibold">{legal.title}</p> : null}
            {legal.as_of ? <p className="text-sm text-muted">As of {legal.as_of}</p> : null}
            <div className="content-doc" dangerouslySetInnerHTML={{ __html: html }} />
            {sources.length > 0 ? (
              <ul className="list-disc pl-5 text-sm">
                {sources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} rel="noopener noreferrer" target="_blank" className="text-accent underline">{source.title}</a>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p>We have not published a legal-status summary for {name}. An unpublished draft is not shown here.</p>
        )}
      </section>
      <section aria-labelledby="country-listings">
        <h2 id="country-listings" className="font-serif text-2xl font-bold">Listings</h2>
        {cards.length === 0 ? <p className="mt-2 text-sm text-muted">No published listings in {name}.</p> : null}
        {cards.map((card) => (
          <ListingCardView key={card.slug} card={card} />
        ))}
      </section>
    </DirectoryFrame>
  );
}
