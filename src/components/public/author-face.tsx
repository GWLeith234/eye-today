const SAFE_URL = /^https:\/\//i;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
  return letters || "ET";
}

/** Author photo, or initials when there is no https avatar. The name sits beside it. */
export function AuthorFace({ name, url, size = 48 }: { name: string; url: string | null | undefined; size?: number }) {
  const safe = url && SAFE_URL.test(url) ? url : null;
  if (!safe) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand font-semibold text-paper"
        style={{ width: size, height: size, fontSize: size < 40 ? 12 : 14 }}
        aria-hidden="true"
      >
        {initials(name)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- profile avatars are arbitrary https URLs
    <img
      src={safe}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  );
}
