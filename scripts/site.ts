/**
 * Genera `dist/site/` a partir de las fuentes de `site/` y de los JSONL
 * versionados en `pocs/<slug>/results/`. Nada de lo generado se commitea.
 */
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildComparisonHtml, buildRouterHtml, loadSampleQuestions } from "./report.js";
import { POCS, assetPath, type PocSite, type SitePage } from "./pocs.js";

export const SITE_OUT_DIR = "dist/site";

const ATTRIBUTION = 'Contains information from WildChat-1M (<a href="https://huggingface.co/datasets/allenai/WildChat-1M">allenai/WildChat-1M</a>), which is made available under the <a href="https://opendatacommons.org/licenses/by/1-0/">ODC Attribution License</a>.';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!);
}

/** Pie común: enlace de vuelta al hub y aviso ODC-BY. */
export function siteFooter(depth: number): string {
  const home = depth === 0 ? "index.html" : `${"../".repeat(depth)}index.html`;
  return `<footer style="margin:2rem auto;max-width:1120px;padding:0 1.25rem;font:14px/1.5 system-ui,sans-serif;color:#647084">` +
    `<p><a href="${home}">← Volver al índice de POCs</a></p><p>${ATTRIBUTION}</p></footer>`;
}

/** Inserta el pie antes de `</body>` (o lo añade al final si no existe). */
export function withFooter(html: string, depth: number): string {
  const footer = siteFooter(depth);
  return html.includes("</body>") ? html.replace("</body>", `${footer}</body>`) : `${html}${footer}`;
}

export function cardHtml(poc: PocSite, pages: readonly SitePage[]): string {
  const links = pages.length
    ? `<ul>${pages.map((page) => `<li><a href="${assetPath(poc.slug, page.file)}">${escapeHtml(page.title)}</a></li>`).join("")}</ul>`
    : `<ul><li><a href="${assetPath(poc.slug, "lab.html")}">Laboratorio offline</a></li></ul>`;
  return `<article class="card"><p class="meta">${escapeHtml(poc.date)} · ${escapeHtml(poc.slug)}</p><h2>${escapeHtml(poc.title)}</h2>` +
    `<p class="question">${escapeHtml(poc.question)}</p><p class="summary">${escapeHtml(poc.summary)}</p>${links}</article>`;
}

export function hubHtml(template: string, pocs: readonly PocSite[]): string {
  const cards = `<div class="cards">${pocs.map((poc) => cardHtml(poc, poc.pages ?? [])).join("")}</div>`;
  return template.includes("<!-- pocs -->") ? template.replace("<!-- pocs -->", cards) : template.replace("</main>", `${cards}</main>`);
}

async function writePage(outDir: string, slug: string, file: string, html: string): Promise<string> {
  const target = join(outDir, slug, file);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, withFooter(html, 1));
  return target;
}

export async function buildSite(outDir = SITE_OUT_DIR): Promise<string[]> {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const written: string[] = [];
  for (const poc of POCS) {
    for (const asset of poc.assets ?? []) {
      const target = join(outDir, poc.slug, asset.file);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(asset.source, target);
      await writeFile(target, withFooter(await readFile(target, "utf8"), 1));
      written.push(target);
    }
    for (const page of poc.pages ?? []) {
      const questions = poc.questions ? await loadSampleQuestions(poc.questions) : [];
      const html = page.router
        ? await buildRouterHtml(page.router)
        : page.comparison
          ? await buildComparisonHtml(page.comparison.jev, page.comparison.laya, page.comparison.candidates ?? [], questions)
          : undefined;
      if (html === undefined) throw new Error(`${poc.slug}/${page.file} has neither comparison nor router inputs`);
      written.push(await writePage(outDir, poc.slug, page.file, html));
    }
  }
  await copyFile("site/style.css", join(outDir, "style.css"));
  // El hub trae su propio pie con la atribución en `site/index.html`.
  const hub = hubHtml(await readFile("site/index.html", "utf8"), POCS);
  await writeFile(join(outDir, "index.html"), hub);
  written.push(join(outDir, "index.html"), join(outDir, "style.css"));
  return written;
}

async function main(): Promise<void> {
  const [first] = process.argv.slice(2);
  const written = await buildSite(first ?? SITE_OUT_DIR);
  for (const path of written) console.log(resolve(path));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
