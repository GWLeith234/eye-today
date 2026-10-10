export type PostingKind = "job" | "classified";

export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "temporary", "internship", "volunteer"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  temporary: "Temporary",
  internship: "Internship",
  volunteer: "Volunteer",
};

export const CLASSIFIED_CATEGORIES = ["training", "services", "retreats", "other"] as const;
export type ClassifiedCategory = (typeof CLASSIFIED_CATEGORIES)[number];
export const CATEGORY_LABELS: Record<ClassifiedCategory, string> = {
  training: "Training",
  services: "Services",
  retreats: "Retreats",
  other: "Other",
};

export const REMOTE_OPTIONS = ["onsite", "remote", "hybrid"] as const;
export type Remote = (typeof REMOTE_OPTIONS)[number];
export const REMOTE_LABELS: Record<Remote, string> = { onsite: "On site", remote: "Remote", hybrid: "Hybrid" };

export type PostingStatus = "draft" | "pending" | "published" | "expired" | "rejected";

export const BOARD: Record<PostingKind, { path: "/jobs" | "/classifieds"; title: string; singular: string }> = {
  job: { path: "/jobs", title: "Jobs", singular: "job" },
  classified: { path: "/classifieds", title: "Classifieds", singular: "classified" },
};

export type PostingCard = {
  id: string;
  slug: string;
  title: string;
  organisation: string;
  location: string | null;
  country_code: string | null;
  remote: Remote;
  employment_type: EmploymentType | null;
  category: ClassifiedCategory | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: "hour" | "month" | "year" | null;
  closing_date: string | null;
  published_at: string;
};

export type PostingDetail = PostingCard & {
  description_html: string;
  apply_url: string | null;
  apply_email: string | null;
  listing_slug: string | null;
  listing_name: string | null;
  expires_at: string;
  updated_at: string;
};

export type JobSummary = {
  id: string;
  slug: string;
  title: string;
  organisation: string;
  location: string | null;
  remote: Remote;
  employment_type: EmploymentType | null;
  published_at: string;
};
