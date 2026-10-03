// Author photo. profiles.avatar_url is any http(s) address the author chose, so it is shown in a plain <img>
// (the image optimizer only allows our own storage). The size is fixed, so it cannot shift the layout.
// With no photo, initials on a neutral disc.
export function Avatar({ url, name, size = 48 }: { url?: string | null; name?: string | null; size?: number }) {
  const initials = (name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  const box = { width: size, height: size };
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- author-chosen URL, fixed size
      <img src={url} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" style={box} className="shrink-0 rounded-full bg-rule object-cover" />
    );
  }
  return (
    <span aria-hidden="true" style={{ ...box, fontSize: size * 0.38 }} className="inline-flex shrink-0 items-center justify-center rounded-full bg-rule font-display font-bold text-ink">
      {initials || "ET"}
    </span>
  );
}
