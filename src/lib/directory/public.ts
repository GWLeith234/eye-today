import "server-only";

import { isLegalCategory, type LegalMapRow } from "./legal-map";

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
//
// The fallback is a lie the reader can see — an empty directory reads as "we list no clinics", not
// as "something went wrong" — so taking it has to leave a trace. Silent fallbacks are how the
// directory served one listing out of four with nothing in the logs to say why.
function within<T>(label: string, work: Promise<T>, fallback: T): Promise<T> {
  const settled = work.catch((error) => {
    console.error("public read threw", label, error instanceof Error ? error.message : String(error));
    return fallback;
  });
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.error("public read timed out after 4s, serving the empty fallback", label);
      resolve(fallback);
    }, 4000);
    void settled.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

// Every read goes through the anon client; when the environment has no Supabase configured at all,
// every page on the site quietly renders empty. Worth one line in the log rather than none.
function noClient<T>(label: string, fallback: T): T {
  console.error("public read has no Supabase client", label);
  return fallback;
}

export function getDirectoryCategories(): Promise<DirectoryCategory[]> {
  return within("loadCategories", loadCategories(), []);
}

async function loadCategories(): Promise<DirectoryCategory[]> {
  const supabase = client();
  if (!supabase) return noClient("loadCategories", []);
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
  return within("loadSearch", loadSearch(filters), []);
}

async function loadSearch(filters: DirectoryFilters): Promise<ListingCard[]> {
  const supabase = client();
  if (!supabase) return noClient("loadSearch", []);
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
  const rows = (data ?? []) as ListingCard[];
  // TEMPORARY (2026-10-18): production serves one listing where the same RPC run as `anon` in SQL
  // returns four, and the category filter appears to do nothing. Nothing is logged today because
  // the call succeeds — so log what we asked for and what came back, read one real request, and
  // take this line out again.
  //
  // console.error, not console.log: Railway's deploy stream carries stderr. The first version of
  // this line used console.log and produced nothing, which read like "the page never rendered" —
  // a wrong conclusion that a control request to /podcasts (fresh, correct, and equally silent)
  // caught. Anything written here to be read later goes to stderr.
  console.error("directory_search", JSON.stringify(filters), "->", rows.length, "rows");
  return rows;
}

export function countDirectory(filters: DirectoryFilters): Promise<number> {
  return within("loadCount", loadCount(filters), 0);
}

async function loadCount(filters: DirectoryFilters): Promise<number> {
  const supabase = client();
  if (!supabase) return noClient("loadCount", 0);
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
  return within("loadListing", loadListing(slug), null);
}

async function loadListing(slug: string): Promise<ListingDetail | null> {
  const supabase = client();
  if (!supabase) return noClient("loadListing", null);
  const { data, error } = await supabase.rpc("directory_listing", { slug });
  if (error) {
    console.error("public read directory_listing failed", error.code);
    return null;
  }
  const rows = (data ?? []) as ListingDetail[];
  return rows[0] ?? null;
}

export function getLegalStatus(country: string): Promise<LegalStatus | null> {
  return within("loadLegal", loadLegal(country), null);
}

async function loadLegal(country: string): Promise<LegalStatus | null> {
  const supabase = client();
  if (!supabase) return noClient("loadLegal", null);
  const { data, error } = await supabase.rpc("directory_legal", { country_code: country });
  if (error) {
    console.error("public read directory_legal failed", error.code);
    return null;
  }
  const rows = (data ?? []) as LegalStatus[];
  return rows[0] ?? null;
}

export function getLegalMap(): Promise<LegalMapRow[]> {
  return within("loadLegalMap", loadLegalMap(), []);
}

async function loadLegalMap(): Promise<LegalMapRow[]> {
  const supabase = client();
  if (!supabase) return noClient("loadLegalMap", []);
  const { data, error } = await supabase.rpc("legal_map_public");
  if (error) {
    console.error("public read legal_map_public failed", error.code);
    return [];
  }
  return ((data ?? []) as LegalMapRow[]).filter((row) => isLegalCategory(row.legal_category));
}

