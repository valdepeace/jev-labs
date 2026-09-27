import assert from "node:assert/strict";
import test from "node:test";
import { toQuestion } from "./prepare-wildchat.js";

test("toQuestion keeps safe programming user prompts and removes source metadata", () => {
  assert.deepEqual(toQuestion({ conversation_hash: "abc", language: "English", toxic: false, redacted: false, conversation: [{ role: "user", content: "How do I fix this Python exception?" }] }), {
    id: "wildchat-abc", text: "How do I fix this Python exception?", source: "wildchat-1m", tags: ["python", "debug"],
  });
  assert.equal(toQuestion({ conversation_hash: "abc", language: "English", toxic: true, redacted: false, conversation: [{ role: "user", content: "Fix my Python error" }] }), undefined);
});
