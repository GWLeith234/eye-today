import { getLatest } from "@/lib/public/data";
import { SITE_DESCRIPTION, SITE_NAME, rssResponse } from "@/lib/public/feeds";

export const revalidate = 3600;

// The 20 newest live stories. latest_articles() returns live articles only.
export async function GET() {
  return rssResponse({
    title: SITE_NAME,
    path: "/",
    selfPath: "/rss.xml",
    description: SITE_DESCRIPTION,
    items: await getLatest(20),
  });
}
