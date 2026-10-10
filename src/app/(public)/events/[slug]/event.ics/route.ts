import { icsResponse } from "@/lib/events/feed";
import { getEvent } from "@/lib/events/public";
import { SLUG_RE } from "@/lib/slug";

export const revalidate = 60;

export async function GET(_request: Request, { params }: RouteContext<"/events/[slug]/event.ics">) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return new Response("Not found", { status: 404 });
  const event = await getEvent(slug);
  // A cancelled event keeps its page but has no calendar file.
  if (!event || event.status !== "published") return new Response("Not found", { status: 404 });
  return icsResponse([event], event.title, `${event.slug}.ics`);
}
