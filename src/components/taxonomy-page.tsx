import { TAXONOMY_ERRORS } from "@/lib/taxonomy";

type Row = { id: string; name: string; slug: string; sort?: number };

export function TaxonomyPage({
  title,
  rows,
  params,
  create,
  rename,
  withSort = false,
}: {
  title: string;
  rows: Row[];
  params: Record<string, string | string[] | undefined>;
  create: (formData: FormData) => Promise<void>;
  rename: (formData: FormData) => Promise<void>;
  withSort?: boolean;
}) {
  const error = typeof params.error === "string" ? TAXONOMY_ERRORS[params.error] : undefined;
  const saved = params.saved === "created" ? "Created." : params.saved === "renamed" ? "Renamed." : undefined;

  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      {saved ? <p role="status" className="rounded border border-green-600 p-2 text-sm">{saved}</p> : null}
      {error ? <p role="alert" className="rounded border border-red-600 p-2 text-sm">{error}</p> : null}

      <form action={create} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input name="name" required maxLength={80} className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Slug (optional)
          <input name="slug" maxLength={120} className="rounded border px-2 py-1" />
        </label>
        {withSort ? (
          <label className="flex flex-col gap-1 text-sm">
            Sort
            <input name="sort" type="number" defaultValue={100} className="w-20 rounded border px-2 py-1" />
          </label>
        ) : null}
        <button type="submit" className="rounded bg-foreground px-3 py-1 text-background">
          Create
        </button>
      </form>

      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th className="py-1">Name</th>
            <th className="py-1">Slug</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t">
              <td className="py-1">
                <form action={rename} className="flex gap-2">
                  <input type="hidden" name="id" value={row.id} />
                  <input name="name" defaultValue={row.name} required maxLength={80} aria-label={`Rename ${row.name}`} className="rounded border px-2 py-1" />
                  <button type="submit" className="rounded border px-2 py-1">
                    Rename
                  </button>
                </form>
              </td>
              <td className="py-1 font-mono text-xs">{row.slug}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
