import Link from "next/link";

import { articleHref, getLatest } from "@/lib/public/data";

export async function NotFoundView() {
  let latest: Awaited<ReturnType<typeof getLatest>> = [];
  try {
    latest = await getLatest(5);
  } catch {
    latest = [];
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="font-display text-4xl font-bold">Page not found</h1>
      <p className="text-lg">That address is not on Eye Today. Try a search, or start from the front page.</p>
      <form action="/search" method="get" role="search" className="flex flex-wrap items-end gap-2">
        <label htmlFor="not-found-q" className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-semibold">
          Search
          <input id="not-found-q" type="search" name="q" maxLength={80} className="rounded border border-ink bg-white px-3 py-2 text-base font-normal" />
        </label>
        <button type="submit" className="rounded bg-ink px-4 py-2 text-paper">Search</button>
      </form>
      {latest.length ? (
        <section aria-labelledby="not-found-latest" className="flex flex-col gap-2">
          <h2 id="not-found-latest" className="font-display text-2xl font-bold">Latest stories</h2>
          <ul className="flex flex-col gap-2">
            {latest.map((card) => (
              <li key={articleHref(card)}>
                <Link href={articleHref(card)} className="underline">{card.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p>
        <Link href="/" className="underline">Front page</Link>
      </p>
    </div>
  );
}
