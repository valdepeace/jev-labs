import assert from "node:assert/strict";
import test from "node:test";
import "./lab.js";

test("simulator abstains when confidence or margin does not pass policy", () => {
  const result = globalThis.PatternLab.simulate({ scenario: "ambiguous", minConfidence: 0.7, minMargin: 0.1 });
  assert.equal(result.strategy, "abstain");
});

test("simulator filters external providers and preserves a session binding", () => {
  const filtered = globalThis.PatternLab.simulate({ scenario: "external", allowExternal: false });
  assert.ok(!filtered.allowed.includes("frontier"));
  const bound = globalThis.PatternLab.simulate({ scenario: "coding", session: true });
  assert.equal(bound.strategy, "session-affinity");
});

test("flow keeps execution outside a real decision", () => {
  const flow = globalThis.PatternLab.flow({ choice: "strong", confidence: 0.9, probabilities: { strong: 0.9, cheap: 0.1 } }, "Jev real");
  assert.equal(flow.accepted, true);
  assert.match(flow.stages.execution, /No ejecutado/);
});
