import Image from "next/image";
import Link from "next/link";

import { readPlatformLinks } from "@/lib/directory/podcast";
import { getPlatformLinks, searchDirectory } from "@/lib/directory/public";
import { mediaUrl } from "@/lib/media/url";

import { PlatformButtons } from "./platform-links";

// The shows themselves. They are directory listings — a podcast is a thing in the world that gets
// verified and disclosed like any other — but a reader looking for podcasts goes to the Podcasts
// page, not to the directory and down a category filter. So the shows lead this page and the
// episode write-ups follow underneath; the directory keeps its copy for anyone browsing that way.

const PODCAST_FILTERS = { q: "", country: "", category: "podcast", service: "", verification: "" as const, page: 1 };

export async function PodcastShows() {
  const cards = await searchDirectory(PODCAST_FILTERS);
  if (cards.length === 0) return null;
  const links = await getPlatformLinks(cards.map((card) => card.slug));

  return (
    <section aria-labelledby="shows" className="flex flex-col gap-4">
      <h2 id="shows" className="font-display text-2xl font-semibold">The shows</h2>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const art = card.logo_storage_path ?? card.photo_storage_path ?? null;
          const podcast = links.get(card.slug);
          const href = `/directory/listing/${card.slug}`;
          return (
            <li key={card.slug} className="flex flex-col gap-3">
              <Link href={href} aria-hidden="true" tabIndex={-1} className="relative block aspect-square w-full overflow-hidden border border-rule bg-rule">
                {art ? (
                  <Image src={mediaUrl(art, { width: 640 })} alt="" fill sizes="(min-width: 1024px) 20rem, (min-width: 640px) 45vw, 100vw" className="object-cover" />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center bg-[#2E5E8C] p-4 text-center font-display text-xl font-semibold leading-tight text-paper">
                    {card.name}
                  </span>
                )}
              </Link>
              <div className="flex flex-col gap-1.5">
                <h3 className="font-serif text-xl font-bold leading-tight">
                  <Link href={href} className="hover:underline">{card.name}</Link>
                </h3>
                {podcast?.host_names ? <p className="text-sm text-muted">Hosted by {podcast.host_names}</p> : null}
                {card.description ? <p className="line-clamp-3 text-sm">{card.description}</p> : null}
                <PlatformButtons links={readPlatformLinks(podcast?.platform_links)} />
                {card.relationship_disclosure ? (
                  <p className="text-xs text-muted">
                    <span className="font-semibold">Publisher relationship: </span>
                    {card.relationship_disclosure}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
