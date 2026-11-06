import assert from "node:assert/strict";
import test from "node:test";
import { isHostedPlaceholderMessage } from "./chatMessageVisibility.ts";

test("keeps call records visible when their message content is empty", () => {
  for (const call_status of ["ringing", "accepted", "missed", "declined", "ended"]) {
    assert.equal(isHostedPlaceholderMessage({ message_kind: "call", content: "", call_status }), false);
  }
});

test("continues to hide empty hosted placeholder text messages", () => {
  assert.equal(isHostedPlaceholderMessage({ message_kind: "text", content: "  O  \n0\n" }), true);
  assert.equal(isHostedPlaceholderMessage({ content: "" }), true);
});

test("keeps text messages with content, replies, or attachments", () => {
  assert.equal(isHostedPlaceholderMessage({ message_kind: "text", content: "Hello" }), false);
  assert.equal(isHostedPlaceholderMessage({ message_kind: "text", reply_to_message_id: "reply-1" }), false);
  assert.equal(isHostedPlaceholderMessage({ message_kind: "attachment", attachment_file_path: "files/report.pdf" }), false);
});
