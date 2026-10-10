import type { Metadata } from "next";

import { BoardList } from "@/components/postings/board-pages";

export const metadata: Metadata = {
  title: "Classifieds",
  description: "Training, services and programmes for people working in the field.",
  alternates: { canonical: "/classifieds" },
};

export default async function ClassifiedsPage({ searchParams }: PageProps<"/classifieds">) {
  return <BoardList kind="classified" searchParams={await searchParams} />;
}
