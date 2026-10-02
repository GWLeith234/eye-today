import { getPlausibleStats } from "@/lib/analytics/plausible";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const stats = await getPlausibleStats();

  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="font-serif text-3xl font-bold">Analytics</h1>
      <p className="max-w-2xl text-sm text-muted">
        Cookieless pageviews from Plausible for the last 7 and 30 days. Figures are cached for 10 minutes.
      </p>
      {stats.configured === false ? (
        <p role="status">Analytics is not configured. Pageviews will show here once Plausible is connected.</p>
      ) : stats.ok === false ? (
        <p role="alert">{stats.message}</p>
      ) : (
        <>
          <dl className="grid max-w-xl grid-cols-2 gap-4">
            <div className="border border-rule p-4">
              <dt className="text-sm text-muted">Pageviews, 7 days</dt>
              <dd className="font-serif text-3xl font-bold">{stats.pageviews7d.toLocaleString("en-CA")}</dd>
            </div>
            <div className="border border-rule p-4">
              <dt className="text-sm text-muted">Pageviews, 30 days</dt>
              <dd className="font-serif text-3xl font-bold">{stats.pageviews30d.toLocaleString("en-CA")}</dd>
            </div>
          </dl>
          <section aria-labelledby="top-articles" className="flex flex-col gap-2">
            <h2 id="top-articles" className="font-serif text-2xl font-bold">Top articles, 30 days</h2>
            {stats.topArticles.length ? (
              <table className="w-full max-w-3xl text-left text-sm">
                <caption className="sr-only">Top 20 article paths by pageviews</caption>
                <thead>
                  <tr className="border-b border-ink">
                    <th scope="col" className="py-2">Article</th>
                    <th scope="col" className="py-2 text-right">Pageviews</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topArticles.map((row) => (
                    <tr key={row.path} className="border-b border-rule">
                      <td className="py-2">{row.path}</td>
                      <td className="py-2 text-right">{row.pageviews.toLocaleString("en-CA")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No article pageviews in this window yet.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
