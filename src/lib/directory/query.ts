import { SLUG_RE, slugify } from "@/lib/slug";

import { type VerificationLevel, isVerificationLevel } from "./types";

export type DirectoryFilters = {
  q: string;
  country: string;
  category: string;
  service: string;
  verification: VerificationLevel | "";
  page: number;
};

function one(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

export function parseDirectoryFilters(input: {
  q?: unknown;
  country?: unknown;
  category?: unknown;
  service?: unknown;
  verification?: unknown;
  page?: unknown;
}): DirectoryFilters {
  const q = one(input.q).trim().replace(/[<>]/g, "").slice(0, 80);
  const countryRaw = one(input.country).trim();
  const country = /^[a-z]{2}$/i.test(countryRaw) ? countryRaw.toUpperCase() : "";
  const categoryRaw = one(input.category).trim().toLowerCase();
  const category = SLUG_RE.test(categoryRaw) ? categoryRaw : "";
  const service = one(input.service).trim().replace(/[<>]/g, "").slice(0, 40);
  const verificationRaw = one(input.verification).trim();
  const verification = isVerificationLevel(verificationRaw) ? verificationRaw : "";
  const pageText = one(input.page);
  const page = /^\d{1,3}$/.test(pageText) ? Math.min(100, Math.max(1, Number(pageText))) : 1;
  return { q, country, category, service, verification, page };
}

export function directoryHref(filters: DirectoryFilters, page = filters.page): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.country) params.set("country", filters.country);
  if (filters.category) params.set("category", filters.category);
  if (filters.service) params.set("service", filters.service);
  if (filters.verification) params.set("verification", filters.verification);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/directory?${query}` : "/directory";
}

export function splitTags(value: string, max = 20): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of value.split(",")) {
    const tag = part.trim().replace(/[<>]/g, "").slice(0, 40);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    tags.push(tag);
    if (tags.length >= max) break;
  }
  return tags;
}

export function serviceSlugs(services: string[]): string[] {
  const slugs = new Set<string>();
  for (const service of services) {
    const slug = slugify(service);
    if (slug) slugs.add(slug);
  }
  return [...slugs].slice(0, 20);
}
