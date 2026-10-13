import { PLATFORM_LABELS, type PlatformLink } from "@/lib/directory/podcast";

// Where to listen: one small labelled button per platform.
export function PlatformButtons({ links, size = "sm" }: { links: PlatformLink[]; size?: "sm" | "md" }) {
  if (links.length === 0) return null;
  const pad = size === "md" ? "px-3 py-1.5 text-sm" : "px-2 py-0.5 text-xs";
  return (
    <ul aria-label="Listen on" className="flex flex-wrap gap-2">
      {links.map((link) => (
        <li key={link.platform}>
          <a href={link.url} rel="noopener noreferrer" target="_blank" className={`inline-block rounded border border-ink font-semibold hover:bg-ink hover:text-paper ${pad}`}>
            {PLATFORM_LABELS[link.platform]} ↗
          </a>
        </li>
      ))}
    </ul>
  );
}
