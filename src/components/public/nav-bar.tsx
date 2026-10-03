"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { sectionStyle } from "@/lib/design/section";

import { AccountLink } from "./account-link";
import { SectionIcon } from "./section-icon";
import { IrisMark } from "./wordmark";

export type NavSection = { slug: string; name: string; color: string | null; icon: string | null };

// The sticky bar under the masthead. It is a client component only for three things: the active
// section, the compact state once the masthead has scrolled away, and the slide-out menu. Every
// link is still in the server-rendered HTML.
export function NavBar({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  const sentinel = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDialogElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const element = sentinel.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting), { threshold: 0 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // A link inside the open menu navigates within the same layout, so close the panel when the path changes.
  useEffect(() => {
    const dialog = menu.current;
    if (dialog?.open) dialog.close();
  }, [pathname]);

  const isActive = (slug: string) => pathname === `/${slug}` || pathname.startsWith(`/${slug}/`);

  return (
    <>
      <div ref={sentinel} aria-hidden="true" className="h-px" />
      <div className={`sticky top-0 z-30 border-y-2 border-ink bg-paper transition-shadow ${compact ? "shadow-md" : ""}`}>
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-3 px-4">
          <Link href="/" aria-label="Eye Today home" className={`flex w-8 shrink-0 items-center transition-opacity ${compact ? "opacity-100" : "pointer-events-none opacity-0"}`} tabIndex={compact ? 0 : -1}>
            <IrisMark size={28} />
          </Link>

          <button
            type="button"
            onClick={() => menu.current?.showModal()}
            className="inline-flex items-center gap-2 rounded px-1 py-2 text-sm font-semibold lg:hidden"
            aria-haspopup="dialog"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            Menu
          </button>

          <nav aria-label="Sections" className="hidden min-w-0 flex-1 lg:block">
            <ul className="flex gap-x-5 text-sm font-semibold">
              {sections.map((section) => (
                <li key={section.slug} style={sectionStyle(section.slug, section.color)}>
                  <Link
                    href={`/${section.slug}`}
                    aria-current={pathname === `/${section.slug}` ? "page" : undefined}
                    className={`block border-b-4 py-[0.8rem] hover:sec-rule ${isActive(section.slug) ? "sec-rule" : "border-transparent"}`}
                  >
                    {section.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <ul className="ml-auto flex items-center gap-3 text-sm font-semibold sm:gap-4">
            <li className="hidden sm:block"><Link href="/search" className="hover:underline">Search</Link></li>
            <li className="hidden md:block"><Link href="/newsletter" className="hover:underline">Newsletter</Link></li>
            <li>
              <Link href="/support" className="rounded bg-accent px-3 py-1.5 font-bold text-ink hover:brightness-95">Support us</Link>
            </li>
            <li><AccountLink /></li>
          </ul>
        </div>
      </div>

      <dialog
        ref={menu}
        aria-label="Menu"
        className="menu-panel"
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="flex h-full flex-col gap-6 overflow-y-auto p-5">
          <div className="flex items-center justify-between">
            <p className="font-display text-xl font-bold">Eye Today</p>
            <button type="button" onClick={() => menu.current?.close()} className="rounded border border-ink px-3 py-1 text-sm font-semibold">Close</button>
          </div>
          <nav aria-label="Sections menu">
            <ul className="flex flex-col">
              {sections.map((section) => (
                <li key={section.slug} style={sectionStyle(section.slug, section.color)} className="border-b border-rule">
                  <Link href={`/${section.slug}`} className="sec-text flex items-center gap-2 py-3 font-display text-xl font-bold">
                    <SectionIcon name={section.icon} className="h-5 w-5" />
                    {section.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <ul className="flex flex-col gap-3 text-base font-semibold">
            <li><Link href="/search" className="underline">Search</Link></li>
            <li><Link href="/newsletter" className="underline">Newsletter</Link></li>
            <li><Link href="/support" className="inline-block rounded bg-accent px-4 py-2 font-bold text-ink">Support us</Link></li>
          </ul>
        </div>
      </dialog>
    </>
  );
}
