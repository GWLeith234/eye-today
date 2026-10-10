"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { PollWidget } from "./poll-widget";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The article HTML holds <div data-poll="uuid"> placeholders (React does not manage their children, because the
// body is set as HTML). After hydration, mount a live poll in each. Nothing renders on the server.
export function PollMounts({ selector = ".article-body" }: { selector?: string }) {
  const [targets, setTargets] = useState<HTMLElement[]>([]);

  useEffect(() => {
    const found = Array.from(document.querySelectorAll<HTMLElement>(`${selector} div[data-poll]`)).filter((el) => UUID.test(el.dataset.poll ?? ""));
    for (const el of found) el.textContent = "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the placeholders exist only in the DOM, after hydration
    setTargets(found);
  }, [selector]);

  return <>{targets.map((target, index) => createPortal(<PollWidget pollId={target.dataset.poll!.toLowerCase()} />, target, `${target.dataset.poll}-${index}`))}</>;
}
