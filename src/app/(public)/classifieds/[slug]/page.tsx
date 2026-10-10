import type { Metadata } from "next";

import { BoardDetail, postingMetadata } from "@/components/postings/board-pages";

export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps<"/classifieds/[slug]">): Promise<Metadata> {
  return postingMetadata("classified", (await params).slug);
}

export default async function ClassifiedPage({ params }: PageProps<"/classifieds/[slug]">) {
  return <BoardDetail kind="classified" slug={(await params).slug} />;
}
