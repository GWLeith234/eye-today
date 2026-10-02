export const siteOrigin = (siteUrl: string) => siteUrl.replace(/\/+$/, "");

export const confirmUrl = (siteUrl: string, rawToken: string) =>
  `${siteOrigin(siteUrl)}/newsletter/confirm?t=${encodeURIComponent(rawToken)}`;

export const unsubscribeUrl = (siteUrl: string, rawToken: string) =>
  `${siteOrigin(siteUrl)}/newsletter/unsubscribe?t=${encodeURIComponent(rawToken)}`;

export const storyUrl = (siteUrl: string, sectionSlug: string, slug: string) =>
  `${siteOrigin(siteUrl)}/${sectionSlug}/${slug}`;

// Placeholder in the rendered HTML, replaced per recipient.
export const UNSUBSCRIBE_PLACEHOLDER = "https://unsubscribe.invalid/{{unsubscribe}}";
