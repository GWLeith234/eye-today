import assert from "node:assert/strict";
import { test } from "node:test";

import { buildProposalPayload, changedFields } from "./proposal";

test("a proposal keeps only whitelisted fields: verification, status, notes and coordinates never get through", () => {
  const payload = buildProposalPayload({
    name: " Claimco Clinic ",
    country_code: "mx",
    city: "Tulum",
    services: "retreat, integration, retreat",
    verification_level: "medically_supervised",
    verification_note: "I checked myself",
    status: "published",
    relationship_disclosure: "none",
    lat: "5",
    lng: "5",
    last_reviewed_at: "2026-01-01",
    slug: "new-slug",
    category_id: "x",
  });
  assert.deepEqual(payload, { name: "Claimco Clinic", country_code: "MX", city: "Tulum", services: ["retreat", "integration"] });
  for (const forbidden of ["verification_level", "verification_note", "status", "relationship_disclosure", "lat", "lng", "last_reviewed_at", "slug", "category_id"]) {
    assert.ok(!(forbidden in payload), `${forbidden} must not be proposable`);
  }
});

test("form data works as a source, and angle brackets are stripped", () => {
  const form = new FormData();
  form.set("name", "<b>Safe</b> Clinic");
  form.set("description", "Plain <script>text</script>");
  form.set("verification_level", "verified");
  const payload = buildProposalPayload(form);
  assert.equal(payload.name, "bSafe/b Clinic");
  assert.ok(!payload.description?.includes("<"));
  assert.ok(!("verification_level" in payload));
});

test("a field the owner did not send stays out of the proposal", () => {
  assert.deepEqual(buildProposalPayload({ city: "Lisbon" }), { city: "Lisbon" });
  assert.deepEqual(buildProposalPayload({}), {});
});

test("changedFields keeps only what differs from the live listing", () => {
  const current = { name: "Claimco", city: "Tulum", services: ["retreat"], languages: [], description: "Same." };
  const proposed = buildProposalPayload({ name: "Claimco", city: "Playa", services: "retreat", languages: "English", description: "Same." });
  assert.deepEqual(changedFields(proposed, current), { city: "Playa", languages: ["English"] });
});
