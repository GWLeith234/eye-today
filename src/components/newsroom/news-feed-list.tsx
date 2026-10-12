import Link from "next/link";

import { dateLabel, type NewsLink } from "@/lib/newsroom/model";

function outletHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// One credited item: the outlet's headline links out, the outlet is named, the blurb is ours.
export function NewsLinkItem({ link, compact = false }: { link: NewsLink; compact?: boolean }) {
  return (
    <article className={compact ? "flex flex-col gap-1" : "flex flex-col gap-1 border-t border-rule pt-4"}>
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">
        <time dateTime={link.published_on}>{dateLabel(link.published_on)}</time> · {link.source_name}
      </p>
      <h3 className={compact ? "font-serif text-lg font-semibold" : "font-serif text-xl font-semibold"}>
        <a href={link.url} rel="noopener noreferrer nofollow" target="_blank" className="hover:underline">
          {link.title} <span aria-hidden="true">↗</span>
        </a>
      </h3>
      {!compact && link.blurb ? <p className="text-sm">{link.blurb}</p> : null}
      <p className="text-xs text-muted">
        via <a href={link.url} rel="noopener noreferrer nofollow" target="_blank" className="underline">{outletHost(link.url) || link.source_name}</a>
      </p>
    </article>
  );
}

// Compact block for the cover.
export function InTheNews({ links, heading = "Ibogaine in the news", id = "in-the-news" }: { links: NewsLink[]; heading?: string; id?: string }) {
  if (links.length === 0) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 border-t-2 border-ink pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="font-display text-2xl font-semibold">{heading}</h2>
        <Link href="/news-feed" className="text-sm underline">All coverage</Link>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {links.map((link) => (
          <li key={link.id}>
            <NewsLinkItem link={link} compact />
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">Reporting by other outlets, chosen by our editors. Each link opens on the outlet&rsquo;s site.</p>
    </section>
  );
}
