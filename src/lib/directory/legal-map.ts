// Pure: the Legal Map's categories and their public wording. No I/O.
//
// Order is the order they appear on /legal-map, read as a spectrum from "no law names it" to "it is a
// crime", with the honest unknown last. `prescription` arrived in 0030: Canada, South Africa, Australia and
// New Zealand are prescription-only, which is neither permitted nor unregulated, and it is the single most
// common real position in this field.
export const LEGAL_CATEGORIES = ["unregulated", "permitted", "prescription", "decriminalised", "prohibited", "unclear"] as const;
export type LegalCategory = (typeof LEGAL_CATEGORIES)[number];

export const LEGAL_CATEGORY_LABELS: Record<LegalCategory, string> = {
  unregulated: "Unregulated",
  permitted: "Permitted or regulated",
  prescription: "Prescription only",
  decriminalised: "Decriminalised",
  prohibited: "Prohibited",
  unclear: "Unclear",
};

// Each note answers the two questions a reader actually arrives with: can a doctor legally give me this
// here, and is possessing it a crime. "Permitted" no longer says "prescription" — that is its own group now,
// and two categories describing the same thing is how a reader ends up trusting the wrong one.
export const LEGAL_CATEGORY_NOTES: Record<LegalCategory, string> = {
  unregulated: "No law names ibogaine; clinics operate without a specific framework.",
  permitted: "Lawful under a licence, or an approved research or treatment scheme.",
  prescription: "A doctor may prescribe it. Selling or supplying it otherwise is unlawful, but possessing it is not a drug offence.",
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
