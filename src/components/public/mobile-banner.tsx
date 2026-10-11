"use client";

import { usePathname } from "next/navigation";

import { pageTypeFromPath } from "@/lib/ads/placements";

import { AdSlot } from "./ad-slot";

// One 320×50 unit fixed to the bottom of small screens, on every public page. It reads the path
// only to label the impression with a page type for the advertiser's report.
export function MobileBanner() {
  const pathname = usePathname();
  return <AdSlot name="mobile-banner" page={pageTypeFromPath(pathname)} />;
}
