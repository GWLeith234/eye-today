import { saveArticleListings } from "./listing-actions";
import { requireArea } from "@/lib/auth/session";

// Editors attach published directory listings to a story. The public article shows their cards, and each
// listing page shows the story. A listing that is later unpublished simply stops showing.
export async function ListingAttach({ articleId }: { articleId: string }) {
  const { supabase } = await requireArea("admin");
  const [{ data: listings }, { data: attached }] = await Promise.all([
    supabase.from("directory_listings").select("id, name, country_code").eq("status", "published").order("name").limit(300).returns<{ id: string; name: string; country_code: string }[]>(),
    supabase.from("article_listings").select("listing_id").eq("article_id", articleId).returns<{ listing_id: string }[]>(),
  ]);
  const chosen = new Set((attached ?? []).map((row) => row.listing_id));
  if ((listings ?? []).length === 0 && chosen.size === 0) return null;

  return (
    <section aria-labelledby="attach-heading" className="mx-6 mb-8 flex max-w-2xl flex-col gap-2 rounded border p-4 text-sm">
      <h2 id="attach-heading" className="font-semibold">Directory listings in this story</h2>
      <p className="opacity-70">Only published listings can be attached. Up to six show under the story.</p>
      <form action={saveArticleListings} className="flex flex-col gap-2">
        <input type="hidden" name="article_id" value={articleId} />
        <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          {(listings ?? []).map((listing) => (
            <li key={listing.id}>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="listing_ids" value={listing.id} defaultChecked={chosen.has(listing.id)} />
                {listing.name} <span className="opacity-60">({listing.country_code})</span>
              </label>
            </li>
          ))}
        </ul>
        <button type="submit" className="self-start rounded border px-3 py-1">Save listings</button>
      </form>
    </section>
  );
}
