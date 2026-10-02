import { readFileSync } from "node:fs";
import path from "node:path";

import { renderContentMarkdown } from "@/lib/public/content-doc";

import { StaticPage } from "./static-page";

export function ContentPage({ file, title }: { file: string; title: string }) {
  const raw = readFileSync(path.join(process.cwd(), "src/content", file), "utf8");
  const doc = renderContentMarkdown(raw);
  const updated = doc.updated && /^\d{4}-\d{2}-\d{2}$/.test(doc.updated) ? doc.updated : null;

  return (
    <StaticPage title={title}>
      {updated ? <p className="text-sm text-muted">Last updated {updated}</p> : null}
      {/* HTML comes from renderContentMarkdown, which escapes text and sanitizes the result. */}
      <div className="content-doc" dangerouslySetInnerHTML={{ __html: doc.html }} />
    </StaticPage>
  );
}
