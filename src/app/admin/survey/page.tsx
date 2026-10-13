import { requireArea } from "@/lib/auth/session";
import { SURVEY_QUESTIONS, type SurveyAnswers } from "@/lib/survey/model";
import { dateLabel } from "@/lib/newsroom/model";

type Row = { id: string; answers: SurveyAnswers; email: string | null; created_at: string };

export default async function SurveyAdminPage() {
  const { supabase } = await requireArea("admin");
  const { data: rows, count } = await supabase
    .from("reader_surveys")
    .select("id, answers, email, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<Row[]>();

  const who = new Map<string, number>();
  for (const row of rows ?? []) {
    const answer = row.answers?.who;
    if (answer) who.set(answer, (who.get(answer) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">Reader survey</h1>
        <a href="/admin/survey/export" download className="rounded border border-rule px-3 py-1.5 text-sm">Download CSV</a>
      </div>
      <p className="text-sm">{count ?? 0} {count === 1 ? "response" : "responses"} from <code>/survey</code>. Emails are optional and never added to a list.</p>
      {who.size > 0 ? (
        <ul className="flex flex-wrap gap-2 text-sm">
          {[...who.entries()].sort((a, b) => b[1] - a[1]).map(([label, n]) => (
            <li key={label} className="rounded border border-rule px-2 py-0.5">{label}: {n}</li>
          ))}
        </ul>
      ) : null}
      <ol className="flex flex-col gap-3">
        {(rows ?? []).map((row) => (
          <li key={row.id} className="flex flex-col gap-1 border border-rule p-3 text-sm">
            <p className="text-xs text-muted">{dateLabel(row.created_at.slice(0, 10))}{row.email ? ` · ${row.email}` : ""}</p>
            {SURVEY_QUESTIONS.map((q) =>
              row.answers?.[q.key] ? (
                <p key={q.key}>
                  <span className="font-semibold">{q.label} </span>
                  {row.answers[q.key]}
                </p>
              ) : null,
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
