import { format } from "date-fns";

import { sanitizeArticleHtml } from "@/lib/editor/sanitize";

export type ArticleViewData = {
  title: string;
  dek: string | null;
  body_html: string | null;
  published_at: string | null;
  scheduled_for: string | null;
  is_sponsored: boolean;
  sponsor_name: string | null;
};

// Plain article rendering (no design yet). body_html is sanitized when saved;
// it is sanitized again here in case a row was written outside the editor.
export function ArticleView({ article }: { article: ArticleViewData }) {
  const date = article.published_at ?? article.scheduled_for;
  return (
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-8">
      {article.is_sponsored ? (
        <p className="text-xs uppercase tracking-widest opacity-70">Sponsored by {article.sponsor_name}</p>
      ) : null}
      <h1 className="text-4xl font-bold">{article.title}</h1>
      {article.dek ? <p className="text-lg opacity-80">{article.dek}</p> : null}
      {date ? <time dateTime={date} className="text-sm opacity-60">{format(new Date(date), "d MMMM yyyy")}</time> : null}
      <div
        className="article-body flex flex-col gap-4"
        dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(article.body_html ?? "") }}
      />
    </article>
  );
}
