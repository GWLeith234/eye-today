import Link from "next/link";

import { requireArea } from "@/lib/auth/session";

import { ContestForm } from "../contest-form";

export default async function NewContestPage() {
  await requireArea("admin");
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm"><Link href="/admin/contests" className="underline">← All contests</Link></p>
      <h1 className="text-2xl font-semibold">New contest</h1>
      <ContestForm values={{ id: "", slug: "", title: "", description: "", prize: "", rules: "", eligibility: "", question: "", status: "draft", opens_at: "", closes_at: "" }} />
    </div>
  );
}
