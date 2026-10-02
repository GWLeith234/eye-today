import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { NotFoundView } from "@/components/public/not-found-view";

// Unknown URLs are not inside the (public) layout, so this page brings its own header and footer.
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex w-full flex-1 flex-col">
        <NotFoundView />
      </main>
      <SiteFooter />
    </>
  );
}
