import Link from "next/link";

// The four audiences Eye Today sells to, in their own words. Shared by /advertise and /support so the
// same reader meets the same framing on both pages; only the pitch differs.

export type AudiencePanel = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  links: { href: string; label: string }[];
};

export function AudiencePanels({ heading, intro, panels }: { heading: string; intro: string; panels: AudiencePanel[] }) {
  return (
    <section aria-labelledby="audiences" className="flex flex-col gap-4">
      <h2 id="audiences" className="font-display text-2xl font-semibold">{heading}</h2>
      <p className="text-sm">{intro}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {panels.map((panel) => (
          <article key={panel.id} id={panel.id} data-audience={panel.id} className="flex flex-col gap-2 border border-rule p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">{panel.kicker}</p>
            <h3 className="font-serif text-xl font-semibold">{panel.title}</h3>
            <p className="text-sm">{panel.body}</p>
            <p className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-2 text-sm">
              {panel.links.map((link) => (
                <Link key={link.href} href={link.href} className="font-semibold underline">{link.label}</Link>
              ))}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
