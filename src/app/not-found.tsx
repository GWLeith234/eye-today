import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { NotFoundView } from "@/components/public/not-found-view";
import { sectionStyle } from "@/lib/brand/palette";
import { getSections } from "@/lib/public/data";

// Unknown URLs are not inside the (public) layout, so this page brings its own header and footer.
export default async function NotFound() {
  const sections = await getSections();
  return (
    <div className="flex min-h-full flex-1 flex-col" style={sectionStyle(sections)}>
      <SiteHeader sections={sections} />
      <main id="main" className="flex w-full flex-1 flex-col">
        <NotFoundView />
      </main>
      <SiteFooter sections={sections} />
    </div>
  );
}
