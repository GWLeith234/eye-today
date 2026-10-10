import type { Metadata } from "next";

import { BoardDetail, postingMetadata } from "@/components/postings/board-pages";

export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps<"/jobs/[slug]">): Promise<Metadata> {
  return postingMetadata("job", (await params).slug);
}

export default async function JobPage({ params }: PageProps<"/jobs/[slug]">) {
  return <BoardDetail kind="job" slug={(await params).slug} />;
}
