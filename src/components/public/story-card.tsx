import { format } from "date-fns";
import Image from "next/image";
import Link from "next/link";

import { sectionStyle } from "@/lib/design/section";
import { mediaUrl } from "@/lib/media/url";
import { type ArticleCard, articleHref, getSections } from "@/lib/public/data";

import { SectionIcon } from "./section-icon";
import { IrisMark } from "./wordmark";

// One card for every place a story is listed. Variants:
//   lead      full-width cover story, headline over the photo on wide screens
//   feature   image card for the secondary row
//   standard  image card for rails and grids
//   river     thumbnail beside the text, for "The Latest" and list pages
//   compact   text only
//   numbered  Most Read: a large number beside the headline
// The section colour comes from the sections table (cached per request), so callers pass only the card.

type Variant = "lead" | "feature" | "standard" | "river" | "compact" | "numbered";
type ImageCard = Pick<ArticleCard, "hero_storage_path" | "hero_alt" | "title" | "section_slug">;

// Always a fixed aspect box filled by the photo, so a late-loading image can never move the page.
const ASPECT: Record<"lead" | "feature" | "standard" | "river", string> = {
  lead: "aspect-[4/3] sm:aspect-[16/9] lg:aspect-[21/9]",
  feature: "aspect-[3/2]",
  standard: "aspect-[3/2]",
  river: "aspect-[4/3]",
};

// A story with no photo gets a tile in its section colour with the iris mark, so no card is ever blank.
export function FallbackArt({ className = "" }: { className?: string }) {
  return (
    <div data-fallback-art className={`sec-bg relative flex h-full w-full items-center justify-center overflow-hidden ${className}`} aria-hidden="true">
      <div className="absolute -right-[8%] -bottom-[30%] aspect-square h-[130%] opacity-25">
        <IrisMark size={400} className="h-full w-full" colors={{ ring: "var(--color-paper)", iris: "var(--color-paper)", glow: "var(--sec)", pupil: "var(--sec)", glint: "var(--color-paper)" }} />
      </div>
      <IrisMark size={56} colors={{ ring: "var(--color-paper)", iris: "var(--color-paper)", glow: "var(--color-accent)", pupil: "var(--sec)", glint: "var(--color-paper)" }} />
    </div>
  );
}

export function CardImage({ card, variant, sizes, priority = false }: { card: ImageCard; variant: keyof typeof ASPECT; sizes: string; priority?: boolean }) {
  return (
    <div className={`relative w-full overflow-hidden bg-rule ${ASPECT[variant]}`}>
      {card.hero_storage_path ? (
        <Image src={mediaUrl(card.hero_storage_path, { width: variant === "lead" ? 1600 : 800 })} alt={card.hero_alt || card.title} fill sizes={sizes} preload={priority} className="object-cover" />
      ) : (
        <FallbackArt />
      )}
    </div>
  );
}

