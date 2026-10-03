import type { Metadata } from "next";
import Link from "next/link";

import { DirectoryFilters } from "@/components/public/directory-filters";
import { DirectoryFrame } from "@/components/public/directory-frame";
import { ListingCardView } from "@/components/public/listing-card";
import { countryName } from "@/lib/directory/countries";
import { countDirectory, getDirectoryCategories, getDirectoryServices, searchDirectory } from "@/lib/directory/public";
import { directoryHref, parseDirectoryFilters } from "@/lib/directory/query";
import { DIRECTORY_PAGE_SIZE } from "@/lib/directory/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Directory",
  description: "Clinics, practitioners and support services. Listings are not endorsements.",
  alternates: { canonical: "/directory" },
};

export default async function DirectoryPage({ searchParams }: PageProps<"/directory">) {
  const filters = parseDirectoryFilters(await searchParams);
  const [categories, services, cards, total] = await Promise.all([
    getDirectoryCategories(),
    getDirectoryServices(),
    searchDirectory(filters),
    countDirectory(filters),
  ]);
  const pages = Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE));

  return (
    <DirectoryFrame>
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-4xl font-bold">Directory</h1>
        <p className="max-w-2xl text-lg">
          Clinics, practitioners and support services. A listing is not an endorsement, and it is not medical or legal advice.
        </p>
      </header>
      <DirectoryFilters filters={filters} categories={categories} services={services} />
      <p className="text-sm text-muted">
        {total === 0 ? "No listings match." : `${total} listing${total === 1 ? "" : "s"}, alphabetical unless you searched.`}
        {filters.country ? ` Country: ${countryName(filters.country)}.` : ""}
      </p>
      <div>
        {cards.map((card) => (
          <ListingCardView key={card.slug} card={card} />
        ))}
      </div>
      {pages > 1 ? (
        <nav aria-label="Pagination" className="flex flex-wrap gap-3 text-sm">
          {filters.page > 1 ? <Link href={directoryHref(filters, filters.page - 1)} className="underline">Previous</Link> : null}
          <span>Page {filters.page} of {pages}</span>
          {filters.page < pages ? <Link href={directoryHref(filters, filters.page + 1)} className="underline">Next</Link> : null}
        </nav>
      ) : null}
    </DirectoryFrame>
  );
}
