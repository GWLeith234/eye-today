// Pure: how a newsletter issue number reads. The weekly list counts in weeks; everything else is "No. N".
export function newsletterIssueLabel(listSlug: string, issueNumber: number | null | undefined): string | null {
  if (!issueNumber || issueNumber < 1) return null;
  return listSlug === "weekly" ? `Week ${issueNumber}` : `No. ${issueNumber}`;
}

// Default subject for a new issue: "Eye Today · Week 12 — 12 Oct 2026".
export function defaultSubject(listName: string, listSlug: string, issueNumber: number | null | undefined, dateText: string): string {
  const label = newsletterIssueLabel(listSlug, issueNumber);
  return label ? `Eye Today · ${label} — ${dateText}` : `${listName} — ${dateText}`;
}
