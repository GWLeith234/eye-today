import { format } from "date-fns";
import Image from "next/image";
import Link from "next/link";

import { sectionInkVar } from "@/lib/brand/palette";
import { type ArticleCard, articleHref } from "@/lib/public/data";
import { mediaUrl } from "@/lib/media/url";

import { FallbackArt } from "./fallback-art";

const SIZES = {
  lead: "(min-width: 1024px) 42rem, 100vw",
  feature: "(min-width: 1024px) 18rem, (min-width: 640px) 45vw, 100vw",
  standard: "(min-width: 1024px) 20rem, (min-width: 640px) 45vw, 100vw",
  compact: "(min-width: 640px) 8rem, 40vw",
  numbered: "(min-width: 640px) 8rem, 40vw",
} as const;

export type StoryVariant = keyof typeof SIZES;

function CardMedia({
  card,
  sizes,
  priority = false,
}: {
  card: ArticleCard;
  sizes: string;
  priority?: boolean;
}) {
  if (!card.hero_storage_path) return <FallbackArt slug={card.section_slug} label={card.section_name} />;
  return (
    <div className="relative aspect-[3/2] w-full overflow-hidden bg-rule">
      <Image
        src={mediaUrl(card.hero_storage_path, { width: 1200 })}
        alt={card.hero_alt || ""}
        fill
        sizes={sizes}
        preload={priority}
        className="object-cover"
      />
    </div>
  );
}

export function HeroImage({
  card,
  sizes,
  priority = false,
}: {
  card: Pick<ArticleCard, "hero_storage_path" | "hero_alt" | "hero_width" | "hero_height" | "title" | "section_slug" | "section_name">;
  sizes: string;
  priority?: boolean;
}) {
  return <CardMedia card={card as ArticleCard} sizes={sizes} priority={priority} />;
}

export function Kicker({ card }: { card: Pick<ArticleCard, "is_sponsored" | "section_name" | "section_slug"> }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest">
      {card.is_sponsored ? <span className="mr-2 bg-ink px-1 py-0.5 text-paper">Sponsored</span> : null}
      <span style={{ color: sectionInkVar(card.section_slug) }}>{card.section_name}</span>
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
  variant?: StoryVariant;
  priority?: boolean;
}) {
  const href = articleHref(card);
  const sizes = SIZES[variant];
  if (variant === "numbered") {
    return (
      <article className="flex flex-col gap-1">
        <h3 className="font-display text-lg font-semibold leading-snug">
          <Link href={href} className="hover:underline">{card.title}</Link>
        </h3>
        <Kicker card={card} />
      </article>
    );
  }
  if (variant === "compact") {
    return (
      <article className="grid grid-cols-[7rem_1fr] gap-3 border-t border-rule pt-3">
        <Link href={href} tabIndex={-1} aria-hidden="true" className="block">
          <CardMedia card={card} sizes={sizes} />
        </Link>
        <div className="flex flex-col gap-1">
          <Kicker card={card} />
          <h3 className="font-display text-lg font-semibold leading-snug">
            <Link href={href} className="hover:underline">{card.title}</Link>
          </h3>
          <Meta card={card} />
        </div>
      </article>
    );
  }
  const lead = variant === "lead";
  return (
    <article data-testid={lead ? "lead-story" : undefined} className={lead ? "grid items-end gap-4 lg:grid-cols-2" : "flex flex-col gap-2"}>
      <Link href={href} tabIndex={-1} aria-hidden="true" className="block">
        <CardMedia card={card} sizes={sizes} priority={priority} />
      </Link>
      <div className="flex flex-col gap-2">
        <Kicker card={card} />
        {lead ? (
          <h2 className="font-display text-3xl font-semibold leading-tight sm:text-5xl">
            <Link href={href} className="hover:underline">{card.title}</Link>
          </h2>
        ) : (
          <h2 className={`font-display font-semibold leading-tight ${variant === "feature" ? "text-xl" : "text-xl"}`}>
            <Link href={href} className="hover:underline">{card.title}</Link>
          </h2>
        )}
        {card.dek && (lead || variant === "feature") ? <p className={lead ? "text-lg text-muted" : "text-muted"}>{card.dek}</p> : null}
        <Meta card={card} />
      </div>
    </article>
  );
}

export function StoryList({ cards }: { cards: ArticleCard[] }) {
  return (
    <ol className="flex flex-col gap-6">
      {cards.map((card) => (
        <li key={`${card.section_slug}/${card.article_slug}`}>
          <StoryCard card={card} variant="compact" />
        </li>
      ))}
    </ol>
  );
}
