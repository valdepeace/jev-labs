import assert from "node:assert/strict";
import test from "node:test";

import { scanText } from "./audit-secrets.js";

/**
 * La clave falsa se monta por trozos a proposito: si el literal completo
 * viviera en el repo, `git log -p | grep 'sk-or-v1-[0-9a-f]{16,}'` dejaria de
 * ser una alarma util para detectar una clave real filtrada.
 */
const FAKE_KEY = ["sk-or", "v1", "0123456789abcdef0123456789abcdef"].join("-");

test("scanText flags a pasted OpenRouter key and an env assignment with value", () => {
  assert.equal(scanText("a.ts", `const k = "${FAKE_KEY}";`).length, 1);
  assert.equal(scanText(".env.example", `OPENROUTER_API_KEY=${FAKE_KEY}`).length, 2);
});

test("scanText ignores empty assignments, placeholders and env files without value", () => {
  assert.deepEqual(scanText(".env.example", "OPENROUTER_API_KEY="), []);
  assert.deepEqual(scanText("README.md", "OPENROUTER_API_KEY=<tu-clave>"), []);
  assert.deepEqual(scanText("README.md", "OPENROUTER_API_KEY=sk-or-..."), []);
  assert.deepEqual(scanText("x.md", "no secrets here"), []);
});

test("scanText reports the offending line number", () => {
  const findings = scanText("f.md", `primera\n${FAKE_KEY}\n`);
  assert.deepEqual(findings, [{ path: "f.md", line: 2, label: "OpenRouter key" }]);
});

test("scanText skips binary content", () => {
  assert.deepEqual(scanText("img.png", `\u0000${FAKE_KEY}`), []);
});
