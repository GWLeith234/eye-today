import { htmlToText } from "@/lib/events/ics";

import type { PostingDetail } from "./types";

const EMPLOYMENT: Record<string, string> = {
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
  temporary: "TEMPORARY",
  internship: "INTERN",
  volunteer: "VOLUNTEER",
};

const UNIT: Record<string, string> = { hour: "HOUR", month: "MONTH", year: "YEAR" };

// schema.org JobPosting for Google for Jobs, built only from fields we hold. validThrough is the earlier of
// the closing date and the paid expiry, so search engines drop it when we do.
export function jobPostingJsonLd(job: PostingDetail, options: { pageUrl: string | null }) {
  const closing = job.closing_date ? new Date(`${job.closing_date}T23:59:59Z`) : null;
  const expiry = new Date(job.expires_at);
  const validThrough = closing && closing < expiry ? closing : expiry;
  const remote = job.remote === "remote";
  const place = {
    "@type": "Place",
    address: {
      "@type": "PostalAddress",
      ...(job.location ? { addressLocality: job.location } : {}),
      ...(job.country_code ? { addressCountry: job.country_code } : {}),
    },
  };
  const hasSalary = job.salary_currency && (job.salary_min !== null || job.salary_max !== null);
  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description_html || `<p>${job.title}</p>`,
    datePosted: new Date(job.published_at).toISOString(),
    validThrough: validThrough.toISOString(),
    ...(job.employment_type && EMPLOYMENT[job.employment_type] ? { employmentType: EMPLOYMENT[job.employment_type] } : {}),
    hiringOrganization: { "@type": "Organization", name: job.organisation },
    ...(remote ? { jobLocationType: "TELECOMMUTE" } : {}),
    ...(remote && job.country_code ? { applicantLocationRequirements: { "@type": "Country", name: job.country_code } } : {}),
    ...(!remote || job.location ? { jobLocation: place } : {}),
    ...(hasSalary
      ? {
          baseSalary: {
            "@type": "MonetaryAmount",
            currency: job.salary_currency,
            value: {
              "@type": "QuantitativeValue",
              ...(job.salary_min !== null ? { minValue: job.salary_min } : {}),
              ...(job.salary_max !== null ? { maxValue: job.salary_max } : {}),
              ...(job.salary_period ? { unitText: UNIT[job.salary_period] } : {}),
            },
          },
        }
      : {}),
    directApply: false,
    ...(options.pageUrl ? { url: options.pageUrl } : {}),
  };
}

export function postingSummary(job: { description_html: string }): string {
  return htmlToText(job.description_html).slice(0, 200);
}
