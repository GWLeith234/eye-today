import Link from "next/link";
import { notFound } from "next/navigation";

import { requireArea } from "@/lib/auth/session";
import { countryName, isCountryCode } from "@/lib/directory/countries";
import { sourceLines } from "@/lib/directory/sources";

import { LegalEditor } from "../../legal-editor";

type LegalRow = {
  title: string;
  summary_html: string;
  sources: unknown;
  as_of: string | null;
  status: string;
};

export default async function LegalStatusPage({ params, searchParams }: PageProps<"/admin/directory/legal/[code]">) {
  const { code } = await params;
  if (!isCountryCode(code)) notFound();
  const country = code.toUpperCase();
  const { supabase } = await requireArea("admin");
  const query = await searchParams;
  const { data } = await supabase
    .from("country_legal_status")
    .select("title, summary_html, sources, as_of, status")
    .eq("country_code", country)
    .maybeSingle<LegalRow>();

  return (
    <main className="flex flex-col gap-4 p-6">
      <p><Link href="/admin/directory" className="text-sm underline">Back to directory</Link></p>
      <h1 className="text-2xl font-bold">{countryName(country)}</h1>
      <LegalEditor
        code={country}
        title={data?.title ?? ""}
        html={data?.summary_html ?? ""}
        sources={sourceLines(data?.sources)}
        asOf={data?.as_of ?? ""}
        status={data?.status === "published" ? "published" : "draft"}
        notice={query.saved === "1" ? "Saved." : undefined}
      />
    </main>
  );
}
