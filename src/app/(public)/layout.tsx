import { MobileBanner } from "@/components/public/mobile-banner";
import { PageSkin } from "@/components/public/page-skin";
import { Plausible } from "@/components/public/plausible";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { sectionStyle } from "@/lib/brand/palette";
import { getSections } from "@/lib/public/data";

export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const sections = await getSections();
  return (
    <div className="flex min-h-full flex-1 flex-col" style={sectionStyle(sections)}>
      {/* The skin paints a fixed layer under everything; the column below is the paper the page sits on. */}
      <PageSkin />
      <SiteHeader sections={sections} />
      <div className="relative z-10 mx-auto flex w-full max-w-page flex-1 flex-col bg-paper">
        <main id="main" className="flex w-full flex-1 flex-col">
          {children}
        </main>
        <SiteFooter sections={sections} />
      </div>
      <MobileBanner />
      <Plausible />
    </div>
  );
}
