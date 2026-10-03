import { Plausible } from "@/components/public/plausible";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { sectionStyle } from "@/lib/brand/palette";
import { getSections } from "@/lib/public/data";

export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const sections = await getSections();
  return (
    <div className="flex min-h-full flex-1 flex-col" style={sectionStyle(sections)}>
      <SiteHeader sections={sections} />
      <main id="main" className="flex w-full flex-1 flex-col">
        {children}
      </main>
      <SiteFooter sections={sections} />
      <Plausible />
    </div>
  );
}
