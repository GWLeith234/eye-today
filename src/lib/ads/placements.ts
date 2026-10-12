import type { AdSlotName, PageType } from "./slots";

// Which units each page type carries. Placement is data so a page declares its type once and the
// units follow; run of site means a campaign's creatives rotate through all of them.
export const PLACEMENTS: Record<PageType, { top: AdSlotName[]; side: AdSlotName[]; river: AdSlotName | null; inline: AdSlotName | null }> = {
  home: { top: ["leaderboard"], side: ["bigbox-1", "half-page"], river: "in-river", inline: null },
  section: { top: ["leaderboard"], side: ["bigbox-1", "half-page"], river: "in-river", inline: null },
  article: { top: ["leaderboard"], side: ["bigbox-1", "half-page"], river: null, inline: "in-article" },
  directory: { top: ["leaderboard"], side: ["bigbox-1"], river: "in-river", inline: null },
  events: { top: ["leaderboard"], side: ["bigbox-1"], river: "in-river", inline: null },
  jobs: { top: ["leaderboard"], side: ["bigbox-1"], river: "in-river", inline: null },
  editions: { top: ["leaderboard"], side: [], river: null, inline: null },
  other: { top: ["leaderboard"], side: [], river: null, inline: null },
};

// After which list item the in-river unit appears (0-based index of the item it follows).
export const RIVER_AFTER = 3;

const RESERVED = new Set([
  "account", "admin", "api", "auth", "author", "contribute", "login", "preview", "search", "tag",
  "write-for-us", "about", "contact", "advertise", "newsletter", "newsletters", "support",
  "editorial-policy", "corrections", "privacy", "terms", "disclaimer", "ad-policy",
  "community-guidelines", "classifieds", "contests", "news-feed", "legal-map", "tracker",
]);

// The page type of a public path, for units that live in the layout and cannot be told by the
// page. Mirrors the routing: a first segment that is not an app route is a section, and a second
// segment under it is an article.
export function pageTypeFromPath(pathname: string | null): PageType {
  const parts = (pathname ?? "/").split("/").filter(Boolean);
  const [first, second] = parts;
  if (!first) return "home";
  switch (first) {
    case "directory": return "directory";
    case "events": return "events";
    case "jobs": return "jobs";
    case "editions": return "editions";
    case "articles": return second ? "article" : "other";
    default:
      if (RESERVED.has(first)) return "other";
      return second ? "article" : "section";
  }
}
