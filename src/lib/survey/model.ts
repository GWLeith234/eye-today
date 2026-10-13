// Pure: the reader survey's questions and answer validation. No I/O.

export const SURVEY_QUESTIONS = [
  { key: "brought", label: "What brought you to Eye Today?", kind: "text" as const, max: 500 },
  {
    key: "who",
    label: "Which of these is closest to you?",
    kind: "choice" as const,
    options: ["Patient or family member", "Clinician or practitioner", "Researcher", "Policy or government", "Press", "Clinic or treatment business", "Something else"],
  },
  { key: "cover", label: "What should we cover that nobody else does?", kind: "text" as const, max: 1000 },
  { key: "read", label: "Where else do you read about ibogaine or addiction treatment?", kind: "text" as const, max: 500 },
] as const;

export type SurveyKey = (typeof SURVEY_QUESTIONS)[number]["key"];
export type SurveyAnswers = Partial<Record<SurveyKey, string>>;

export function readAnswers(form: Record<string, unknown>): SurveyAnswers | null {
  const out: SurveyAnswers = {};
  let any = false;
  for (const q of SURVEY_QUESTIONS) {
    const raw = form[q.key];
    if (typeof raw !== "string") continue;
    const text = raw.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (q.kind === "choice" && !(q.options as readonly string[]).includes(text)) continue;
    out[q.key] = text.slice(0, q.kind === "text" ? q.max : 80);
    any = true;
  }
  return any ? out : null;
}

export function csvRow(values: (string | null | undefined)[]): string {
  return values.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",");
}
