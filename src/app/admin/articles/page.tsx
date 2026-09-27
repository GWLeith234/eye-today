import Link from "next/link";

import { requireArea } from "@/lib/auth/session";

const PAGE_SIZE = 20;
const STATUSES = ["draft", "submitted", "in_review", "scheduled", "published", "archived"];
const UUID = /^[0-9a-f-]{36}$/i;

type Row = {
  id: string;
  title: string;
  slug: string;
  status: string;
  updated_at: string;
  published_at: string | null;
  scheduled_for: string | null;
  sections: { name: string } | null;
};

function one(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function ArticlesPage({ searchParams }: PageProps<"/admin/articles">) {
  const { supabase } = await requireArea("admin");
  const params = await searchParams;

  const status = STATUSES.includes(one(params.status) ?? "") ? one(params.status) : undefined;
  const section = UUID.test(one(params.section) ?? "") ? one(params.section) : undefined;
  const author = UUID.test(one(params.author) ?? "") ? one(params.author) : undefined;
  const q = (one(params.q) ?? "").trim().slice(0, 200);
  const page = Math.max(1, Math.trunc(Number(one(params.page) ?? 1)) || 1);

  let query = supabase
    .from("articles")
    .select(
      `id, title, slug, status, updated_at, published_at, scheduled_for, sections(name)${author ? ", article_authors!inner(profile_id)" : ""}`,
      { count: "exact" },
    )
    .order("updated_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status) query = query.eq("status", status);
  if (section) query = query.eq("section_id", section);
  if (author) query = query.eq("article_authors.profile_id", author);
  // Full-text search on the stored tsvector (built from title, dek and body).
  if (q) query = query.textSearch("search", q, { type: "websearch", config: "english" });

  const [{ data, count }, { data: sections }, { data: people }] = await Promise.all([
    query.returns<Row[]>(),
    supabase.from("sections").select("id, name").order("sort"),
    supabase.from("profiles").select("id, display_name").order("display_name"),
  ]);

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) => {
    const search = new URLSearchParams();
    if (status) search.set("status", status);
    if (section) search.set("section", section);
    if (author) search.set("author", author);
    if (q) search.set("q", q);
    search.set("page", String(p));
    return `/admin/articles?${search.toString()}`;
  };

  return (
    <main className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Articles</h1>
        <Link href="/admin/articles/new" className="rounded bg-foreground px-3 py-1 text-background">
          New article
        </Link>
      </div>

      <form className="flex flex-wrap items-end gap-2 text-sm" role="search">
        <label className="flex flex-col gap-1">
          Search
          <input name="q" defaultValue={q} className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          Status
          <select name="status" defaultValue={status ?? ""} className="rounded border px-2 py-1">
            <option value="">Any</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Section
          <select name="section" defaultValue={section ?? ""} className="rounded border px-2 py-1">
            <option value="">Any</option>
            {(sections ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Author
          <select name="author" defaultValue={author ?? ""} className="rounded border px-2 py-1">
            <option value="">Any</option>
            {(people ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.display_name ?? p.id}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded border px-3 py-1">Filter</button>
      </form>

      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th className="py-1">Title</th>
            <th className="py-1">Section</th>
            <th className="py-1">Status</th>
            <th className="py-1">Updated</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((row) => (
            <tr key={row.id} className="border-t">
              <td className="py-1">
                <Link href={`/admin/articles/${row.id}`} className="underline">{row.title}</Link>
              </td>
              <td className="py-1">{row.sections?.name ?? "—"}</td>
              <td className="py-1">{row.status}</td>
              <td className="py-1">{new Date(row.updated_at).toISOString().slice(0, 16).replace("T", " ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {total === 0 ? <p className="text-sm opacity-70">No articles match.</p> : null}

      <nav aria-label="Pages" className="flex items-center gap-3 text-sm">
        {page > 1 ? <Link href={link(page - 1)} className="underline">Previous</Link> : null}
        <span>Page {page} of {pages} · {total} articles</span>
        {page < pages ? <Link href={link(page + 1)} className="underline">Next</Link> : null}
      </nav>
    </main>
  );
}
