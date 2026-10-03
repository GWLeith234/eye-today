// Small line icons a section can choose (sections.icon). Plain paths, decorative: the section name is always beside them.

export const SECTION_ICONS = ["newspaper", "flask", "scale", "cross", "book", "quote", "leaf", "globe", "star", "heart"] as const;
export type SectionIconName = (typeof SECTION_ICONS)[number];

const PATHS: Record<SectionIconName, string> = {
  newspaper: "M4 5h13v14H6a2 2 0 0 1-2-2V5Zm13 3h3v9a2 2 0 0 1-2 2M7 9h7M7 12h7M7 15h4",
  flask: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6A2 2 0 0 0 19 18l-5-9V3M8 15h8",
  scale: "M12 4v16M6 20h12M5 7h14M5 7l-3 7a3 3 0 0 0 6 0L5 7Zm14 0-3 7a3 3 0 0 0 6 0l-3-7Z",
  cross: "M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7V3Z",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Zm2 14h13v2H6",
  quote: "M5 17v-4a5 5 0 0 1 5-5M5 17h4v-4H5m10 4v-4a5 5 0 0 1 5-5m-5 9h4v-4h-4",
  leaf: "M5 19C5 10 10 5 20 4c0 10-5 15-14 15m-1 0 8-8",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c3 3 3 15 0 18m0-18c-3 3-3 15 0 18",
  star: "m12 3 2.7 5.6 6.1.8-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.8L12 3Z",
  heart: "M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11Z",
};

export const isSectionIcon = (value: unknown): value is SectionIconName => typeof value === "string" && value in PATHS;

export function SectionIcon({ name, className = "h-4 w-4" }: { name: string | null | undefined; className?: string }) {
  if (!isSectionIcon(name)) return null;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
      <path d={PATHS[name]} />
    </svg>
  );
}
