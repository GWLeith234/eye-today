import type { Metadata } from "next";

import { requireArea } from "@/lib/auth/session";

import { saveHomepage } from "./actions";
import { SLOTS } from "./slots";

export const metadata: Metadata = { title: "Homepage" };

const ERRORS: Record<string, string> = {
  invalid: "One of the choices was not a story.",
  duplicate: "Each story can fill only one slot.",
  not_live: "Only published or scheduled stories can go on the homepage. Drafts cannot.",
  no_site: "No site is set up yet.",
  save_failed: "The homepage could not be saved.",
};

type Option = { id: string; title: string; status: string; published_at: string | null; scheduled_for: string | null };

export default async function HomepageAdminPage({ searchParams }: PageProps<"/admin/homepage">) {
  const { supabase } = await requireArea("admin");
  const params = await searchParams;
  const error = typeof params.error === "string" ? ERRORS[params.error] ?? ERRORS.save_failed : null;

  const [{ data: articles }, { data: slots }] = await Promise.all([
    supabase
      .from("articles")
      .select("id, title, status, published_at, scheduled_for")
      .in("status", ["published", "scheduled"])
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(200),
    supabase.from("homepage_slots").select("slot, position, article_id"),
  ]);
  const options = (articles ?? []) as Option[];
  const current = new Map(
    ((slots ?? []) as { slot: string; position: number; article_id: string }[]).map((s) => [`${s.slot}:${s.position}`, s.article_id]),
  );

  return (
    <main className="flex max-w-2xl flex-col gap-4 p-8">
      <h1 className="text-2xl font-bold">Homepage</h1>
      <p className="text-sm opacity-80">
        Pick the lead story and up to four secondary stories. Empty slots show the newest live stories.
      </p>
      {error ? (
        <p role="alert" className="rounded border border-red-600 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {params.saved ? (
        <p role="status" className="rounded border border-green-700 p-3 text-sm">
          Homepage saved.
        </p>
      ) : null}
      <form action={saveHomepage} className="flex flex-col gap-4">
        {SLOTS.map((slot) => (
          <label key={slot.field} className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">{slot.label}</span>
            <select name={slot.field} defaultValue={current.get(`${slot.slot}:${slot.position}`) ?? ""} className="rounded border p-2">
              <option value="">Newest live story</option>
              {options.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.status === "scheduled" ? "[Scheduled] " : ""}
                  {a.title}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button type="submit" className="self-start rounded bg-foreground px-4 py-2 text-background">
          Save homepage
        </button>
      </form>
    </main>
  );
}
