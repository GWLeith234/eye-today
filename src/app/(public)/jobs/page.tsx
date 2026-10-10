import type { Metadata } from "next";

import { BoardList } from "@/components/postings/board-pages";

export const metadata: Metadata = {
  title: "Jobs",
  description: "Jobs in addiction treatment, ibogaine and psychedelic care, research and harm reduction.",
  alternates: { canonical: "/jobs" },
};

export default async function JobsPage({ searchParams }: PageProps<"/jobs">) {
  return <BoardList kind="job" searchParams={await searchParams} />;
}
