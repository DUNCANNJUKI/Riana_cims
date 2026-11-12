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

test("passkey setup failures identify safe recovery steps without exposing server details", () => {
  for (const [code, expected] of [
    ['PASSKEY_CONFIGURATION_REQUIRED', /server configuration is incomplete/],
    ['PASSKEY_MIGRATION_REQUIRED', /required system update/],
  ] as const) {
    const message = friendlyRequestError(503, { code, error: 'ER_NO_SUCH_TABLE private_schema.webauthn_credentials' });
    assert.match(message, expected);
    assert.match(message, /password/);
    assert.doesNotMatch(message, /ER_NO_SUCH_TABLE|private_schema|webauthn_credentials/);
  }
});
