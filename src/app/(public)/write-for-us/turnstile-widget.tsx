"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type Turnstile = {
  render: (element: HTMLElement, options: { sitekey: string; action?: string }) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

// Renders Cloudflare Turnstile; it adds a hidden `cf-turnstile-response` input
// to the surrounding form. The site key is the only Turnstile value in the browser.
export function TurnstileWidget({ siteKey, action = "write_for_us" }: { siteKey: string; action?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded || !container.current || !window.turnstile) return;
    const id = window.turnstile.render(container.current, { sitekey: siteKey, action });
    return () => window.turnstile?.remove(id);
  }, [loaded, siteKey, action]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setLoaded(true)}
      />
      <div ref={container} />
    </>
  );
}
