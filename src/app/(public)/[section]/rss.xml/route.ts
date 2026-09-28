import { getSection, getSectionArticles } from "@/lib/public/data";
import { SITE_NAME, rssResponse } from "@/lib/public/feeds";
import { isReservedSectionSlug } from "@/lib/public/reserved";

export const revalidate = 3600;

// No feeds at build time; each renders on first request, then is cached.
export async function generateStaticParams() {
  return [];
}

export async function GET(_request: Request, { params }: RouteContext<"/[section]/rss.xml">) {
  const { section: slug } = await params;
  const section = isReservedSectionSlug(slug) ? null : await getSection(slug);
  if (!section) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return rssResponse({
    title: `${section.name} — ${SITE_NAME}`,
    path: `/${section.slug}`,
    selfPath: `/${section.slug}/rss.xml`,
    description: `${section.name} stories from ${SITE_NAME}.`,
    items: await getSectionArticles(section.slug, 1, 20),
  });
}
