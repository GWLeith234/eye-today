// Pure constants shared by the client component, the routes and the admin.
export const AD_SLOT_NAMES = ["skin", "billboard", "leaderboard", "bigbox-1", "bigbox-2", "half-page", "in-river", "in-article", "mobile-banner"] as const;
export type AdSlotName = (typeof AD_SLOT_NAMES)[number];

export const isAdSlotName = (value: unknown): value is AdSlotName =>
  typeof value === "string" && (AD_SLOT_NAMES as readonly string[]).includes(value);

// The takeover: the skin behind the page and the billboard under the navigation, sold together by the day or
// the week, never as part of the run-of-site buy. Editors load the artwork in Admin → Ads.
export const TAKEOVER_SLOTS: readonly AdSlotName[] = ["skin", "billboard"];

// The units an advertiser can fill from the self-serve form (run of site).
export const SELF_SERVE_SLOTS = AD_SLOT_NAMES.filter((name) => !TAKEOVER_SLOTS.includes(name));

// Supporters do not see the sidebar units or the skin.
export const SUPPORTER_HIDDEN: readonly AdSlotName[] = ["skin", "bigbox-1", "bigbox-2", "half-page"];

export const AD_CATEGORIES = ["clinic", "research", "advocacy", "events", "other"] as const;
export const CAMPAIGN_STATUSES = ["draft", "pending", "active", "paused", "ended", "rejected"] as const;

// Where an ad is shown; recorded with each impression so a report can say where a campaign ran.
export const PAGE_TYPES = ["home", "section", "article", "directory", "events", "jobs", "editions", "other"] as const;
export type PageType = (typeof PAGE_TYPES)[number];
export const isPageType = (value: unknown): value is PageType =>
  typeof value === "string" && (PAGE_TYPES as readonly string[]).includes(value);

// Unit sizes, for the advertiser's upload form and the rate card. Every unit but the skin is an IAB standard
// size, so artwork made for any other publisher fits without a resize. The skin is the wallpaper behind the
// page: 1920 wide with the centre 1180 px left plain for the content column, 1400 tall, fixed to the top.
export const SLOT_SIZES: Record<AdSlotName, { width: number; height: number; label: string; iab: string; where: string }> = {
  skin: { width: 1920, height: 1400, label: "Skin", iab: "Page takeover (wallpaper)", where: "Behind the whole page on desktop; both gutters click through" },
  billboard: { width: 970, height: 250, label: "Billboard", iab: "Billboard", where: "Under the navigation on every page (desktop)" },
  leaderboard: { width: 728, height: 90, label: "Leaderboard", iab: "Leaderboard", where: "Between sections on the cover and section fronts (desktop)" },
  "mobile-banner": { width: 320, height: 50, label: "Mobile banner", iab: "Mobile leaderboard", where: "Bottom of the screen on phones" },
  "bigbox-1": { width: 300, height: 250, label: "Big box", iab: "Medium rectangle", where: "Top of the rail on every page" },
  "bigbox-2": { width: 300, height: 250, label: "Big box (second)", iab: "Medium rectangle", where: "Detail pages (listings, events, jobs)" },
  "half-page": { width: 300, height: 600, label: "Half page", iab: "Half page", where: "Lower rail on the cover, sections and stories; stays in view as the reader scrolls" },
  "in-river": { width: 728, height: 90, label: "In-feed leaderboard", iab: "Leaderboard", where: "Between stories and listings" },
  "in-article": { width: 300, height: 250, label: "In-article", iab: "Medium rectangle", where: "Inside every story" },
};

// Run-of-site pricing, in whole dollars. The Stripe price is the source of truth at checkout.
export const ROS_MONTHLY_USD = 250;
export const PREMIUM_LISTING_ANNUAL_USD = 240;
export const MAX_CAMPAIGN_MONTHS = 12;

// The content column on desktop, in px: the width the skin leaves plain and the width the billboard band fills.
export const PAGE_COLUMN_PX = 1180;
