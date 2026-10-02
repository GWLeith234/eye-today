// Pure constants shared by the client component, the routes and the admin.
export const AD_SLOT_NAMES = ["leaderboard", "bigbox-1", "bigbox-2", "in-river", "in-article"] as const;
export type AdSlotName = (typeof AD_SLOT_NAMES)[number];

export const isAdSlotName = (value: unknown): value is AdSlotName =>
  typeof value === "string" && (AD_SLOT_NAMES as readonly string[]).includes(value);

// Supporters do not see these two.
export const SUPPORTER_HIDDEN: readonly AdSlotName[] = ["bigbox-1", "bigbox-2"];

export const AD_CATEGORIES = ["clinic", "research", "advocacy", "events", "other"] as const;
export const CAMPAIGN_STATUSES = ["draft", "active", "paused", "ended"] as const;
