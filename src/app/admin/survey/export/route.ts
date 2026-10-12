import { requireArea } from "@/lib/auth/session";
import { csvRow, SURVEY_QUESTIONS, type SurveyAnswers } from "@/lib/survey/model";

export const dynamic = "force-dynamic";

type Row = { id: string; answers: SurveyAnswers; email: string | null; created_at: string };

export async function GET() {
  const { supabase } = await requireArea("admin");
  const { data } = await supabase.from("reader_surveys").select("id, answers, email, created_at").order("created_at", { ascending: false }).limit(5000).returns<Row[]>();
  const lines = [csvRow(["submitted_at", "email", ...SURVEY_QUESTIONS.map((q) => q.key)])];
  for (const row of data ?? []) lines.push(csvRow([row.created_at, row.email, ...SURVEY_QUESTIONS.map((q) => row.answers?.[q.key])]));
  return new Response(lines.join("\n") + "\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="reader-survey.csv"', "Cache-Control": "private, no-store" },
  });
}
