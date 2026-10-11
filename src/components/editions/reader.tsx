"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ReaderPage } from "@/lib/editions/model";

// The paged web edition. One page is shown at a time: cover, contents, the editor's letter, then each
// story. ←/→ and the buttons turn pages, a horizontal swipe does too, the hash deep-links a page
// (#contents, #<story-slug>) and the contents page is real links so it works without any of this.

export type ReaderStory = {
  article_slug: string;
  title: string;
  section_slug: string;
  section_name: string;
  dek: string | null;
  byline: string | null;
  published_at: string;
  hero: { src: string; alt: string; credit: string | null } | null;
  html: string;
  words: number;
};

export type ReaderEdition = {
  slug: string;
  title: string;
  label: string;
  cover: { src: string; alt: string } | null;
  letterHtml: string;
  hasPdf: boolean;
  early: boolean;
};

const date = (iso: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso));
const minutes = (words: number) => Math.max(1, Math.round(words / 220));

export function EditionReader({ edition, pages }: { edition: ReaderEdition; pages: ReaderPage<ReaderStory>[] }) {
  const ids = useMemo(() => pages.map((p) => p.id), [pages]);
  const [index, setIndex] = useState(0);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const top = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (next: number, push = true) => {
      const clamped = Math.min(Math.max(next, 0), pages.length - 1);
      setIndex(clamped);
      if (push && typeof window !== "undefined") {
        const hash = clamped === 0 ? "" : `#${ids[clamped]}`;
        window.history.replaceState(null, "", `${window.location.pathname}${hash}`);
      }
      top.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    },
    [ids, pages.length],
  );

  // Deep link on load and on back/forward.
  useEffect(() => {
    const fromHash = () => {
      const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      const at = ids.indexOf(id);
      setIndex(at >= 0 ? at : 0);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [ids]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === "ArrowRight") go(index + 1);
      else if (event.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  const onTouchStart = (event: React.TouchEvent) => {
    const t = event.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const t = event.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1));
  };

  const page = pages[index];
  const stories = pages.flatMap((p) => (p.kind === "story" ? [p.story] : []));

  return (
    <div data-testid="edition-reader" className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3 text-sm">
        <p>
          <Link href="/editions" className="underline">Editions</Link>
          <span className="text-muted"> · {edition.label}</span>
          {edition.early ? <span className="ml-2 rounded border border-rule px-2 text-xs">Supporter early access</span> : null}
        </p>
        <nav aria-label="Pages" className="flex items-center gap-2">
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0} className="rounded border border-rule px-3 py-1 disabled:opacity-40" aria-label="Previous page">←</button>
          <span aria-live="polite" className="tabular-nums text-muted">
            {index + 1} / {pages.length}
          </span>
          <button type="button" onClick={() => go(index + 1)} disabled={index === pages.length - 1} className="rounded border border-rule px-3 py-1 disabled:opacity-40" aria-label="Next page">→</button>
        </nav>
      </header>

      <div ref={top} tabIndex={-1} className="outline-none" data-page={page.id}>
        {page.kind === "cover" ? (
          <section aria-label="Cover" className="flex flex-col gap-4">
            <p className="text-xs font-semibold uppercase tracking-widest">E-edition · {edition.label}</p>
            <h1 className="font-serif text-4xl font-bold sm:text-5xl">{edition.title}</h1>
            {edition.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={edition.cover.src} alt={edition.cover.alt} className="w-full object-cover" />
            ) : null}
            <ul className="flex flex-col gap-1 border-t border-rule pt-3">
              {stories.slice(0, 6).map((story) => (
                <li key={story.article_slug} className="font-serif text-lg">{story.title}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => go(1)} className="rounded bg-ink px-4 py-2 text-paper">Start reading</button>
              {edition.hasPdf ? (
                <a href={`/editions/${edition.slug}/pdf`} className="rounded border border-ink px-4 py-2" download={`eye-today-${edition.slug}.pdf`}>
                  Download PDF
                </a>
              ) : null}
            </div>
          </section>
        ) : null}

        {page.kind === "contents" ? (
          <section aria-labelledby="contents-heading" className="flex flex-col gap-3">
            <h2 id="contents-heading" className="font-serif text-3xl font-bold">Contents</h2>
            <nav aria-label="Contents">
              <ol className="flex flex-col gap-3">
                {pages.some((p) => p.kind === "letter") ? (
                  <li>
                    <a href="#letter" onClick={(e) => { e.preventDefault(); go(ids.indexOf("letter")); }} className="font-serif text-xl font-semibold hover:underline">
                      A letter from the editor
                    </a>
                  </li>
                ) : null}
                {stories.map((story) => (
                  <li key={story.article_slug} className="flex flex-col">
                    <span className="text-xs font-semibold uppercase tracking-widest">{story.section_name}</span>
                    <a href={`#${story.article_slug}`} onClick={(e) => { e.preventDefault(); go(ids.indexOf(story.article_slug)); }} className="font-serif text-xl font-semibold hover:underline">
                      {story.title}
                    </a>
                    {story.dek ? <span className="text-sm text-muted">{story.dek}</span> : null}
                    <span className="text-xs text-muted">{story.byline ? `${story.byline} · ` : ""}{minutes(story.words)} min read</span>
                  </li>
                ))}
              </ol>
            </nav>
          </section>
        ) : null}

        {page.kind === "letter" ? (
          <article aria-labelledby="letter-heading" className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-widest">From the editor</p>
            <h2 id="letter-heading" className="font-serif text-3xl font-bold">A letter from the editor</h2>
            <div className="article-body flex flex-col gap-4" dangerouslySetInnerHTML={{ __html: edition.letterHtml }} />
          </article>
        ) : null}

        {page.kind === "story" ? (
          <article aria-labelledby={`story-${page.story.article_slug}`} className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-widest">{page.story.section_name}</p>
            <h2 id={`story-${page.story.article_slug}`} className="font-serif text-3xl font-bold sm:text-4xl">{page.story.title}</h2>
            {page.story.dek ? <p className="font-serif text-lg text-muted">{page.story.dek}</p> : null}
            <p className="text-sm text-muted">
              {page.story.byline ? `By ${page.story.byline} · ` : ""}
              {date(page.story.published_at)}
            </p>
            {page.story.hero ? (
              <figure className="flex flex-col gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={page.story.hero.src} alt={page.story.hero.alt} className="w-full object-cover" loading="lazy" />
                {page.story.hero.credit ? <figcaption className="text-xs text-muted">Photo: {page.story.hero.credit}</figcaption> : null}
              </figure>
            ) : null}
            <div className="article-body flex flex-col gap-4" dangerouslySetInnerHTML={{ __html: page.story.html }} />
            <p className="text-sm">
              <Link href={`/${page.story.section_slug}/${page.story.article_slug}`} className="underline">Read this story on the site</Link>
            </p>
          </article>
        ) : null}
      </div>

      <footer className="flex items-center justify-between border-t border-rule pt-3 text-sm">
        <button type="button" onClick={() => go(index - 1)} disabled={index === 0} className="underline disabled:opacity-40">Previous</button>
        <a href="#contents" onClick={(e) => { e.preventDefault(); go(1); }} className="underline">Contents</a>
        <button type="button" onClick={() => go(index + 1)} disabled={index === pages.length - 1} className="underline disabled:opacity-40">Next</button>
      </footer>
    </div>
  );
}
