import { format } from "date-fns";
import Image from "next/image";
import Link from "next/link";

import { type ArticleCard, articleHref } from "@/lib/public/data";
import { mediaUrl } from "@/lib/media/url";

export function HeroImage({
  card,
  sizes,
  priority = false,
}: {
  card: Pick<ArticleCard, "hero_storage_path" | "hero_alt" | "hero_width" | "hero_height" | "title">;
  sizes: string;
  priority?: boolean;
}) {
  if (!card.hero_storage_path) return null;
  const src = mediaUrl(card.hero_storage_path, { width: 1200 });
  const alt = card.hero_alt || card.title;
  if (card.hero_width && card.hero_height) {
    return <Image src={src} alt={alt} width={card.hero_width} height={card.hero_height} sizes={sizes} preload={priority} className="h-auto w-full" />;
  }
  return (
    <div className="relative aspect-[3/2] w-full">
      <Image src={src} alt={alt} fill sizes={sizes} preload={priority} className="object-cover" />
    </div>
  );
}

export function Kicker({ card }: { card: Pick<ArticleCard, "is_sponsored" | "section_name" | "section_slug"> }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest">
      {card.is_sponsored ? <span className="mr-2 bg-ink px-1 py-0.5 text-paper">Sponsored</span> : null}
      <span className="text-accent">{card.section_name}</span>
    </p>
  );
}

function Meta({ card }: { card: ArticleCard }) {
  if (!card.byline && !card.published_at) return null;
  return (
    <p className="text-xs text-muted">
      {card.byline ? <>By {card.byline}</> : null}
      {card.byline && card.published_at ? " · " : null}
      {card.published_at ? <time dateTime={card.published_at}>{format(new Date(card.published_at), "d MMM yyyy")}</time> : null}
    </p>
  );
}

export function StoryCard({
  card,
  variant = "standard",
  priority = false,
}: {
  card: ArticleCard;
  variant?: "lead" | "standard" | "compact";
  priority?: boolean;
}) {
  const href = articleHref(card);
  if (variant === "compact") {
    return (
      <article className="flex flex-col gap-1 border-t border-rule pt-3">
        <Kicker card={card} />
        <h3 className="font-serif text-lg font-bold leading-snug">
          <Link href={href} className="hover:underline">{card.title}</Link>
        </h3>
        <Meta card={card} />
      </article>
    );
  }
  const lead = variant === "lead";
  return (
    <article className="flex flex-col gap-2">
      <Link href={href} tabIndex={-1} aria-hidden="true">
        <HeroImage card={card} priority={priority} sizes={lead ? "(min-width: 1024px) 66vw, 100vw" : "(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"} />
      </Link>
      <Kicker card={card} />
      <h2 className={`font-serif font-bold leading-tight ${lead ? "text-3xl sm:text-4xl" : "text-xl"}`}>
        <Link href={href} className="hover:underline">{card.title}</Link>
      </h2>
      {card.dek && lead ? <p className="text-lg text-muted">{card.dek}</p> : null}
      <Meta card={card} />
    </article>
  );
}

export function StoryList({ cards }: { cards: ArticleCard[] }) {
  return (
    <ol className="flex flex-col gap-6">
      {cards.map((card) => (
        <li key={`${card.section_slug}/${card.article_slug}`} className="grid gap-3 border-t border-rule pt-4 sm:grid-cols-[1fr_12rem]">
          <div className="flex flex-col gap-1">
            <Kicker card={card} />
            <h2 className="font-serif text-xl font-bold leading-snug">
              <Link href={articleHref(card)} className="hover:underline">{card.title}</Link>
            </h2>
            {card.dek ? <p className="text-muted">{card.dek}</p> : null}
            <Meta card={card} />
          </div>
          {card.hero_storage_path ? (
            <div className="order-first sm:order-none">
              <HeroImage card={card} sizes="(min-width: 640px) 12rem, 100vw" />
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
