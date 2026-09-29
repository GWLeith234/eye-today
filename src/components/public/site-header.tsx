import Link from "next/link";

import { getSections } from "@/lib/public/data";
import { isReservedSectionSlug } from "@/lib/public/reserved";

import { AccountLink } from "./account-link";

// Server component: every link is in the first HTML, no client-only menu. It reads no
// cookies, so the pages around it can be cached; only the account link runs in the browser.
export async function SiteHeader() {
  const sections = await getSections();
  const navSections = sections.filter((s) => !isReservedSectionSlug(s.slug));

  const sectionLinks = navSections.map((section) => (
    <li key={section.id}>
      <Link href={`/${section.slug}`} className="hover:underline">
        {section.name}
      </Link>
    </li>
  ));

  return (
    <header className="border-b-2 border-ink bg-paper">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:bg-paper focus:p-2">
        Skip to content
      </a>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">
          Eye Today
        </Link>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <li><Link href="/search" className="hover:underline">Search</Link></li>
          <li><Link href="/newsletter" className="hover:underline">Newsletter</Link></li>
          <li><Link href="/support" className="hover:underline">Support us</Link></li>
          <li>
            <AccountLink />
          </li>
        </ul>
      </div>
      <nav aria-label="Sections" className="border-t border-rule">
        {/* Small screens: a native <details> disclosure, still plain links in the HTML. */}
        <details className="mx-auto max-w-6xl px-4 py-2 text-sm sm:hidden">
          <summary className="cursor-pointer font-semibold">Sections</summary>
          <ul className="mt-2 flex flex-col gap-2">{sectionLinks}</ul>
        </details>
        <ul className="mx-auto hidden max-w-6xl flex-wrap gap-x-5 gap-y-1 px-4 py-2 text-sm font-semibold sm:flex">{sectionLinks}</ul>
      </nav>
    </header>
  );
}
