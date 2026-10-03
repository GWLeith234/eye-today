"use client";

import { useEffect, useRef, useState } from "react";

import type { AdSlotName } from "@/lib/ads/slots";

export type { AdSlotName };

type Creative = { id: string; alt: string; imageUrl: string | null; html: string | null };

// Pages pass only the slot name: they read no cookies and query no ads, so they stay cached.
// The ad is fetched in the browser. Nothing is rendered until one arrives, and nothing at all
// when the slot has no approved creative, the frequency cap is reached, or the reader is a
// supporter looking at a big box.
export function AdSlot({ name }: { name: AdSlotName }) {
  const [ad, setAd] = useState<Creative | null>(null);
  const region = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/ads/serve?slot=${encodeURIComponent(name)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((json: { creative?: Creative } | null) => {
        if (!cancelled && json?.creative) setAd(json.creative);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [name]);

  // One impression: at least half the region visible for one second, sent once.
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
              body: JSON.stringify({ creative: ad.id, slot: name }),
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
  }, [ad, name]);

  if (!ad) return null;

  const clickHref = `/api/ads/click/${ad.id}`;
  return (
    <aside ref={region} aria-label="Advertisement" data-ad-slot={name} className="flex w-full flex-col items-center gap-1 border border-rule bg-white/40 p-2">
      <p className="self-start text-[10px] uppercase tracking-widest text-muted">Advertisement</p>
      {ad.imageUrl ? (
        <a href={clickHref} target="_blank" rel="sponsored noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- third-party ad creative, sized by the advertiser */}
          <img src={ad.imageUrl} alt={ad.alt} loading="lazy" className="h-auto max-w-full" />
        </a>
      ) : ad.html ? (
        <div
          className="ad-html text-sm [&_a]:text-brand [&_a]:underline"
          // Sanitized twice: when it was saved and again by /api/ads/serve.
          dangerouslySetInnerHTML={{ __html: ad.html }}
        />
      ) : null}
    </aside>
  );
}
