import Link from "next/link";

import { requireArea } from "@/lib/auth/session";

import { PollForm } from "../poll-form";

export default async function NewPollPage() {
  await requireArea("admin");
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm"><Link href="/admin/polls" className="underline">← All polls</Link></p>
      <h1 className="text-2xl font-semibold">New poll</h1>
      <PollForm id="" question="" status="open" results="after_vote" opensAt="" closesAt="" options={[]} />
    </div>
  );
}
