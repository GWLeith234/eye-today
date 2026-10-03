"use client";

import { useActionState, useState, useTransition } from "react";

import { LISTING_STATUSES, VERIFICATION_LABELS, VERIFICATION_LEVELS, type ListingStatus, type VerificationLevel } from "@/lib/directory/types";

import { checkListingClaims, saveListing, type ClaimFlag, type SaveState } from "./actions";

type Category = { id: string; name: string };
type MediaOption = { id: string; storage_path: string; alt: string | null };

export type ListingFormValue = {
  id: string;
  name: string;
  slug: string;
  category_id: string;
  country_code: string;
  region: string;
  city: string;
  services: string;
  languages: string;
  website: string;
  public_email: string;
  public_phone: string;
  description: string;
  logo_media_id: string;
  photo_ids: string[];
  verification_level: VerificationLevel;
  verification_note: string;
  relationship_disclosure: string;
  last_reviewed_at: string;
  status: ListingStatus;
};

const field = "rounded border px-3 py-2 text-base";

export function ListingForm({
  listing,
  categories,
  media,
  notice,
}: {
  listing: ListingFormValue;
  categories: Category[];
  media: MediaOption[];
  notice?: string;
}) {
  const [state, action, pending] = useActionState(saveListing, { error: null } satisfies SaveState);
  const [description, setDescription] = useState(listing.description);
  const [flags, setFlags] = useState<{ ok: true; items: ClaimFlag[] } | { ok: false; error: string } | null>(null);
  const [checking, startCheck] = useTransition();

  return (
    <form action={action} className="grid max-w-2xl gap-3">
      {notice ? <p role="status" className="rounded border border-green-600 p-2 text-sm">{notice}</p> : null}
      {state.error ? <p role="alert" className="rounded border border-red-600 p-2 text-sm">{state.error}</p> : null}
      <input type="hidden" name="id" value={listing.id} />
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input name="name" required defaultValue={listing.name} maxLength={160} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Slug
        <input name="slug" required defaultValue={listing.slug} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Category
        <select name="category_id" required defaultValue={listing.category_id} className={field}>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Country code
        <input name="country_code" required defaultValue={listing.country_code} maxLength={2} minLength={2} className={`${field} uppercase`} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Region
        <input name="region" defaultValue={listing.region} maxLength={80} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        City
        <input name="city" defaultValue={listing.city} maxLength={80} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Services
        <input name="services" defaultValue={listing.services} maxLength={1000} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Languages
        <input name="languages" defaultValue={listing.languages} maxLength={500} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Website
        <input name="website" defaultValue={listing.website} maxLength={300} placeholder="https://" className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Public email
        <input name="public_email" type="email" defaultValue={listing.public_email} maxLength={254} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Public phone
        <input name="public_phone" defaultValue={listing.public_phone} maxLength={40} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Description
        <textarea name="description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={6} className={field} />
      </label>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => {
            startCheck(async () => {
              setFlags(await checkListingClaims(description));
            });
          }}
          disabled={checking}
          className="self-start rounded border px-3 py-1 text-sm"
        >
          {checking ? "Checking claims…" : "Check claims"}
        </button>
        {flags?.ok === false ? <p role="alert" className="text-sm">{flags.error}</p> : null}
        {flags?.ok === true ? (
          <div role="status" className="text-sm">
            {flags.items.length === 0 ? <p>No claims flagged. Nothing was changed.</p> : null}
            {flags.items.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {flags.items.map((item) => (
                  <li key={`${item.kind}-${item.sentence}`} className="rounded border p-2">
                    <span className="font-semibold uppercase">{item.kind}.</span> {item.sentence} {item.reason}
                  </li>
                ))}
                <li>Flags are for you to read. Nothing was changed.</li>
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Logo
        <select name="logo_media_id" defaultValue={listing.logo_media_id} className={field}>
          <option value="">None</option>
          {media.map((item) => (
            <option key={item.id} value={item.id}>{item.alt || item.storage_path}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Photos
        <select name="photos" multiple defaultValue={listing.photo_ids} size={4} className={field}>
          {media.map((item) => (
            <option key={item.id} value={item.id}>{item.alt || item.storage_path}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Verification
        <select name="verification_level" required defaultValue={listing.verification_level} className={field}>
          {VERIFICATION_LEVELS.map((level) => (
            <option key={level} value={level}>{VERIFICATION_LABELS[level]}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Verification note
        <textarea name="verification_note" required defaultValue={listing.verification_note} maxLength={500} rows={3} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Relationship disclosure
        <textarea name="relationship_disclosure" defaultValue={listing.relationship_disclosure} maxLength={1000} rows={3} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Last reviewed
        <input name="last_reviewed_at" type="date" defaultValue={listing.last_reviewed_at} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Status
        <select name="status" required defaultValue={listing.status} className={field}>
          {LISTING_STATUSES.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className="self-start rounded bg-foreground px-4 py-2 text-background disabled:opacity-50">
        {pending ? "Saving…" : "Save listing"}
      </button>
    </form>
  );
}
