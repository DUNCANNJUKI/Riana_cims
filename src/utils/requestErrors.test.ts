import assert from "node:assert/strict";
import test from "node:test";

import { friendlyRequestError } from "./requestErrors.ts";

test("communication migration failures show a safe actionable message", () => {
  const message = friendlyRequestError(503, {
    code: "COMMUNICATION_MIGRATION_REQUIRED",
    error: "Communication services require the pending additive database migration.",
  });
  assert.match(message, /required system update/i);
  assert.doesNotMatch(message, /database migration/i);
});

test("unknown server failures remain generic", () => {
  assert.match(friendlyRequestError(500, { error: "private SQL failure" }), /temporarily unavailable/i);
});
