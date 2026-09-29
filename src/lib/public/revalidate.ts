import "server-only";

import { revalidatePath } from "next/cache";

// Clears the public pages an article can appear on. Pass every section/slug pair
// the article has lived at so a moved or renamed story drops off the old URL too.
export function revalidatePublic(...locations: { section?: string | null; slug?: string | null }[]) {
  revalidatePath("/");
  revalidatePath("/articles", "layout");
  for (const { section, slug } of locations) {
    if (!section) continue;
    revalidatePath(`/${section}`);
    if (slug) revalidatePath(`/${section}/${slug}`);
  }
}

// When the section is unknown (the cron job), clear every section and article page.
export function revalidateAllPublic() {
  revalidatePath("/");
  revalidatePath("/articles", "layout");
  revalidatePath("/[section]", "page");
  revalidatePath("/[section]/[slug]", "page");
}
