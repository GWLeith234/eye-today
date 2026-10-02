import Script from "next/script";

// Cookieless pageviews. Omitted entirely when the domain is unset, and only mounted
// from the public layout, so admin, account, contribute and preview stay out.
export function Plausible() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim();
  if (!domain) return null;
  return <Script defer data-domain={domain} src="https://plausible.io/js/script.js" strategy="afterInteractive" />;
}
