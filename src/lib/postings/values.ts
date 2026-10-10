import type { PostingFieldValues } from "@/components/postings/posting-fields";
import { htmlToText } from "@/lib/events/ics";

export const POSTING_EDIT_COLUMNS =
  "id, kind, slug, title, organisation, listing_id, location, country_code, remote, employment_type, category, salary_min, salary_max, salary_currency, salary_period, description_html, apply_url, apply_email, closing_date, status, reject_reason";

export type PostingEditRow = {
  id: string;
  kind: "job" | "classified";
  slug: string;
  title: string;
  organisation: string;
  listing_id: string | null;
  location: string | null;
  country_code: string | null;
  remote: string;
  employment_type: string | null;
  category: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  description_html: string;
  apply_url: string | null;
  apply_email: string | null;
  closing_date: string | null;
  status: string;
  reject_reason: string | null;
};

export function postingFieldValues(row: PostingEditRow, listingSlug: string | null): PostingFieldValues {
  return {
    title: row.title,
    organisation: row.organisation,
    listing_slug: listingSlug ?? "",
    location: row.location ?? "",
    country: row.country_code ?? "",
    remote: row.remote,
    employment_type: row.employment_type ?? "",
    category: row.category ?? "",
    salary_min: row.salary_min === null ? "" : String(row.salary_min),
    salary_max: row.salary_max === null ? "" : String(row.salary_max),
    salary_currency: row.salary_currency ?? "",
    salary_period: row.salary_period ?? "year",
    description: htmlToText(row.description_html),
    apply_url: row.apply_url ?? "",
    apply_email: row.apply_email ?? "",
    closing_date: row.closing_date ?? "",
  };
}