export function Kicker({ card, icon, onDark = false }: { card: Pick<ArticleCard, "is_sponsored" | "section_name">; icon?: string | null; onDark?: boolean }) {
  return (
    <p className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest ${onDark ? "text-paper" : "sec-text"}`}>
      {card.is_sponsored ? <span className="bg-ink px-1 py-0.5 text-paper">Sponsored</span> : null}
      <SectionIcon name={icon} className="h-3.5 w-3.5" />
      <span>{card.section_name}</span>
    </p>
  );
}

function Meta({ card, onDark = false }: { card: ArticleCard; onDark?: boolean }) {
  if (!card.byline && !card.published_at) return null;
  return (
    <p className={`text-xs ${onDark ? "text-paper" : "text-muted"}`}>
      {card.byline ? <>By {card.byline}</> : null}
      {card.byline && card.published_at ? " · " : null}
      {card.published_at ? <time dateTime={card.published_at}>{format(new Date(card.published_at), "d MMM yyyy")}</time> : null}
    </p>
  );
}

export async function StoryCard({
  card,
  variant = "standard",
  priority = false,
  rank,
}: {
  card: ArticleCard;
  variant?: Variant;
  priority?: boolean;
  rank?: number;
}) {
  const href = articleHref(card);
  const section = (await getSections()).find((s) => s.slug === card.section_slug);
  const style = sectionStyle(card.section_slug, section?.color);
  const icon = section?.icon;

  if (variant === "compact") {
    return (
      <article data-variant={variant} style={style} className="flex flex-col gap-1 border-t border-rule pt-3">
        <Kicker card={card} icon={icon} />
        <h3 className="font-display text-lg font-bold leading-snug">
          <Link href={href} className="hover:underline">{card.title}</Link>
        </h3>
        <Meta card={card} />
      </article>
    );
  }

  if (variant === "numbered") {
    return (
      <article data-variant={variant} style={style} className="flex items-start gap-3 border-t border-rule pt-3">
        <span aria-hidden="true" className="sec-text font-display text-4xl font-black leading-none">{rank}</span>
        <div className="flex min-w-0 flex-col gap-1">
          <Kicker card={card} icon={icon} />
          <h3 className="font-display text-lg font-bold leading-snug">
            <Link href={href} className="hover:underline">{card.title}</Link>
          </h3>
        </div>
      </article>
    );
  }

  if (variant === "river") {
    return (
      <article data-variant={variant} style={style} className="grid grid-cols-[7.5rem_1fr] gap-3 border-t border-rule pt-4 sm:grid-cols-[11rem_1fr] sm:gap-4">
        <Link href={href} tabIndex={-1} aria-hidden="true" className="block">
          <CardImage card={card} variant="river" sizes="(min-width: 640px) 11rem, 7.5rem" />
        </Link>
        <div className="flex min-w-0 flex-col gap-1">
          <Kicker card={card} icon={icon} />
          <h3 className="font-display text-lg font-bold leading-snug sm:text-xl">
            <Link href={href} className="hover:underline">{card.title}</Link>
          </h3>
          {card.dek ? <p className="line-clamp-2 hidden text-muted sm:block">{card.dek}</p> : null}
          <Meta card={card} />
        </div>
      </article>
    );
  }

  if (variant === "lead") {
    return (
      <article data-variant={variant} style={style} className="relative isolate overflow-hidden bg-ink">
        <Link href={href} tabIndex={-1} aria-hidden="true" className="block">
          <CardImage card={card} variant="lead" priority={priority} sizes="100vw" />
        </Link>
        <div className="flex flex-col gap-2 bg-ink p-4 text-paper sm:p-6 lg:absolute lg:inset-x-0 lg:bottom-0 lg:bg-gradient-to-t lg:from-ink lg:via-ink/85 lg:to-transparent lg:px-8 lg:pb-8 lg:pt-24">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-paper">
            <span className="sec-bg px-1.5 py-0.5">{card.section_name}</span>
            {card.is_sponsored ? <span className="bg-paper px-1 py-0.5 text-ink">Sponsored</span> : null}
          </p>
          <h2 className="max-w-4xl font-display text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">
            <Link href={href} className="hover:underline">{card.title}</Link>
          </h2>
          {card.dek ? <p className="max-w-3xl text-lg text-paper">{card.dek}</p> : null}
          <Meta card={card} onDark />
        </div>
      </article>
    );
  }

  const feature = variant === "feature";
  return (
    <article data-variant={variant} style={style} className="flex flex-col gap-2">
      <Link href={href} tabIndex={-1} aria-hidden="true" className="block">
        <CardImage card={card} variant={variant} sizes={feature ? "(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" : "(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"} />
      </Link>
      <Kicker card={card} icon={icon} />
      <h3 className={`font-display font-bold leading-snug ${feature ? "text-xl" : "text-lg"}`}>
        <Link href={href} className="hover:underline">{card.title}</Link>
      </h3>
      {feature && card.dek ? <p className="line-clamp-2 text-muted">{card.dek}</p> : null}
      <Meta card={card} />
    </article>
  );
}

export function StoryList({ cards }: { cards: ArticleCard[] }) {
  return (
    <ol className="flex flex-col gap-4">
      {cards.map((card) => (
        <li key={`${card.section_slug}/${card.article_slug}`}>
          <StoryCard card={card} variant="river" />
        </li>
      ))}
    </ol>
  );
}
