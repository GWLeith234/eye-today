"use client";

import { useSyncExternalStore } from "react";

import { CopyLink } from "./copy-link";

// Plain share links, no SDKs. The absolute URL comes from SITE_URL when set,
// otherwise from the address bar once the page has loaded.
const noopSubscribe = () => () => {};

export function ShareRow({ path, title, origin }: { path: string; title: string; origin: string | null }) {
  const base = useSyncExternalStore(
    noopSubscribe,
    () => origin ?? window.location.origin,
    () => origin ?? "",
  );
  const url = `${base}${path}`;
  const text = encodeURIComponent(title);
  const link = encodeURIComponent(url);
  return (
    <nav aria-label="Share" className="flex flex-wrap items-center gap-3 text-sm">
      <span className="font-semibold">Share</span>
      <CopyLink url={url} />
      <a href={`https://twitter.com/intent/tweet?text=${text}&url=${link}`} target="_blank" rel="noopener noreferrer" className="underline">
        X
      </a>
      <a href={`https://www.facebook.com/sharer/sharer.php?u=${link}`} target="_blank" rel="noopener noreferrer" className="underline">
        Facebook
      </a>
      <a href={`mailto:?subject=${text}&body=${link}`} className="underline">
        Email
      </a>
    </nav>
  );
}
