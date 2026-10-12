import Link from "next/link";

import { requireArea } from "@/lib/auth/session";

import { LinkForm } from "../link-form";

export default async function NewNewsLinkPage() {
  await requireArea("admin");
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm"><Link href="/admin/news-feed" className="underline">← News feed</Link></p>
      <h1 className="text-2xl font-semibold">Add a link</h1>
      <LinkForm values={{ id: "", url: "", title: "", source_name: "", published_on: today, blurb: "", tags: "", status: "draft" }} />
    </div>
  );
}
