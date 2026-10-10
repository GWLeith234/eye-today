import {
  CATEGORY_LABELS,
  CLASSIFIED_CATEGORIES,
  EMPLOYMENT_LABELS,
  EMPLOYMENT_TYPES,
  type PostingKind,
  REMOTE_LABELS,
  REMOTE_OPTIONS,
} from "@/lib/postings/types";

export type PostingFieldValues = {
  title: string;
  organisation: string;
  listing_slug: string;
  location: string;
  country: string;
  remote: string;
  employment_type: string;
  category: string;
  salary_min: string;
  salary_max: string;
  salary_currency: string;
  salary_period: string;
  description: string;
  apply_url: string;
  apply_email: string;
  closing_date: string;
};

export const EMPTY_POSTING_FIELDS: PostingFieldValues = {
  title: "",
  organisation: "",
  listing_slug: "",
  location: "",
  country: "",
  remote: "onsite",
  employment_type: "",
  category: "",
  salary_min: "",
  salary_max: "",
  salary_currency: "",
  salary_period: "year",
  description: "",
  apply_url: "",
  apply_email: "",
  closing_date: "",
};

const field = "rounded border border-rule bg-paper px-3 py-2 text-base";

export function PostingFields({ kind, values }: { kind: PostingKind; values: PostingFieldValues }) {
  const job = kind === "job";
  return (
    <>
      <input type="hidden" name="kind" value={kind} />
      <label className="flex flex-col gap-1 text-sm">
        {job ? "Job title" : "Headline"}
        <input name="title" required maxLength={160} defaultValue={values.title} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {job ? "Organisation" : "Offered by"}
        <input name="organisation" required maxLength={160} defaultValue={values.organisation} className={field} />
      </label>
      {job ? (
        <label className="flex flex-col gap-1 text-sm">
          Employment type
          <select name="employment_type" required defaultValue={values.employment_type} className={field}>
            <option value="" disabled>Choose a type</option>
            {EMPLOYMENT_TYPES.map((type) => (
              <option key={type} value={type}>{EMPLOYMENT_LABELS[type]}</option>
            ))}
          </select>
        </label>
      ) : (
        <label className="flex flex-col gap-1 text-sm">
          Category
          <select name="category" required defaultValue={values.category} className={field}>
            <option value="" disabled>Choose a category</option>
            {CLASSIFIED_CATEGORIES.map((category) => (
              <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>
            ))}
          </select>
        </label>
      )}
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="mb-1">Where</legend>
        {REMOTE_OPTIONS.map((option) => (
          <label key={option} className="flex items-center gap-2">
            <input type="radio" name="remote" value={option} defaultChecked={values.remote === option} /> {REMOTE_LABELS[option]}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Location
          <input name="location" maxLength={160} placeholder="City or region" defaultValue={values.location} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Country code
          <input name="country" maxLength={2} placeholder="ZA" autoCapitalize="characters" defaultValue={values.country} className={`${field} uppercase`} />
        </label>
      </div>
      {job ? (
        <fieldset className="grid gap-3 text-sm sm:grid-cols-4">
          <legend className="mb-1">Pay (optional)</legend>
          <label className="flex flex-col gap-1">
            From
            <input name="salary_min" inputMode="numeric" maxLength={12} defaultValue={values.salary_min} className={field} />
          </label>
          <label className="flex flex-col gap-1">
            To
            <input name="salary_max" inputMode="numeric" maxLength={12} defaultValue={values.salary_max} className={field} />
          </label>
          <label className="flex flex-col gap-1">
            Currency
            <input name="salary_currency" maxLength={3} placeholder="USD" defaultValue={values.salary_currency} className={`${field} uppercase`} />
          </label>
          <label className="flex flex-col gap-1">
            Per
            <select name="salary_period" defaultValue={values.salary_period || "year"} className={field}>
              <option value="year">year</option>
              <option value="month">month</option>
              <option value="hour">hour</option>
            </select>
          </label>
        </fieldset>
      ) : null}
      <label className="flex flex-col gap-1 text-sm">
        Description
        <textarea name="description" required minLength={20} maxLength={6000} rows={8} defaultValue={values.description} className={field} />
        <span className="text-xs text-muted">Plain text. Leave a blank line between paragraphs. No substances, dosing or cure claims; see the posting policy.</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {job ? "Link to apply" : "Link for details"}
        <input name="apply_url" type="url" maxLength={500} placeholder="https://" defaultValue={values.apply_url} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {job ? "Or email for applications" : "Or email for enquiries"}
        <input name="apply_email" type="email" maxLength={254} defaultValue={values.apply_email} className={field} />
        <span className="text-xs text-muted">This one is published. Give a link, an email, or both.</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Closing date (optional)
        <input name="closing_date" type="date" defaultValue={values.closing_date} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Directory listing (optional)
        <input name="listing_slug" maxLength={200} placeholder="Listing address or slug" defaultValue={values.listing_slug} className={field} />
      </label>
    </>
  );
}
