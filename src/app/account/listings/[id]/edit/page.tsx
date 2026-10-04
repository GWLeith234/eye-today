import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { requireArea } from "@/lib/auth/session";

import { proposeEdit } from "../../actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid: "Check the fields. A website must start with https://, and an email must be an email address.",
  proposals_limit: "You already have three changes waiting for an editor. Wait for a decision first.",
  not_owner: "Only a verified owner can propose changes.",
};

const field = "rounded border border-rule bg-paper px-3 py-2 text-base";

type Row = {
  id: string;
  name: string;
  country_code: string;
  region: string | null;
  city: string | null;
  services: string[] | null;
  languages: string[] | null;
  website: string | null;
  public_email: string | null;
  public_phone: string | null;
  description: string;
};

export default async function ProposeEditPage({ params, searchParams }: PageProps<"/account/listings/[id]/edit">) {
  const { supabase } = await requireArea("account");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  // RLS: the listing is readable here only because it is published; ownership is checked by the function on submit.
  const { data: owner } = await supabase.from("listing_owners").select("id").eq("listing_id", id.data).maybeSingle();
  if (!owner) notFound();
  const { data: listing } = await supabase
    .from("directory_listings")
    .select("id, name, country_code, region, city, services, languages, website, public_email, public_phone, description")
    .eq("id", id.data)
    .maybeSingle<Row>();
  if (!listing) notFound();
  const query = await searchParams;
  const error = typeof query.error === "string" ? ERRORS[query.error] : null;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 p-8">
      <h1 className="text-3xl font-bold">Propose a change to {listing.name}</h1>
      <p className="text-sm text-muted">
        An editor reviews this before anything is published. The verification level, the verification note, the publisher
        relationship note and the map position are set by editors and cannot be changed here.{" "}
        <Link href="/account/listings" className="underline">Back to your listings</Link>
      </p>
      {error ? <p role="alert" className="rounded border border-red-600 p-3 text-sm">{error}</p> : null}
      <form action={proposeEdit} className="grid gap-3">
        <input type="hidden" name="listing_id" value={listing.id} />
        <label className="flex flex-col gap-1 text-sm">Name<input name="name" defaultValue={listing.name} required maxLength={160} className={field} /></label>
        <label className="flex flex-col gap-1 text-sm">Country code<input name="country_code" defaultValue={listing.country_code} required minLength={2} maxLength={2} className={`${field} uppercase`} /></label>
        <label className="flex flex-col gap-1 text-sm">Region<input name="region" defaultValue={listing.region ?? ""} maxLength={80} className={field} /></label>
        <label className="flex flex-col gap-1 text-sm">City<input name="city" defaultValue={listing.city ?? ""} maxLength={80} className={field} /></label>
        <label className="flex flex-col gap-1 text-sm">Services<input name="services" defaultValue={(listing.services ?? []).join(", ")} maxLength={1000} className={field} /></label>
        <label className="flex flex-col gap-1 text-sm">Languages<input name="languages" defaultValue={(listing.languages ?? []).join(", ")} maxLength={500} className={field} /></label>
        <label className="flex flex-col gap-1 text-sm">Website<input name="website" type="url" defaultValue={listing.website ?? ""} maxLength={300} className={field} /></label>
        <label className="flex flex-col gap-1 text-sm">Public email<input name="public_email" type="email" defaultValue={listing.public_email ?? ""} maxLength={254} className={field} /></label>
        <label className="flex flex-col gap-1 text-sm">Public phone<input name="public_phone" type="tel" defaultValue={listing.public_phone ?? ""} maxLength={40} className={field} /></label>
        <label className="flex flex-col gap-1 text-sm">Description<textarea name="description" defaultValue={listing.description} maxLength={2000} rows={6} className={field} /></label>
        <button type="submit" className="self-start rounded bg-ink px-4 py-2 text-paper">Send for review</button>
      </form>
    </main>
  );
}
