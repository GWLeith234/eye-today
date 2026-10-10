"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { sectionBandVar, sectionIconName, sectionInkVar } from "@/lib/brand/palette";

import { AccountLink } from "./account-link";
import { NewsletterForm } from "./newsletter-form";
import { SectionIcon } from "./section-icon";
import { Wordmark } from "./wordmark";

export type NavSection = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  icon: string | null;
};

function SectionLink({ section, active }: { section: NavSection; active: boolean }) {
  return (
    <Link
      href={`/${section.slug}`}
      className="inline-flex items-center gap-1.5 border-b-2 border-transparent pb-0.5 font-semibold hover:border-current"
      style={{
        color: sectionInkVar(section.slug),
        borderColor: active ? sectionBandVar(section.slug) : undefined,
      }}
      aria-current={active ? "page" : undefined}
    >
      <SectionIcon name={sectionIconName(section.slug, section.icon)} className="size-4" />
      {section.name}
    </Link>
  );
}

export function Masthead({ sections, dateLabel }: { sections: NavSection[]; dateLabel: string }) {
  const path = usePathname();
  const [compact, setCompact] = useState(false);
  // The path the menu was opened on. A client navigation changes `path`, so the
  // overlay, focus trap and scroll lock drop without an effect.
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const open = menuPath === path;
  const closeMenu = () => setMenuPath(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    // The compact header is shorter. A single threshold lets scroll anchoring
    // drop back under it and flip the date row on and off. Stay compact until
    // the reader is well above the point where the row collapsed.
    const onScroll = () => {
      const y = window.scrollY;
      setCompact((current) => (current ? y > 16 : y > 72));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMenuPath(null);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!open) return;
    const root = panel.current;
    const focusable = () =>
      root?.querySelectorAll<HTMLElement>('a[href], button, input, summary, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [];
    const first = focusable()[0];
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
        menuButton.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = [...focusable()];
      if (!nodes.length) return;
      const start = nodes[0];
      const end = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === start) {
        event.preventDefault();
        end.focus();
      } else if (!event.shiftKey && document.activeElement === end) {
        event.preventDefault();
        start.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const activeSlug = sections.find((section) => path === `/${section.slug}` || path.startsWith(`/${section.slug}/`))?.slug;

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:bg-paper focus:p-2">
        Skip to content
      </a>
      <div className={`border-b border-rule text-center text-xs font-semibold uppercase tracking-[0.18em] text-muted ${compact ? "hidden" : "px-4 py-1.5"}`}>
        <p>{dateLabel}</p>
      </div>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2">
        <Link href="/" className="text-ink">
          <Wordmark className={compact ? "h-7" : "h-9"} />
        </Link>
        <nav aria-label="Sections" data-testid="section-nav" className="order-last hidden w-full flex-wrap gap-x-4 gap-y-1 lg:order-none lg:flex lg:w-auto">
          {sections.map((section) => (
            <SectionLink key={section.id} section={section} active={section.slug === activeSlug} />
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/directory" className="hover:underline">Directory</Link>
          <Link href="/events" className="hover:underline">Events</Link>
          <Link href="/search" className="hover:underline">Search</Link>
          <details className="relative hidden md:block">
            <summary className="cursor-pointer hover:underline">Newsletter</summary>
            <div className="absolute right-0 z-20 mt-2 w-72 border border-rule bg-paper p-3 text-ink shadow">
              <NewsletterForm compact />
              <Link href="/newsletter" className="mt-2 inline-block text-muted underline">About the newsletters</Link>
            </div>
          </details>
          <Link href="/support" className="rounded bg-accent px-3 py-1.5 font-semibold text-ink hover:opacity-90">
            Support
          </Link>
          <span className="hidden sm:inline">
            <AccountLink />
          </span>
          <button
            ref={menuButton}
            type="button"
            className="rounded border border-ink px-2 py-1 font-semibold lg:hidden"
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setMenuPath(path)}
          >
            Menu
          </button>
        </div>
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close menu" tabIndex={-1} className="absolute inset-0 cursor-default bg-ink/40" onClick={closeMenu} />
          <div
            id="site-menu"
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="absolute inset-y-0 right-0 z-10 flex w-[min(100%,20rem)] flex-col gap-4 overflow-y-auto bg-paper p-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 id={titleId} className="font-display text-xl font-semibold">Sections</h2>
              <button type="button" className="rounded border border-ink px-2 py-1 text-sm font-semibold" onClick={() => { closeMenu(); menuButton.current?.focus(); }}>
                Close
              </button>
            </div>
            <nav aria-label="Sections" className="flex flex-col gap-3 text-base">
              {sections.map((section) => (
                <SectionLink key={section.id} section={section} active={section.slug === activeSlug} />
              ))}
            </nav>
            <div className="flex flex-col gap-3 border-t border-rule pt-3 text-sm">
              <Link href="/directory" className="hover:underline">Directory</Link>
              <Link href="/events" className="hover:underline">Events</Link>
              <Link href="/search" className="hover:underline">Search</Link>
              <Link href="/newsletter" className="hover:underline">Newsletter</Link>
              <Link href="/support" className="font-semibold hover:underline">Support</Link>
              <AccountLink />
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
