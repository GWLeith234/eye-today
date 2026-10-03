import Link from "next/link";

import { sectionStyle } from "@/lib/design/section";
import { getSections } from "@/lib/public/data";
import { isReservedSectionSlug } from "@/lib/public/reserved";

import { NewsletterForm } from "./newsletter-form";
import { Wordmark } from "./wordmark";

const ABOUT = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/write-for-us", label: "Write for us" },
  { href: "/advertise", label: "Advertise" },
  { href: "/support", label: "Support us" },
];

const LEGAL = [
  { href: "/editorial-policy", label: "Editorial policy" },
  { href: "/corrections", label: "Corrections" },
  { href: "/ad-policy", label: "Ad policy" },
  { href: "/disclaimer", label: "Disclaimer" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export async function SiteFooter() {
  const sections = (await getSections()).filter((s) => !isReservedSectionSlug(s.slug));

  return (
    <footer className="mt-16 border-t-4 border-brand bg-ink text-paper">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 text-sm md:grid-cols-3">
        <div className="flex flex-col gap-4">
          <div className="inline-block rounded bg-paper p-3 self-start">
            <Wordmark className="h-9 w-auto" />
          </div>
          <nav aria-label="Sections in the footer">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-accent">Sections</h2>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
              {sections.map((section) => (
                <li key={section.slug} style={sectionStyle(section.slug, section.color)} className="flex items-center gap-2">
                  <span aria-hidden="true" className="sec-bg inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-paper" />
                  <Link href={`/${section.slug}`} className="underline-offset-4 hover:underline">{section.name}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <nav aria-label="About and legal" className="grid grid-cols-2 gap-6">
          <div>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-accent">About</h2>
            <ul className="flex flex-col gap-2">
              {ABOUT.map((link) => (
                <li key={link.href}><Link href={link.href} className="underline-offset-4 hover:underline">{link.label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-accent">Legal</h2>
            <ul className="flex flex-col gap-2">
              {LEGAL.map((link) => (
                <li key={link.href}><Link href={link.href} className="underline-offset-4 hover:underline">{link.label}</Link></li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="flex flex-col gap-4">
          <section aria-label="Newsletter" className="flex flex-col gap-2 rounded bg-paper p-4 text-ink">
            <h2 className="font-display text-xl font-bold">Get the newsletter</h2>
            <NewsletterForm compact />
          </section>
          <p>
            <Link href="/rss.xml" className="underline underline-offset-4">RSS feed</Link>
            {" · "}
            <Link href="/newsletter" className="underline underline-offset-4">About the newsletters</Link>
          </p>
        </div>
      </div>

      <div className="border-t border-paper/25">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>Published by EvolveX360</p>
          <p>
            <Link href="/disclaimer" className="underline underline-offset-4">Information only — not medical advice.</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
