import { splitTags } from "./query";

// The fields an owner may propose. The list is the first fence: propose_listing_edit repeats it in SQL
// and approve_listing_proposal writes only these columns, so verification_level, verification_note,
// status, relationship_disclosure and the coordinates cannot be changed from here whatever is sent.
export const PROPOSAL_TEXT_FIELDS = ["name", "country_code", "region", "city", "website", "public_email", "public_phone", "description"] as const;
export const PROPOSAL_LIST_FIELDS = ["services", "languages"] as const;

export type ProposalPayload = Partial<Record<(typeof PROPOSAL_TEXT_FIELDS)[number], string>> &
  Partial<Record<(typeof PROPOSAL_LIST_FIELDS)[number], string[]>>;

type Source = { get(name: string): unknown } | Record<string, unknown>;

function read(source: Source, key: string): unknown {
  return typeof (source as { get?: unknown }).get === "function" ? (source as { get(name: string): unknown }).get(key) : (source as Record<string, unknown>)[key];
}

// Keeps whitelisted keys only, trims text, strips angle brackets, and splits comma lists into tags.
// A key that is absent stays absent, so an owner changes only what they typed.
export function buildProposalPayload(source: Source): ProposalPayload {
  const payload: ProposalPayload = {};
  for (const key of PROPOSAL_TEXT_FIELDS) {
    const value = read(source, key);
    if (typeof value === "string") payload[key] = value.replace(/[<>]/g, "").trim();
  }
  if (payload.country_code) payload.country_code = payload.country_code.toUpperCase();
  for (const key of PROPOSAL_LIST_FIELDS) {
    const value = read(source, key);
    if (typeof value === "string") payload[key] = splitTags(value);
  }
  return payload;
}

// Only what differs from the listing, so the editor sees the change and not a full copy.
export function changedFields(payload: ProposalPayload, current: Record<string, unknown>): ProposalPayload {
  const changed: ProposalPayload = {};
  for (const key of PROPOSAL_TEXT_FIELDS) {
    if (payload[key] === undefined) continue;
    const before = typeof current[key] === "string" ? (current[key] as string) : "";
    if (payload[key] !== before) changed[key] = payload[key];
  }
  for (const key of PROPOSAL_LIST_FIELDS) {
    if (payload[key] === undefined) continue;
    const before = Array.isArray(current[key]) ? (current[key] as string[]) : [];
    if (payload[key]!.join("\u0000") !== before.join("\u0000")) changed[key] = payload[key];
  }
  return changed;
}
