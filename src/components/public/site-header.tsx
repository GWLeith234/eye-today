import Link from "next/link";

import { getSections } from "@/lib/public/data";
import { isReservedSectionSlug } from "@/lib/public/reserved";

import { type NavSection, NavBar } from "./nav-bar";
import { TodayDate } from "./today-date";
import { Wordmark } from "./wordmark";

// Server component: the masthead and every link are in the first HTML. It reads no cookies, so the
// pages around it stay cacheable; the date, the account link and the sticky behaviour run in the browser.
export async function SiteHeader() {
  const sections = (await getSections()).filter((s) => !isReservedSectionSlug(s.slug));
  const nav: NavSection[] = sections.map(({ slug, name, color, icon }) => ({ slug, name, color, icon }));

  return (
    <header className="bg-paper">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:bg-paper focus:p-2">
        Skip to content
      </a>
      <div className="bg-ink text-paper">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-1">
          <TodayDate />
          <p className="hidden text-xs sm:block">News, research and stories about eye health</p>
        </div>
      </div>
      <div className="mx-auto flex max-w-6xl justify-center px-4 py-5 sm:py-7">
        <Link href="/" className="block" aria-label="Eye Today — home">
          <Wordmark className="h-11 w-auto sm:h-14" />
        </Link>
      </div>
      <NavBar sections={nav} />
    </header>
  );
}
