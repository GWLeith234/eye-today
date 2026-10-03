"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const today = () => new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

// Rendered in the browser so a cached or prerendered page never shows yesterday's date. The server
// snapshot is empty and the box has a fixed height, so filling it in moves nothing.
export function TodayDate() {
  const text = useSyncExternalStore(subscribe, today, () => "");
  return <time suppressHydrationWarning className="block h-5 min-w-[13rem] text-xs font-medium leading-5">{text}</time>;
}
