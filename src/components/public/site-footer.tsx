import Link from "next/link";

const LINKS = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/advertise", label: "Advertise" },
  { href: "/write-for-us", label: "Write for us" },
  { href: "/editorial-policy", label: "Editorial policy" },
  { href: "/corrections", label: "Corrections" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t-2 border-ink bg-paper">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm">
        <p className="font-serif text-2xl font-bold">Eye Today</p>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:underline">{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="text-muted">Information only — not medical advice.</p>
      </div>
    </footer>
  );
}
