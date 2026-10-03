import assert from "node:assert/strict";
import { test } from "node:test";

import { publishVerificationError } from "./publish";
import { UNREVIEWED_SUBMISSION_NOTE } from "./types";

test("verified and medically supervised cannot publish on the unread submission note", () => {
  const message = "Write what you checked before publishing at this level.";
  assert.equal(publishVerificationError("published", "verified", UNREVIEWED_SUBMISSION_NOTE), message);
  assert.equal(publishVerificationError("published", "medically_supervised", `  ${UNREVIEWED_SUBMISSION_NOTE}  `), message);
});

test("listed can publish on that note, and a written note can publish at any level", () => {
  assert.equal(publishVerificationError("published", "listed", UNREVIEWED_SUBMISSION_NOTE), null);
  assert.equal(publishVerificationError("published", "verified", "Checked the operator website."), null);
  assert.equal(publishVerificationError("draft", "verified", UNREVIEWED_SUBMISSION_NOTE), null);
});