// Platform links and hosts for the podcast cards on a results page, keyed by slug.
export function getPlatformLinks(slugs: string[]): Promise<Map<string, { platform_links: unknown; host_names: string | null }>> {
  return within("loadPlatformLinks", loadPlatformLinks(slugs), new Map());
}

async function loadPlatformLinks(slugs: string[]): Promise<Map<string, { platform_links: unknown; host_names: string | null }>> {
  const supabase = client();
  if (!supabase || slugs.length === 0) return new Map();
  const { data, error } = await supabase.rpc("directory_platform_links", { p_slugs: slugs });
  if (error) {
    console.error("public read directory_platform_links failed", error.code);
    return new Map();
  }
  return new Map(((data ?? []) as { slug: string; platform_links: unknown; host_names: string | null }[]).map((row) => [row.slug, row]));
}

export function getDirectoryServices(): Promise<string[]> {
  return within("loadServices", loadServices(), []);
}

async function loadServices(): Promise<string[]> {
  const supabase = client();
  if (!supabase) return noClient("loadServices", []);
  const { data, error } = await supabase.rpc("directory_services");
  if (error) {
    console.error("public read directory_services failed", error.code);
    return [];
  }
  return ((data ?? []) as { service: string }[]).map((row) => row.service);
}

export function getRelatedStories(services: string[]): Promise<ArticleCard[]> {
  return within("loadRelated", loadRelated(services), []);
}

async function loadRelated(services: string[]): Promise<ArticleCard[]> {
  const slugs = serviceSlugs(services);
  if (slugs.length === 0) return [];
  const supabase = client();
  if (!supabase) return noClient("loadRelated", []);
  const { data, error } = await supabase.rpc("directory_related_stories", { service_slugs: slugs });
  if (error) {
    console.error("public read directory_related_stories failed", error.code);
    return [];
  }
  return (data ?? []) as ArticleCard[];
}

export function getDirectorySitemap(): Promise<{ kind: string; slug: string; updated_at: string }[]> {
  return within("loadSitemap", loadSitemap(), []);
}

async function loadSitemap(): Promise<{ kind: string; slug: string; updated_at: string }[]> {
  const supabase = client();
  if (!supabase) return noClient("loadSitemap", []);
  const { data, error } = await supabase.rpc("directory_sitemap");
  if (error) {
    console.error("public read directory_sitemap failed", error.code);
    return [];
  }
  return (data ?? []) as { kind: string; slug: string; updated_at: string }[];
}

export function getArticleListings(articleId: string): Promise<ListingCard[]> {
  return within("loadArticleListings", loadArticleListings(articleId), []);
}

async function loadArticleListings(articleId: string): Promise<ListingCard[]> {
  const supabase = client();
  if (!supabase) return noClient("loadArticleListings", []);
  const { data, error } = await supabase.rpc("article_directory_cards", { p_article: articleId });
  if (error) {
    console.error("public read article_directory_cards failed", error.code);
    return [];
  }
  return (data ?? []) as ListingCard[];
}

// Stories by the listing's service tags plus the ones an editor attached to it.
export function getListingStories(listingId: string, services: string[]): Promise<ArticleCard[]> {
  return within("loadListingStories", loadListingStories(listingId, services), []);
}

async function loadListingStories(listingId: string, services: string[]): Promise<ArticleCard[]> {
  const supabase = client();
  if (!supabase) return noClient("loadListingStories", []);
  const { data, error } = await supabase.rpc("directory_listing_stories", { p_listing: listingId, service_slugs: serviceSlugs(services) });
  if (error) {
    console.error("public read directory_listing_stories failed", error.code);
    return [];
  }
  return (data ?? []) as ArticleCard[];
}

// One active premium listing, chosen at random, for the labelled sponsored card on section and
// article pages. Null when nobody has bought one.
export function getSponsoredListing(): Promise<ListingCard | null> {
  return within("loadSponsoredListing", loadSponsoredListing(), null);
}

async function loadSponsoredListing(): Promise<ListingCard | null> {
  const supabase = client();
  if (!supabase) return noClient("loadSponsoredListing", null);
  const { data, error } = await supabase.rpc("serve_sponsored_listing");
  if (error) {
    console.error("public read serve_sponsored_listing failed", error.code);
    return null;
  }
  return ((data ?? []) as ListingCard[])[0] ?? null;
}
