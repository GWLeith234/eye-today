import "server-only";

import { revalidatePath } from "next/cache";

// Everything that can show an event: the cover rail, the list and calendar, its page and feed file,
// the linked listing's rail, and the sitemap.
export function refreshEvent(slug: string, listingSlug?: string | null) {
  revalidatePath("/");
  revalidatePath("/events");
  revalidatePath(`/events/${slug}`);
  revalidatePath(`/events/${slug}/event.ics`);
  revalidatePath("/events.ics");
  if (listingSlug) revalidatePath(`/directory/listing/${listingSlug}`);
  revalidatePath("/sitemap.xml");
}
