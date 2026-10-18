"use client";

import { useEffect } from "react";

// Registers /sw.js, which is what makes the site installable on a phone. Registration waits for load so it
// never competes with the first paint, and it is skipped outside production so a dev server is never served
// from a cache.
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // An unavailable worker only costs the offline page; the site works without it.
      });
    };
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}
