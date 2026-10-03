import { readFileSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";

import { DirectoryFrame } from "@/components/public/directory-frame";
import { renderContentMarkdown } from "@/lib/public/content-doc";

export const metadata: Metadata = {
  title: "How we verify",
  description: "Draft criteria for directory listings. A listing is not an endorsement.",
  alternates: { canonical: "/directory/how-we-verify" },
};

export default function HowWeVerifyPage() {
  const raw = readFileSync(path.join(process.cwd(), "src/content/how-we-verify.md"), "utf8");
  const doc = renderContentMarkdown(raw);
  const updated = doc.updated && /^\d{4}-\d{2}-\d{2}$/.test(doc.updated) ? doc.updated : null;

  return (
    <DirectoryFrame>
      <h1 className="font-serif text-4xl font-bold">How we verify</h1>
      <p className="text-sm font-semibold">Draft for editorial review.</p>
      {updated ? <p className="text-sm text-muted">Last updated {updated}</p> : null}
      <div className="content-doc max-w-2xl" dangerouslySetInnerHTML={{ __html: doc.html }} />
    </DirectoryFrame>
  );
}
