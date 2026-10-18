import { PLACEMENTS, RIVER_AFTER } from "@/lib/ads/placements";
import type { PageType } from "@/lib/ads/slots";

import { AdSlot } from "./ad-slot";
import { SupporterHidden } from "./supporter-hidden";

// The units a page type carries, read from PLACEMENTS so a page declares its type once. Every
// unit is empty until a creative arrives, so an unfilled one adds no gap.

// The billboard band under the navigation. Desktop only: on a phone the mobile banner carries the top of
// the page, and a billboard squeezed to 360 px is a strip nobody can read.
export function TopAds({ page }: { page: PageType }) {
  return (
    <>
      {PLACEMENTS[page].top.map((name) => (
        <AdSlot key={name} name={name} page={page} className="hidden md:flex" />
      ))}
    </>
  );
}

// The leaderboard band between major sections of a page.
export function BandAd({ page }: { page: PageType }) {
  const name = PLACEMENTS[page].band;
  return name ? <AdSlot name={name} page={page} className="hidden md:flex" /> : null;
}

// The rail: a big box at the top, and the half page at the bottom, which stays in view while the reader
// scrolls the column beside it. Supporters never see them.
export function SideAds({ page, className = "mx-auto flex w-full max-w-[300px] flex-col gap-6" }: { page: PageType; className?: string }) {
  const names = PLACEMENTS[page].side;
  if (!names.length) return null;
  return (
    <div className={className}>
      {names.map((name) => (
        <SupporterHidden key={name}>
          <AdSlot name={name} page={page} className={name === "half-page" ? "lg:sticky lg:top-24" : ""} />
        </SupporterHidden>
      ))}
    </div>
  );
}

// The in-river unit after the RIVER_AFTER-th item of a list, or at the end of a shorter list.
// Render it inside the loop with the item's index and the list's length.
export function RiverAd({ page, index, count, className }: { page: PageType; index: number; count: number; className?: string }) {
  const name = PLACEMENTS[page].river;
  if (!name) return null;
  const last = count - 1;
  const at = count > RIVER_AFTER ? RIVER_AFTER : last;
  if (index !== at) return null;
  const slot = <AdSlot name={name} page={page} />;
  return className ? <div className={className}>{slot}</div> : slot;
}

export function InlineAd({ page }: { page: PageType }) {
  const name = PLACEMENTS[page].inline;
  return name ? <AdSlot name={name} page={page} className="my-2" /> : null;
}
