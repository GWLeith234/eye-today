/** Circular iris plus the Eye Today name. One graphic, no remote assets. */
export function Wordmark({ className = "h-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 248 48" className={`w-auto text-ink ${className}`} role="img" aria-label="Eye Today">
      <circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="24" cy="24" r="7" fill="currentColor" />
      <circle cx="26.5" cy="21.5" r="2.2" className="fill-paper" />
      <text x="50" y="33" fill="currentColor" fontFamily="var(--font-fraunces), Georgia, serif" fontSize="32" fontWeight="600">
        Eye Today
      </text>
    </svg>
  );
}

/** Iris only, for fallback tiles and the compact mark. */
export function IrisMark({ className = "size-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="16" r="5.5" fill="currentColor" />
      <circle cx="18" cy="14" r="1.6" className="fill-ink" />
    </svg>
  );
}
