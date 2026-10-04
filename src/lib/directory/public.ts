import "server-only";

import { createAnonClient } from "@/lib/supabase/anon";

import type { ArticleCard } from "@/lib/public/data";

import type { DirectoryFilters } from "./query";
import { serviceSlugs } from "./query";
import type { DirectoryCategory, LegalStatus, ListingCard, ListingDetail } from "./types";

function client() {
  return createAnonClient();
}

// A hung database must not hold the page open. A live Supabase answers well
// inside this window; the placeholder host used in local smoke does not.
function within<T>(work: Promise<T>, fallback: T): Promise<T> {
  const settled = work.catch(() => fallback);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), 4000);
    void settled.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

export function getDirectoryCategories(): Promise<DirectoryCategory[]> {
  return within(loadCategories(), []);
}

async function loadCategories(): Promise<DirectoryCategory[]> {
  const supabase = client();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("directory_categories")
    .select("slug, name, sort")
    .eq("hidden", false)
    .order("sort")
    .order("name")
    .returns<DirectoryCategory[]>();
  if (error) {
    console.error("public read directory_categories failed", error.code);
    return [];
  }
  return data ?? [];
}

export function searchDirectory(filters: DirectoryFilters): Promise<ListingCard[]> {
  return within(loadSearch(filters), []);
}

async function loadSearch(filters: DirectoryFilters): Promise<ListingCard[]> {
  const supabase = client();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("directory_search", {
    q: filters.q,
    country_code: filters.country,
    category_slug: filters.category,
    service: filters.service,
    verification: filters.verification,
    page: filters.page,
  });
  if (error) {
    console.error("public read directory_search failed", error.code);
    return [];
  }
  return (data ?? []) as ListingCard[];
}

export function countDirectory(filters: DirectoryFilters): Promise<number> {
  return within(loadCount(filters), 0);
}

async function loadCount(filters: DirectoryFilters): Promise<number> {
  const supabase = client();
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc("directory_search_count", {
    q: filters.q,
    country_code: filters.country,
    category_slug: filters.category,
    service: filters.service,
    verification: filters.verification,
  });
  if (error) {
    console.error("public read directory_search_count failed", error.code);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}

export function getDirectoryListing(slug: string): Promise<ListingDetail | null> {
  return within(loadListing(slug), null);
}

async function loadListing(slug: string): Promise<ListingDetail | null> {
  const supabase = client();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("directory_listing", { slug });
  if (error) {
    console.error("public read directory_listing failed", error.code);
    return null;
  }
  const rows = (data ?? []) as ListingDetail[];
  return rows[0] ?? null;
}

export function getLegalStatus(country: string): Promise<LegalStatus | null> {
  return within(loadLegal(country), null);
}

async function loadLegal(country: string): Promise<LegalStatus | null> {
  const supabase = client();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("directory_legal", { country_code: country });
  if (error) {
    console.error("public read directory_legal failed", error.code);
    return null;
  }
  const rows = (data ?? []) as LegalStatus[];
  return rows[0] ?? null;
}

export function getDirectoryServices(): Promise<string[]> {
  return within(loadServices(), []);
}

async function loadServices(): Promise<string[]> {
  const supabase = client();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("directory_services");
  if (error) {
    console.error("public read directory_services failed", error.code);
    return [];
  }
  return ((data ?? []) as { service: string }[]).map((row) => row.service);
}

export function getRelatedStories(services: string[]): Promise<ArticleCard[]> {
  return within(loadRelated(services), []);
}

async function loadRelated(services: string[]): Promise<ArticleCard[]> {
  const slugs = serviceSlugs(services);
  if (slugs.length === 0) return [];
  const supabase = client();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("directory_related_stories", { service_slugs: slugs });
  if (error) {
    console.error("public read directory_related_stories failed", error.code);
    return [];
  }
  return (data ?? []) as ArticleCard[];
}

export function getDirectorySitemap(): Promise<{ kind: string; slug: string; updated_at: string }[]> {
  return within(loadSitemap(), []);
}

async function loadSitemap(): Promise<{ kind: string; slug: string; updated_at: string }[]> {
  const supabase = client();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("directory_sitemap");
  if (error) {
    console.error("public read directory_sitemap failed", error.code);
    return [];
  }
  return (data ?? []) as { kind: string; slug: string; updated_at: string }[];
}

export function getArticleListings(articleId: string): Promise<ListingCard[]> {
  return within(loadArticleListings(articleId), []);
}

async function loadArticleListings(articleId: string): Promise<ListingCard[]> {
  const supabase = client();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("article_directory_cards", { p_article: articleId });
  if (error) {
    console.error("public read article_directory_cards failed", error.code);
    return [];
  }
  return (data ?? []) as ListingCard[];
}

// Stories by the listing's service tags plus the ones an editor attached to it.
export function getListingStories(listingId: string, services: string[]): Promise<ArticleCard[]> {
  return within(loadListingStories(listingId, services), []);
}

async function loadListingStories(listingId: string, services: string[]): Promise<ArticleCard[]> {
  const supabase = client();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("directory_listing_stories", { p_listing: listingId, service_slugs: serviceSlugs(services) });
  if (error) {
    console.error("public read directory_listing_stories failed", error.code);
    return [];
  }
  return (data ?? []) as ArticleCard[];
}
