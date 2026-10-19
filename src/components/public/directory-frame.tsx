import Link from "next/link";

import type { PageType } from "@/lib/ads/slots";
import { MEDICAL_DISCLAIMER } from "@/lib/public/disclaimer";
import { SideAds, TopAds } from "./page-ads";

export function DirectoryFrame({ children, ads = "directory" }: { children: React.ReactNode; ads?: PageType }) {
  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-6 px-4 py-8">
      <nav aria-label="Directory" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <Link href="/directory" className="font-semibold hover:underline">Directory</Link>
        <Link href="/directory/how-we-verify" className="hover:underline">How we verify</Link>
        <Link href="/directory/submit" className="hover:underline">Add a listing</Link>
      </nav>
      <TopAds page={ads} />
      {/* The rail beside the content on desktop, the same grammar as the cover and the section fronts. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-6">{children}</div>
        <SideAds page={ads} className="mx-auto flex w-full max-w-[300px] flex-col gap-6 lg:mx-0" />
      </div>
      <p role="note" className="border-l-4 border-accent bg-white/60 p-3 text-sm font-semibold">
        {MEDICAL_DISCLAIMER}{" "}
        <Link href="/disclaimer" className="underline">Read the disclaimer</Link>
      </p>
    </div>
  );
}
