"use client";

import { useEffect, useRef, useState } from "react";

import type { AdSlotName, PageType } from "@/lib/ads/slots";

export type { AdSlotName };

type Creative = { id: string; alt: string; imageUrl: string | null; html: string | null; house?: boolean };

// Pages pass only the slot name: they read no cookies and query no ads, so they stay cached.
// The ad is fetched in the browser. Nothing is rendered until one arrives, and nothing at all
// when the slot has no approved creative, the frequency cap is reached, or the reader is a
// supporter looking at a big box.
export function AdSlot({ name, page = "other" }: { name: AdSlotName; page?: PageType }) {
  const [ad, setAd] = useState<Creative | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const region = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/ads/serve?slot=${encodeURIComponent(name)}&page=${encodeURIComponent(page)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((json: { creative?: Creative } | null) => {
        if (!cancelled && json?.creative) setAd(json.creative);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [name, page]);

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
  }, [ad, name, page]);

  if (!ad || dismissed) return null;

  const clickHref = `/api/ads/click/${ad.id}?page=${encodeURIComponent(page)}`;
  const mobile = name === "mobile-banner";
  const frame = mobile
    ? "fixed inset-x-0 bottom-0 z-40 flex items-center justify-center gap-2 border-t border-rule bg-paper px-2 py-1 shadow-[0_-2px_8px_rgba(0,0,0,0.08)] sm:hidden"
    : "flex w-full flex-col items-center gap-1 border border-rule bg-white/40 p-2";
  return (
    <aside ref={region} aria-label="Advertisement" data-ad-slot={name} data-ad-house={ad.house ? "1" : undefined} className={frame}>
      {mobile ? (
        <button type="button" onClick={() => setDismissed(true)} aria-label="Close advertisement" className="order-last shrink-0 rounded border border-rule px-1.5 text-xs leading-5">×</button>
      ) : (
        <p className="self-start text-[10px] uppercase tracking-widest text-muted">Advertisement</p>
      )}
      {ad.imageUrl ? (
        <a href={clickHref} target="_blank" rel="sponsored noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- third-party ad creative, sized by the advertiser */}
          <img src={ad.imageUrl} alt={ad.alt} loading="lazy" className="h-auto max-w-full" />
        </a>
      ) : ad.html ? (
        <div
          className={`ad-html text-sm [&_a]:text-brand [&_a]:underline [&_img]:mx-auto [&_img]:block [&_img]:h-auto [&_img]:max-w-full ${mobile ? "min-w-0 flex-1 truncate [&_p]:m-0" : ""}`}
          // Sanitized twice: when it was saved and again by /api/ads/serve.
          dangerouslySetInnerHTML={{ __html: ad.html }}
        />
      ) : null}
    </aside>
  );
}
