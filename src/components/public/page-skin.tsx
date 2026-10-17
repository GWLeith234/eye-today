"use client";

import { usePathname } from "next/navigation";

import { pageTypeFromPath } from "@/lib/ads/placements";

import { SkinSlot } from "./ad-slot";

// The takeover wallpaper on every public page. It reads the path only to label the impression with a page
// type for the advertiser's report.
export function PageSkin() {
  const pathname = usePathname();
  return <SkinSlot page={pageTypeFromPath(pathname)} />;
}
