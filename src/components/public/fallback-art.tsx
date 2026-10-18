import { sectionBandVar } from "@/lib/brand/palette";

import { IrisMark } from "./wordmark";

// A story without a photograph still has to look like a story. Some never get one — an explainer, a
// legal update, a correction — and a newsroom this size will always publish faster than it can
// source art, so this has to be a good outcome rather than a patched hole.
//
// What it must NOT do is repeat the words already printed beside it. The headline, the dek and the
// section are all on the card, so a tile that sets any of them in type just prints the same sentence
// twice. So the tile is purely visual: the masthead iris, refracted differently for every story.
//
// The figure is seeded from the story's slug, so each story gets its own arrangement and keeps it
// forever — the cover reads as a page of distinct things rather than one tile repeated — while the
// field stays the section's colour, so the paper still reads as a paper with sections. It costs no
// upload, no storage row and no network call, and a real photograph always wins when there is one.
//
// Hidden from screen readers: it carries no information the card does not already say in text.

// FNV-1a. Only needs to be stable and well spread, not cryptographic.
function seedOf(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
}

function generator(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const pick = <T,>(next: () => number, options: readonly T[]): T => options[Math.floor(next() * options.length) % options.length];

// A 3:2 field, drawn edge to edge and cropped by the card.
function Refraction({ slug, title }: { slug: string; title: string }) {
  const next = generator(seedOf(`${slug}/${title}`));
  // Deliberately allowed off the field: a figure cropped by the edge looks composed, where one
  // centred every time looks like a target, and a wall of centred targets looks like a template.
  const cx = 6 + next() * 108;
  const cy = -6 + next() * 92;
  const unit = pick(next, [7, 8, 9, 10, 11]);
  const rings = pick(next, [3, 4, 5, 6]);
  const sweep = next() * 360;
  const arc = pick(next, [120, 150, 180, 220]);

  return (
    <svg
      viewBox="0 0 120 80"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
      focusable="false"
    >
      {Array.from({ length: rings }, (_, index) => (
        <circle
          key={index}
          cx={cx}
          cy={cy}
          r={unit * (index + 1)}
          fill="none"
          stroke="currentColor"
          strokeWidth={index === 0 ? 2.4 : 1.1}
          opacity={0.34 - index * 0.045}
        />
      ))}
      {/* One ring is broken into a sweep, so the figure has a direction and never reads as a target. */}
      <circle
        cx={cx}
        cy={cy}
        r={unit * (rings + 1)}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        opacity="0.26"
        pathLength={360}
        strokeDasharray={`${arc} ${360 - arc}`}
        strokeDashoffset={-sweep}
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r={unit * 0.52} fill="currentColor" opacity="0.4" />
    </svg>
  );
}

export function FallbackArt({
  slug,
  title,
  size = "full",
}: {
  slug: string;
  title?: string | null;
  size?: "full" | "tile";
}) {
  return (
    <div
      data-testid="fallback-art"
      aria-hidden="true"
      className="relative flex aspect-[3/2] w-full items-center justify-center overflow-hidden text-paper"
      style={{ background: sectionBandVar(slug) }}
    >
      {/* Too small for a figure to read: the 7rem thumbnail in a compact list gets the plain mark. */}
      {size === "tile" || !title ? <IrisMark className="size-12" /> : <Refraction slug={slug} title={title} />}
    </div>
  );
}
