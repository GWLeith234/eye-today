import { liveArticleRows, publicDate, rowHref, xmlEscape, xmlResponse } from "@/lib/public/feeds";
import { SITE_NAME, absoluteUrl } from "@/lib/public/site";

export const revalidate = 3600;

const WINDOW_MS = 48 * 60 * 60 * 1000;

// Google News sitemap: editorial stories first public in the last 48 hours.
// Sponsored stories are left out.
export async function GET() {
  const since = new Date(Date.now() - WINDOW_MS);
  const rows = (await liveArticleRows({ since })).filter((row) => !row.is_sponsored);
  const urls = rows
    .map((row) => {
      const date = publicDate(row);
      if (!date || new Date(date) < since) return null;
      return [
        "  <url>",
        `    <loc>${xmlEscape(absoluteUrl(rowHref(row)))}</loc>`,
        "    <news:news>",
        "      <news:publication>",
        `        <news:name>${xmlEscape(SITE_NAME)}</news:name>`,
        "        <news:language>en</news:language>",
        "      </news:publication>",
        `      <news:publication_date>${new Date(date).toISOString()}</news:publication_date>`,
        `      <news:title>${xmlEscape(row.title)}</news:title>`,
        "    </news:news>",
        "  </url>",
      ].join("\n");
    })
    .filter(Boolean);
  return xmlResponse(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">',
      ...urls,
      "</urlset>",
      "",
    ].join("\n"),
  );
}
