const PATHS: Record<string, string> = {
  news: "M4 6h16v14H4V6zm2 2v2h12V8H6zm0 4v6h12v-6H6zM4 4h16v2H4V4z",
  research: "M9 3h6v3h3v2h-1.1A7 7 0 0 1 13 18.9V21h3v2H8v-2h3v-2.1A7 7 0 0 1 7.1 8H6V6h3V3zm3 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10z",
  policy: "M12 3l8 4v5c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V7l8-4zm0 2.2L6 8.1V12c0 3.9 2.6 6.7 6 7.2 3.4-.5 6-3.3 6-7.2V8.1L12 5.2z",
  treatment: "M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6V4z",
  stories: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3V4zm0 16a5 5 0 0 1 3-1h11v2H8a3 3 0 0 0-3 3V20z",
  opinion: "M7 6h10v2H7V6zm0 4h10v2H7v-2zm0 4h7v2H7v-2zM4 4h2v16H4V4z",
};

/** A short named icon stored on the section. Unknown names draw nothing. */
export function SectionIcon({ name, className = "size-5" }: { name: string | null; className?: string }) {
  const d = name ? PATHS[name] : undefined;
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="currentColor" d={d} />
    </svg>
  );
}
