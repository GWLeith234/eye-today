import assert from "node:assert/strict";
import { test } from "node:test";

import { listingJsonLd } from "./jsonld";

const base = {
  name: "Alpha Retreat",
  description: "A short description.",
  country_code: "MX",
  region: "Quintana Roo",
  city: "Tulum",
  website: "https://alpha.example",
  public_email: "hello@alpha.example",
  public_phone: null,
  logoUrl: null,
  pageUrl: "https://eye.example/directory/listing/alpha-retreat",
};

test("listing JSON-LD uses a clinic type only for clinic categories and never invents a rating", () => {
  const clinic = listingJsonLd({ ...base, category_slug: "treatment-clinic", verification_level: "verified" });
  assert.equal(clinic["@type"], "MedicalClinic");
  assert.equal(clinic.url, "https://alpha.example");
  assert.equal(clinic.email, "hello@alpha.example");
  assert.equal("telephone" in clinic, false);
  assert.equal("aggregateRating" in clinic, false);
  assert.equal("review" in clinic, false);
  assert.equal(JSON.stringify(clinic).includes("rating"), false);

  const group = listingJsonLd({
    ...base,
    category_slug: "peer-support",
    verification_level: "medically_supervised",
    website: null,
    public_email: null,
    description: "  ",
  });
  assert.equal(group["@type"], "LocalBusiness");
  assert.equal(group.url, base.pageUrl);
  assert.equal("email" in group, false);
  assert.equal("description" in group, false);
  assert.equal("aggregateRating" in group, false);
});
