import { z } from "zod";

import { CLASSIFIED_CATEGORIES, EMPLOYMENT_TYPES, type PostingKind, REMOTE_OPTIONS } from "./types";

const optionalInt = z
  .string()
  .trim()
  .transform((value) => value.replace(/[,\s]/g, ""))
  .refine((value) => value === "" || /^\d{1,9}$/.test(value))
  .transform((value) => (value === "" ? null : Number(value)));

const schema = z.object({
  title: z.string().trim().min(1).max(160),
  organisation: z.string().trim().min(1).max(160),
  listing_slug: z.string().trim().max(200),
  location: z.string().trim().max(160),
  country: z.string().trim().refine((value) => value === "" || /^[A-Za-z]{2}$/.test(value)),
  remote: z.enum(REMOTE_OPTIONS),
  employment_type: z.string().trim(),
  category: z.string().trim(),
  salary_min: optionalInt,
  salary_max: optionalInt,
  salary_currency: z.string().trim().refine((value) => value === "" || /^[A-Za-z]{3}$/.test(value)),
  salary_period: z.string().trim(),
  description: z.string().trim().min(20).max(6000),
  apply_url: z.string().trim().max(500).refine((value) => value === "" || /^https:\/\/[^\s<>"]+$/.test(value)),
  apply_email: z.string().trim().max(254).refine((value) => value === "" || z.email().safeParse(value).success),
  closing_date: z.string().trim().refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value)),
});

export type PostingInput = {
  kind: PostingKind;
  title: string;
  organisation: string;
  listing_slug: string;
  location: string;
  country: string;
  remote: (typeof REMOTE_OPTIONS)[number];
  employment_type: string | null;
  category: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  description: string;
  apply_url: string;
  apply_email: string;
  closing_date: string | null;
};

const FIELDS = [
  "title", "organisation", "listing_slug", "location", "country", "remote", "employment_type", "category",
  "salary_min", "salary_max", "salary_currency", "salary_period", "description", "apply_url", "apply_email", "closing_date",
] as const;

export function parsePostingForm(kind: PostingKind, formData: FormData): { ok: true; data: PostingInput } | { ok: false; error: string } {
  const raw = Object.fromEntries(FIELDS.map((key) => [key, String(formData.get(key) ?? "")]));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Check the title, organisation and description (at least 20 characters). Links must start with https://." };
  }
  const d = parsed.data;
  if (kind === "job" && !(EMPLOYMENT_TYPES as readonly string[]).includes(d.employment_type)) return { ok: false, error: "Choose an employment type." };
  if (kind === "classified" && !(CLASSIFIED_CATEGORIES as readonly string[]).includes(d.category)) return { ok: false, error: "Choose a category." };
  if (!d.apply_url && !d.apply_email) return { ok: false, error: "Give a link or an email address for applications or enquiries." };
  if (d.remote !== "remote" && !d.location) return { ok: false, error: "Give a location, or mark it remote." };
  if ((d.salary_min !== null || d.salary_max !== null) && !d.salary_currency) return { ok: false, error: "Give a currency code for the pay range, such as USD." };
  if (d.salary_min !== null && d.salary_max !== null && d.salary_max < d.salary_min) return { ok: false, error: "The top of the pay range is below the bottom." };
  const period = ["hour", "month", "year"].includes(d.salary_period) ? d.salary_period : null;
  return {
    ok: true,
    data: {
      kind,
      title: d.title.replace(/[<>]/g, ""),
      organisation: d.organisation.replace(/[<>]/g, ""),
      listing_slug: d.listing_slug.replace(/^.*\/directory\/listing\//, "").replace(/[/?#].*$/, "").toLowerCase(),
      location: d.location.replace(/[<>]/g, ""),
      country: d.country.toUpperCase(),
      remote: d.remote,
      employment_type: kind === "job" ? d.employment_type : null,
      category: kind === "classified" ? d.category : null,
      salary_min: d.salary_min,
      salary_max: d.salary_max,
      salary_currency: d.salary_currency ? d.salary_currency.toUpperCase() : null,
      salary_period: d.salary_min !== null || d.salary_max !== null ? (period ?? "year") : null,
      description: d.description,
      apply_url: d.apply_url,
      apply_email: d.apply_email.toLowerCase(),
      closing_date: d.closing_date || null,
    },
  };
}

export function saveArgs(id: string | null, input: PostingInput) {
  return {
    p_id: id,
    p_kind: input.kind,
    p_title: input.title,
    p_organisation: input.organisation,
    p_listing_slug: input.listing_slug,
    p_location: input.location,
    p_country: input.country || null,
    p_remote: input.remote,
    p_employment_type: input.employment_type,
    p_category: input.category,
    p_salary_min: input.salary_min,
    p_salary_max: input.salary_max,
    p_salary_currency: input.salary_currency,
    p_salary_period: input.salary_period,
    p_description: input.description,
    p_apply_url: input.apply_url || null,
    p_apply_email: input.apply_email || null,
    p_closing_date: input.closing_date,
  };
}

export const POSTING_FORM_ERRORS: Record<string, string> = {
  invalid: "Check the posting. A closing date must be within the next year, and links must start with https://.",
  listing: "That directory listing isn’t published. Leave it blank or paste a live listing’s address.",
  limited: "You’ve created several postings today. Please try again tomorrow.",
  not_found: "That posting can’t be edited. An expired posting needs renewing first.",
  failed: "Something went wrong saving the posting. Please try again.",
};

export function saveFailure(error: { code?: string; message?: string }): string {
  if (error.code === "P0001") return "limited";
  if (error.message === "invalid listing") return "listing";
  if (error.code === "42501") return "not_found";
  if (error.code === "23514") return "invalid";
  return "failed";
}
