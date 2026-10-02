"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { useRole } from "./use-role";

const KEY = "support-note-dismissed-at";
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

function dismissedRecently(): boolean {
  try {
    const at = Number(window.localStorage.getItem(KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < THIRTY_DAYS;
  } catch {
    return false;
  }
}

const EVENT = "support-note-dismissed";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// A quiet note after the story. Dismissing stores a timestamp in localStorage for 30 days: no
// cookie, and it sits in the page flow so it never covers the article. Supporters do not see it.
export function SupportNote() {
  const role = useRole();
  // Hidden on the server and during hydration; the browser then reads localStorage.
  const hidden = useSyncExternalStore(subscribe, dismissedRecently, () => true);

  if (hidden || role === "supporter") return null;
  return (
    <aside aria-label="Support Eye Today" className="flex flex-wrap items-center justify-between gap-3 border border-rule bg-white/60 p-4 text-sm">
      <p>
        Eye Today is free to read because readers chip in.{" "}
        <Link href="/support" className="font-semibold underline">Support our reporting</Link>.
      </p>
      <button
        type="button"
        className="rounded border px-2 py-1"
        onClick={() => {
          try {
            window.localStorage.setItem(KEY, String(Date.now()));
          } catch {
            // Storage blocked: the note just comes back next visit.
          }
          window.dispatchEvent(new Event(EVENT));
        }}
      >
        Dismiss
      </button>
    </aside>
  );
}
