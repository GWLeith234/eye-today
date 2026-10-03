import { getSections } from "@/lib/public/data";
import { isReservedSectionSlug } from "@/lib/public/reserved";

import { Masthead, type NavSection } from "./masthead";

const DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Vancouver",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

// Server shell: sections are public rows, and the date is computed here so the
// client masthead does not disagree with the server around midnight. It reads
// no cookies. The account link inside the masthead is the only cookie reader.
export async function SiteHeader({ sections }: { sections?: NavSection[] }) {
  const rows = sections ?? (await getSections());
  const nav = rows.filter((section) => !isReservedSectionSlug(section.slug));
  return <Masthead sections={nav} dateLabel={DATE.format(new Date())} />;
}
