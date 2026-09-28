import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { POCS, assetPath } from "./pocs.js";
import { buildSite, hubHtml, siteFooter, withFooter } from "./site.js";

test("every POC has a stable kebab-case slug and one page per report", () => {
  for (const poc of POCS) {
    assert.match(poc.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${poc.slug} is not a kebab-case slug`);
    assert.ok(poc.question.trim(), `${poc.slug} needs a question`);
    assert.ok((poc.pages?.length ?? 0) + (poc.assets?.length ?? 0) > 0, `${poc.slug} has no content`);
  }
  assert.equal(new Set(POCS.map((poc) => poc.slug)).size, POCS.length, "duplicate POC slug");
});

test("assetPath keeps artifacts inside the slug directory of the site", () => {
  assert.equal(assetPath("jev-kev-laya", "report.html"), "jev-kev-laya/report.html");
});

test("hubHtml injects one card per POC into the template", () => {
  const html = hubHtml("<main><!-- pocs --></main>", POCS);
  assert.equal((html.match(/class="card"/g) ?? []).length, POCS.length);
  assert.match(html, /jev-kev-laya\/report\.html/);
  assert.doesNotMatch(html, /<!-- pocs -->/);
});

test("hubHtml escapes POC text instead of injecting markup", () => {
  const html = hubHtml("<main><!-- pocs --></main>", [{ slug: "x", title: "<script>", question: "a & b", date: "2026-01-01", summary: "s" }]);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /a &amp; b/);
});

test("the footer carries the ODC-BY attribution and a link back to the hub", () => {
  assert.match(siteFooter(0), /Volver al índice de POCs/);
  assert.match(siteFooter(0), /href="index\.html"/);
  assert.match(siteFooter(1), /href="\.\.\/index\.html"/);
  assert.match(siteFooter(1), /ODC Attribution License/);
  const page = withFooter("<p>x</p></body>", 1);
  assert.ok(page.indexOf("ODC Attribution License") < page.indexOf("</body>"));
  assert.match(withFooter("<p>x</p>", 0), /ODC Attribution License/);
});

test("buildSite writes the hub, styles and one directory per POC", async () => {
  const outDir = "dist/site-test";
  try {
    const written = await buildSite(outDir);
    assert.ok(written.some((path) => path.endsWith("index.html")));
    assert.ok(written.some((path) => path.endsWith("style.css")));
    for (const poc of POCS) {
      for (const page of poc.pages ?? []) assert.ok(written.some((path) => path.endsWith(join(poc.slug, page.file))), `${poc.slug}/${page.file} missing`);
      for (const asset of poc.assets ?? []) assert.ok(written.some((path) => path.endsWith(join(poc.slug, asset.file))), `${poc.slug}/${asset.file} missing`);
    }
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
