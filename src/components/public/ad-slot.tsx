"use client";

import { type RefObject, useEffect, useRef, useState } from "react";

import { type AdSlotName, type PageType, PAGE_COLUMN_PX, SLOT_SIZES } from "@/lib/ads/slots";

export type { AdSlotName };

type Creative = { id: string; alt: string; imageUrl: string | null; html: string | null; house?: boolean };

// Pages pass only the slot name: they read no cookies and query no ads, so they stay cached.
// The ad is fetched in the browser. Nothing is rendered until one arrives, and nothing at all
// when the slot has no approved creative, the frequency cap is reached, or the reader is a
// supporter looking at a unit supporters do not see.
function useAd(name: AdSlotName, page: PageType) {
  const [ad, setAd] = useState<Creative | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/ads/serve?slot=${encodeURIComponent(name)}&page=${encodeURIComponent(page)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((json: { creative?: Creative } | null) => {
        if (!cancelled && json?.creative?.imageUrl) setAd(json.creative);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [name, page]);
  return ad;
}

// One impression: at least half the region visible for one second, sent once.
function useImpression(region: RefObject<HTMLElement | null>, ad: Creative | null, name: AdSlotName, page: PageType) {
  useEffect(() => {
    const element = region.current;
    if (!ad || !element || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sent = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (sent) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          timer ??= setTimeout(() => {
            sent = true;
            observer.disconnect();
            fetch("/api/ads/event", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ creative: ad.id, slot: name, page }),
              keepalive: true,
            }).catch(() => {});
          }, 1000);
        } else if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [region, ad, name, page]);
}

const clickHref = (ad: Creative, page: PageType) => `/api/ads/click/${ad.id}?page=${encodeURIComponent(page)}`;

// A display unit the way a community daily runs one: the IAB box on the cool ad ground, framed by the ad
// line, with "Advertisement" set small above it. The box never grows past the viewport; on a phone a wide
// unit scales down in proportion. The band fills its container, so a unit placed in a 300 px rail is a
// 300 px band and one placed across the page is a page-wide band.
export function AdSlot({ name, page = "other", className = "" }: { name: AdSlotName; page?: PageType; className?: string }) {
  const ad = useAd(name, page);
  const [dismissed, setDismissed] = useState(false);
  const region = useRef<HTMLElement>(null);
  useImpression(region, ad, name, page);

  if (!ad || dismissed || !ad.imageUrl) return null;
  const { width, height } = SLOT_SIZES[name];

  if (name === "mobile-banner") {
    return (
      <aside ref={region} aria-label="Advertisement" data-ad-slot={name} data-ad-house={ad.house ? "1" : undefined} className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-center gap-2 border-t border-ad-line bg-ad-ground px-2 py-1 sm:hidden">
        <a href={clickHref(ad, page)} target="_blank" rel="sponsored noopener noreferrer" className="block" style={{ width, height }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- third-party ad creative at the unit's IAB size */}
          <img src={ad.imageUrl} alt={ad.alt} width={width} height={height} loading="lazy" className="block h-full w-full object-contain" />
        </a>
        <button type="button" onClick={() => setDismissed(true)} aria-label="Close advertisement" className="shrink-0 rounded border border-ad-line bg-paper px-1.5 text-xs leading-5">×</button>
      </aside>
    );
  }
  return (
    <aside ref={region} aria-label="Advertisement" data-ad-slot={name} data-ad-house={ad.house ? "1" : undefined} className={`flex w-full flex-col items-center gap-1.5 border-y border-ad-line bg-ad-ground px-2 pb-2.5 pt-1.5 ${className}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Advertisement</p>
      {/* An editor can save a creative with no alt text, and a link whose only content is an image
          with an empty alt has no accessible name at all. The unit's own label stands in. */}
      <a href={clickHref(ad, page)} target="_blank" rel="sponsored noopener noreferrer" aria-label={ad.alt ? undefined : "Advertisement"} className="block w-full max-w-full border border-ad-line bg-paper" style={{ maxWidth: width, aspectRatio: `${width} / ${height}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- third-party ad creative at the unit's IAB size */}
        <img src={ad.imageUrl} alt={ad.alt} width={width} height={height} loading="lazy" className="block h-full w-full object-contain" />
      </a>
    </aside>
  );
}

// The skin: the advertiser's wallpaper behind the whole page, with the two gutters beside the content
// column clicking through. It paints a fixed layer under the page, so the page's own paper column sits on
// it; readers on screens narrower than the column never see it, and nothing is fetched for them.
export function SkinSlot({ page }: { page: PageType }) {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${PAGE_COLUMN_PX + 160}px)`);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide ? <SkinLayer page={page} /> : null;
}

function SkinLayer({ page }: { page: PageType }) {
  const ad = useAd("skin", page);
  const region = useRef<HTMLElement>(null);
  useImpression(region, ad, "skin", page);
  if (!ad?.imageUrl) return null;
  // 100% of the fixed layer, not 100vw: vw includes a classic scrollbar and the layer does not, so on
  // Windows and Linux a vw gutter overhangs the paper column and the outer few pixels of the story
  // click through to the advertiser.
  const gutter = `calc((100% - ${PAGE_COLUMN_PX}px) / 2)`;
  const href = clickHref(ad, page);
  return (
    <aside ref={region} aria-label="Advertisement" data-ad-slot="skin" data-ad-house={ad.house ? "1" : undefined} className="pointer-events-none fixed inset-0 z-0" style={{ backgroundImage: `url("${ad.imageUrl}")`, backgroundPosition: "top center", backgroundRepeat: "no-repeat", backgroundSize: `${SLOT_SIZES.skin.width}px auto`, backgroundColor: "var(--color-stage)" }}>
      <a href={href} target="_blank" rel="sponsored noopener noreferrer" aria-label={ad.alt || "Advertisement"} className="pointer-events-auto absolute inset-y-0 left-0 block" style={{ width: gutter }} />
      <a href={href} target="_blank" rel="sponsored noopener noreferrer" aria-label={ad.alt || "Advertisement"} className="pointer-events-auto absolute inset-y-0 right-0 block" style={{ width: gutter }} />
    </aside>
  );
}
