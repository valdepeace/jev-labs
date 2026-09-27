import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ClassificationResult } from "../src/classify.js";

type Row = ClassificationResult & { source: string; tags?: string[]; textLength: number };
const esc = (value: string | number) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const mean = (rows: readonly Row[]) => rows.length ? rows.reduce((total, row) => total + row.latencyMs, 0) / rows.length : 0;

function table(title: string, rows: readonly Row[]): string {
  const counts = new Map<string, number>();
  for (const row of rows) if (!row.error && row.modelChoice) counts.set(row.modelChoice, (counts.get(row.modelChoice) ?? 0) + 1);
  return `<section><h2>${esc(title)}</h2><table><thead><tr><th>Modelo elegido</th><th>Casos</th></tr></thead><tbody>${[...counts].sort().map(([model, count]) => `<tr><td>${esc(model)}</td><td>${count}</td></tr>`).join("")}</tbody></table></section>`;
}

export function renderReport(jev: readonly Row[], laya: readonly Row[]): string {
  const layaById = new Map(laya.map((row) => [row.questionId, row]));
  const pairs = jev.map((row) => [row, layaById.get(row.questionId)] as const).filter((pair): pair is [Row, Row] => pair[1] !== undefined);
  const modelAgreement = pairs.filter(([left, right]) => left.modelChoice === right.modelChoice).length;
  const reasoningAgreement = pairs.filter(([left, right]) => left.reasoningEffort === right.reasoningEffort).length;
  const card = (label: string, value: string | number) => `<article><small>${esc(label)}</small><strong>${esc(value)}</strong></article>`;
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jev vs Laya</title><style>body{font:16px system-ui;margin:2rem auto;max-width:1000px;color:#172033}h1{margin-bottom:.2rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem;margin:1.5rem 0}article,section{border:1px solid #d8dee9;border-radius:8px;padding:1rem;background:#fff}strong{display:block;font-size:1.5rem}small{color:#596275}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:.5rem;border-bottom:1px solid #e5e9f0}body{background:#f7f9fc}@media print{body{margin:1cm;background:#fff}}</style><h1>Informe: Jev vs Laya local</h1><p>Misma muestra WildChat; Laya usa <code>typed-decisions</code> en localhost.</p><div class="grid">${card("Prompts Jev", jev.length)}${card("Prompts Laya", laya.length)}${card("Pares comparables", pairs.length)}${card("Coincidencia modelo", `${modelAgreement}/${pairs.length}`)}${card("Coincidencia esfuerzo", `${reasoningAgreement}/${pairs.length}`)}${card("Latencia media Jev", `${mean(jev).toFixed(0)} ms`)}${card("Latencia media Laya", `${mean(laya).toFixed(0)} ms`)}</div>${table("Distribución Jev", jev)}${table("Distribución Laya", laya)}</html>`;
}

async function main(): Promise<void> {
  const [jevPath, layaPath, outputPath = "results/report.html", ...extra] = process.argv.slice(2);
  if (!jevPath || !layaPath || extra.length) throw new Error("usage: report <jev.jsonl> <laya.jsonl> [report.html]");
  const parse = async (path: string) => (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Row);
  await writeFile(outputPath, renderReport(await parse(jevPath), await parse(layaPath)));
  console.log(resolve(outputPath));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
