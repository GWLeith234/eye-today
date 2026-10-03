// The Eye Today wordmark: a circular iris mark and the name, as one inline SVG with an accessible name.
// The mark uses plain SVG shapes only, so the same component renders in the page, the favicon and the
// share images (which pass literal colours because they cannot read CSS variables).

type MarkColors = { ring?: string; iris?: string; glow?: string; pupil?: string; glint?: string };

const PAGE: Required<MarkColors> = {
  ring: "var(--color-brand)",
  iris: "var(--color-brand)",
  glow: "var(--color-accent)",
  pupil: "var(--color-ink)",
  glint: "var(--color-paper)",
};

export function IrisMark({ size = 40, colors, title, className }: { size?: number; colors?: MarkColors; title?: string; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      className={className}
    >
      <IrisInner colors={colors} />
    </svg>
  );
}

// textLength pins the name's width, so the box never changes size while the web font loads.
export function Wordmark({ className = "h-10 w-auto", markOnly = false }: { className?: string; markOnly?: boolean }) {
  if (markOnly) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" role="img" aria-label="Eye Today" className={className}>
        <IrisInner />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 196 40" role="img" aria-label="Eye Today" className={className}>
      <IrisInner />
      <text
        x="48"
        y="29"
        textLength="146"
        lengthAdjust="spacingAndGlyphs"
        fill="var(--color-ink)"
        style={{ fontFamily: "var(--stack-display)", fontWeight: 700, fontSize: 31, letterSpacing: "-0.01em" }}
      >
        Eye Today
      </text>
    </svg>
  );
}

function IrisInner({ colors }: { colors?: MarkColors }) {
  const c = { ...PAGE, ...colors };
  return (
    <>
      <circle cx="20" cy="20" r="18" fill="none" stroke={c.ring} strokeWidth="3" />
      <circle cx="20" cy="20" r="12" fill={c.iris} />
      <circle cx="20" cy="20" r="8" fill="none" stroke={c.glow} strokeWidth="2" />
      <circle cx="20" cy="20" r="4.5" fill={c.pupil} />
      <circle cx="24.5" cy="15.5" r="2" fill={c.glint} />
    </>
  );
}
