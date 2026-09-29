"use client";

import { useEffect, useRef } from "react";

// Counts one view after the page has painted. The server hashes the IP; the
// response is always 204, so it reveals nothing.
export function ViewBeacon({ articleId }: { articleId: string }) {
  const sent = useRef(false);
  useEffect(() => {
    const send = () => {
      if (sent.current) return;
      sent.current = true;
      fetch("/api/view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: articleId }),
        keepalive: true,
      }).catch(() => {});
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(send, { timeout: 3000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(send, 1);
    return () => window.clearTimeout(handle);
  }, [articleId]);
  return null;
}
