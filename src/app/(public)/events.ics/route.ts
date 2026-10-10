import { icsResponse } from "@/lib/events/feed";
import { feedEvents } from "@/lib/events/public";

export const revalidate = 300;

export async function GET() {
  const rows = await feedEvents();
  return icsResponse(rows, "Eye Today events", "eye-today-events.ics");
}
