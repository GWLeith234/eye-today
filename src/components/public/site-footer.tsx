import Link from "next/link";

import { sectionIconName, sectionInkVar } from "@/lib/brand/palette";
import type { Section } from "@/lib/public/data";
import { isReservedSectionSlug } from "@/lib/public/reserved";
import { siteOrigin } from "@/lib/public/site";

import { NewsletterForm } from "./newsletter-form";
import { SectionIcon } from "./section-icon";
import { Wordmark } from "./wordmark";

const ABOUT = [
  { href: "/directory", label: "Directory" },
  { href: "/events", label: "Events" },
  { href: "/jobs", label: "Jobs" },
  { href: "/classifieds", label: "Classifieds" },
  { href: "/contests", label: "Contests" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/write-for-us", label: "Write for us" },
  { href: "/editorial-policy", label: "Editorial policy" },
  { href: "/corrections", label: "Corrections" },
];

const LEGAL = [
  { href: "/advertise", label: "Advertise" },
  { href: "/ad-policy", label: "Ad policy" },
  { href: "/disclaimer", label: "Disclaimer" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/community-guidelines", label: "Community guidelines" },
];

export function SiteFooter({ sections }: { sections: Section[] }) {
  const nav = sections.filter((section) => !isReservedSectionSlug(section.slug));
  const origin = siteOrigin();
  const share = origin ? encodeURIComponent(origin) : null;
  return (
    <footer className="mt-12 border-t-2 border-ink bg-paper">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <nav aria-label="Footer sections">
          <h2 className="mb-3 font-display text-lg font-semibold">Sections</h2>
          <ul className="flex flex-col gap-2">
            {nav.map((section) => (
              <li key={section.id}>
                <Link href={`/${section.slug}`} className="inline-flex items-center gap-2 hover:underline" style={{ color: sectionInkVar(section.slug) }}>
                  <SectionIcon name={sectionIconName(section.slug, section.icon)} className="size-4" />
                  {section.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Footer">
          <h2 className="mb-3 font-display text-lg font-semibold">About</h2>
          <ul className="flex flex-col gap-2">
            {ABOUT.map((link) => (
              <li key={link.href}><Link href={link.href} className="hover:underline">{link.label}</Link></li>
            ))}
            {LEGAL.map((link) => (
              <li key={link.href}><Link href={link.href} className="hover:underline">{link.label}</Link></li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-col gap-4">
          <Wordmark className="h-8" />
          <section aria-label="Newsletter">
            <h2 className="mb-2 font-display text-lg font-semibold">Newsletter</h2>
            <NewsletterForm compact />
          </section>
          {share ? (
            <p className="text-muted">
              Share on{" "}
              <a className="underline" href={`https://twitter.com/intent/tweet?text=Eye%20Today&url=${share}`}>X</a>
              {" · "}
              <a className="underline" href={`https://www.facebook.com/sharer/sharer.php?u=${share}`}>Facebook</a>
            </p>
          ) : null}
        </div>
      </div>
      <div className="border-t border-rule">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>Published by EvolveX360</p>
          <p>
            <Link href="/disclaimer" className="hover:underline">Information only — not medical advice.</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
