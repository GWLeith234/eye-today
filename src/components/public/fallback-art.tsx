import { sectionBandVar } from "@/lib/brand/palette";

import { IrisMark } from "./wordmark";

/** Reserved tile so a story without a photograph never leaves an empty card. */
export function FallbackArt({ slug, label }: { slug: string; label: string }) {
  return (
    <div
      data-testid="fallback-art"
      className="flex aspect-[3/2] w-full items-center justify-center text-paper"
      style={{ background: sectionBandVar(slug) }}
      role="img"
      aria-label={`${label} — no photograph`}
    >
      <IrisMark className="size-12" />
    </div>
  );
}
