"use client";

import dynamic from "next/dynamic";

import type { MapPin } from "./directory-map-inner";

// Leaflet touches window, so it loads only in the browser. The box has a fixed height, so the page
// does not move when the map arrives.
const Inner = dynamic(() => import("./directory-map-inner"), {
  ssr: false,
  loading: () => <div className="flex h-[420px] w-full items-center justify-center bg-rule text-sm" aria-busy="true">Loading map…</div>,
});

export function DirectoryMap({ pins }: { pins: MapPin[] }) {
  return (
    <section aria-label="Map of results" className="flex flex-col gap-2">
      <Inner pins={pins} />
      <p className="text-sm text-muted">
        {pins.length === 0 ? "None of these listings has a map position yet." : "Map positions are set by editors. The list below shows the same listings."}
      </p>
    </section>
  );
}
