// Pure constants shared by the client component, the routes and the admin.
export const AD_SLOT_NAMES = ["leaderboard", "bigbox-1", "bigbox-2", "in-river", "in-article", "mobile-banner"] as const;
export type AdSlotName = (typeof AD_SLOT_NAMES)[number];

export const isAdSlotName = (value: unknown): value is AdSlotName =>
  typeof value === "string" && (AD_SLOT_NAMES as readonly string[]).includes(value);

// Supporters do not see these two.
export const SUPPORTER_HIDDEN: readonly AdSlotName[] = ["bigbox-1", "bigbox-2"];

export const AD_CATEGORIES = ["clinic", "research", "advocacy", "events", "other"] as const;
export const CAMPAIGN_STATUSES = ["draft", "pending", "active", "paused", "ended", "rejected"] as const;

// Where an ad is shown; recorded with each impression so a report can say where a campaign ran.
export const PAGE_TYPES = ["home", "section", "article", "directory", "events", "jobs", "editions", "other"] as const;
export type PageType = (typeof PAGE_TYPES)[number];
export const isPageType = (value: unknown): value is PageType =>
  typeof value === "string" && (PAGE_TYPES as readonly string[]).includes(value);

// Unit sizes, for the advertiser's upload form and the rate card. Pixels; 0 = flexible.
export const SLOT_SIZES: Record<AdSlotName, { width: number; height: number; label: string; where: string }> = {
  leaderboard: { width: 728, height: 90, label: "Leaderboard", where: "Top of every page (desktop)" },
  "mobile-banner": { width: 320, height: 50, label: "Mobile banner", where: "Bottom of the screen on phones" },
  "bigbox-1": { width: 300, height: 250, label: "Big box", where: "Sidebar on every page" },
  "bigbox-2": { width: 300, height: 250, label: "Big box (second)", where: "Lower sidebar and detail pages" },
  "in-river": { width: 640, height: 120, label: "In-river", where: "Between stories and listings" },
  "in-article": { width: 640, height: 250, label: "In-article", where: "Inside every story" },
};

// Run-of-site pricing, in whole dollars. The Stripe price is the source of truth at checkout.
export const ROS_MONTHLY_USD = 250;
export const PREMIUM_LISTING_ANNUAL_USD = 240;
export const MAX_CAMPAIGN_MONTHS = 12;
