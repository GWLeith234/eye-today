// Pure: the Legal Map's five categories and their public wording. No I/O.

export const LEGAL_CATEGORIES = ["unregulated", "permitted", "decriminalised", "prohibited", "unclear"] as const;
export type LegalCategory = (typeof LEGAL_CATEGORIES)[number];

export const LEGAL_CATEGORY_LABELS: Record<LegalCategory, string> = {
  unregulated: "Unregulated",
  permitted: "Permitted or regulated",
  decriminalised: "Decriminalised",
  prohibited: "Prohibited",
  unclear: "Unclear",
};

export const LEGAL_CATEGORY_NOTES: Record<LegalCategory, string> = {
  unregulated: "No law names ibogaine; clinics operate without a specific framework.",
  permitted: "Lawful under a licence, prescription or research scheme.",
  decriminalised: "Personal possession is not prosecuted, but supply or treatment may still be.",
  prohibited: "A controlled substance; possession, supply or treatment are offences.",
  unclear: "Conflicting or untested rules. Read the country page before relying on it.",
};

export function isLegalCategory(value: unknown): value is LegalCategory {
  return typeof value === "string" && (LEGAL_CATEGORIES as readonly string[]).includes(value);
}

export type LegalMapRow = {
  country_code: string;
  title: string;
  legal_category: LegalCategory;
  as_of: string | null;
  source_count: number;
  updated_at: string;
};

export function groupByCategory(rows: LegalMapRow[]): { category: LegalCategory; rows: LegalMapRow[] }[] {
  return LEGAL_CATEGORIES.map((category) => ({ category, rows: rows.filter((row) => row.legal_category === category) })).filter((g) => g.rows.length > 0);
}
