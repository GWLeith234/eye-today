import { readFile } from "node:fs/promises";
import path from "node:path";

import Link from "next/link";

import { requireArea } from "@/lib/auth/session";

export default async function AdPolicyPage() {
  await requireArea("admin");
  const policy = await readFile(path.join(process.cwd(), "src", "content", "ad-policy.md"), "utf8");
  return (
    <main className="flex w-full max-w-2xl flex-col gap-4 p-6">
      <p className="text-sm"><Link href="/admin/ads" className="underline">Ads</Link> / Policy</p>
      {/* Plain text: the file is shown as written, never as HTML. */}
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{policy}</pre>
    </main>
  );
}
