import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ClassificationResult } from "../src/classify.js";
import { loadQuestions, type Question } from "../src/dataset.js";
import { resolveOutDir } from "./paths.js";

export type ReportRow = ClassificationResult & { source: string; tags?: string[]; textLength: number };
type Row = ReportRow;
type Candidate = { name: string; pool: "wide" | "tiers"; rows: readonly Row[] };
const esc = (value: string | number) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const success = (row: Row) => !row.error;
const average = (rows: readonly Row[]) => rows.length ? rows.reduce((sum, row) => sum + row.latencyMs, 0) / rows.length : 0;
const percentile = (values: readonly number[], fraction: number) => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)] : 0;
const JEV_COLOR = "#6366f1";
const LAYA_COLOR = "#f59e0b";
const KEV_COLOR = "#10b981";

function countBy(rows: readonly Row[], field: "modelChoice" | "reasoningEffort"): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = row[field];
    if (success(row) && value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function comparisonChart(
  labels: readonly string[],
  left: ReadonlyMap<string, number>,
  right: ReadonlyMap<string, number>,
  ariaLabel: string,
  width = 520,
  third?: { label: string; counts: ReadonlyMap<string, number>; color: string },
): string {
  const labelWidth = 190;
  const barWidth = width - labelWidth - 48;
  const rowHeight = third ? 50 : 38;
  const max = Math.max(1, ...labels.flatMap((label) => [left.get(label) ?? 0, right.get(label) ?? 0, third?.counts.get(label) ?? 0]));
  const bars = (count: number, y: number, color: string) => count === 0 ? "" :
    `<rect x="${labelWidth}" y="${y}" width="${(count / max) * barWidth}" height="11" rx="4" fill="${color}"/><text x="${labelWidth + (count / max) * barWidth + 5}" y="${y + 10}" font-size="11">${count}</text>`;
  const content = labels.map((label, index) => {
    const y = 29 + index * rowHeight;
    return `<text x="0" y="${y + 9}" font-size="11">${esc(label)}</text>${bars(left.get(label) ?? 0, y, JEV_COLOR)}${bars(right.get(label) ?? 0, y + 13, LAYA_COLOR)}${third ? bars(third.counts.get(label) ?? 0, y + 26, third.color) : ""}`;
  }).join("");
  const height = Math.max(75, labels.length * rowHeight + 40);
  const thirdLegend = third ? `<rect x="${labelWidth + 130}" y="5" width="10" height="10" rx="3" fill="${third.color}"/><text x="${labelWidth + 145}" y="14" font-size="11">${esc(third.label)}</text>` : "";
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(ariaLabel)}"><rect x="${labelWidth}" y="5" width="10" height="10" rx="3" fill="${JEV_COLOR}"/><text x="${labelWidth + 15}" y="14" font-size="11">Jev</text><rect x="${labelWidth + 65}" y="5" width="10" height="10" rx="3" fill="${LAYA_COLOR}"/><text x="${labelWidth + 80}" y="14" font-size="11">Laya</text>${thirdLegend}${content}</svg>`;
}

export function modelChart(jev: readonly Row[], laya: readonly Row[], kev: readonly Row[] = []): string {
  const jevCounts = countBy(jev, "modelChoice");
  const layaCounts = countBy(laya, "modelChoice");
  const kevCounts = countBy(kev, "modelChoice");
  const models = [...new Set([...jevCounts.keys(), ...layaCounts.keys(), ...kevCounts.keys()])].sort();
  return comparisonChart(models, jevCounts, layaCounts, "Distribución de modelos elegidos", 680, kev.length ? { label: "Kev 4B", counts: kevCounts, color: KEV_COLOR } : undefined);
}

function confidenceChart(jev: readonly Row[], laya: readonly Row[], kev: readonly Row[] = []): string {
  const counts = (rows: readonly Row[]) => {
    const values = rows.filter((row) => success(row) && typeof row.modelConfidence === "number" && Number.isFinite(row.modelConfidence));
    return new Map([
      ["< 0,5 · bajo el corte", values.filter((row) => row.modelConfidence! < 0.5).length],
      ["≥ 0,5 · en o sobre el corte", values.filter((row) => row.modelConfidence! >= 0.5).length],
    ]);
  };
  const jevCounts = counts(jev);
  const layaCounts = counts(laya);
  const kevCounts = counts(kev);
  const totals = (counts: ReadonlyMap<string, number>) => [...counts.values()].reduce((sum, count) => sum + count, 0);
  const summary = `Jev ${totals(jevCounts)}/${jev.length}; Laya ${totals(layaCounts)}/${laya.length}${kev.length ? `; Kev 4B ${totals(kevCounts)}/${kev.length}` : ""}.`;
  return `<p class="hint">Clasificaciones válidas con confianza de modelo: ${summary}</p>${comparisonChart([...jevCounts.keys()], jevCounts, layaCounts, "Respuestas por debajo o por encima del corte de confianza 0,5", 520, kev.length ? { label: "Kev 4B", counts: kevCounts, color: KEV_COLOR } : undefined)}`;
}

function distributionTable(title: string, rows: readonly Row[]): string {
  const counts = countBy(rows, "modelChoice");
  return `<section><h2>${esc(title)}</h2><table><thead><tr><th>Modelo elegido</th><th>Casos</th><th>% de éxitos</th></tr></thead><tbody>${[...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([model, count]) => `<tr><td>${esc(model)}</td><td>${count}</td><td>${(count / Math.max(1, rows.filter(success).length) * 100).toFixed(1)}%</td></tr>`).join("") || '<tr><td colspan="3">Sin clasificaciones válidas</td></tr>'}</tbody></table></section>`;
}

function latencyTable(jev: readonly Row[], laya: readonly Row[], kev: readonly Row[] = []): string {
  const stats = (rows: readonly Row[]) => {
    const values = rows.map((row) => row.latencyMs);
    return [average(rows), percentile(values, 0.5), percentile(values, 0.95)];
  };
  const rows = [["Jev", ...stats(jev)], ["Laya", ...stats(laya)], ...(kev.length ? [["Kev 4B", ...stats(kev)]] : [])];
  return `<section><h2>Latencia por solicitud</h2><p class="hint">Incluye solicitudes fallidas; los percentiles muestran mejor la cola que la media.</p><table><thead><tr><th>Clasificador</th><th>Media</th><th>Mediana</th><th>p95</th></tr></thead><tbody>${rows.map(([name, mean, median, p95]) => `<tr><th>${name}</th><td>${Number(mean).toFixed(0)} ms</td><td>${Number(median).toFixed(0)} ms</td><td>${Number(p95).toFixed(0)} ms</td></tr>`).join("")}</tbody></table></section>`;
}

function candidateResults(candidates: readonly Candidate[], jev: readonly Row[], laya: readonly Row[]): string {
  if (!candidates.length) return "";
  const stats = (rows: readonly Row[], baseline: readonly Row[]) => {
    const valid = rows.filter(success);
    const latencies = valid.map((row) => row.latencyMs);
    const baseById = new Map(baseline.map((row) => [row.questionId, row]));
    const pairs = valid.map((row) => [row, baseById.get(row.questionId)] as const).filter((pair): pair is [Row, Row] => pair[1] !== undefined && success(pair[1]) && Boolean(pair[0].modelChoice && pair[1].modelChoice));
    const agreements = pairs.filter(([left, right]) => left.modelChoice === right.modelChoice).length;
    const confidences = valid.filter((row) => typeof row.modelConfidence === "number" && Number.isFinite(row.modelConfidence));
    return { valid, mean: average(valid), median: percentile(latencies, 0.5), agreements: `${agreements}/${pairs.length}`, lowConfidence: confidences.length ? `${confidences.filter((row) => row.modelConfidence! < 0.5).length}/${confidences.length}` : "No devuelta" };
  };
  const questionCounts = [...new Set(candidates.map(({ rows }) => rows.length))].join(" / ");
  const poolLabel = candidates.every(({ pool }) => pool === "tiers") ? "pool tiers de 9 opciones" : "pool general de 16 opciones";
  return `<section><h2>Kev 4B · prueba de decisión</h2><p class="hint">${questionCounts} preguntas con el ${poolLabel}. El acuerdo mide coincidencia con Jev/Laya, no exactitud.</p><table><thead><tr><th>Modelo</th><th>Válidas / fallidas</th><th>Latencia media / mediana</th><th>Acuerdo de elección vs Jev</th><th>vs Laya</th><th>Confianza &lt; 0,5</th><th>Tokens entrada · coste</th></tr></thead><tbody>${candidates.map(({ name, rows }) => { const valid = rows.filter(success); const withJev = stats(rows, jev); const withLaya = stats(rows, laya); const latencies = valid.map((row) => row.latencyMs); const confidence = stats(rows, []); const usage = valid.flatMap((row) => row.usage ? [row.usage] : []); const inputTokens = usage.reduce((sum, item) => sum + item.inputTokens, 0); const cost = usage.reduce((sum, item) => sum + (item.cost ?? 0), 0); return `<tr><th>${esc(name)}</th><td>${valid.length} / ${rows.length - valid.length}</td><td>${Math.round(average(valid))} / ${Math.round(percentile(latencies, 0.5))} ms</td><td>${withJev.agreements}</td><td>${withLaya.agreements}</td><td>${confidence.lowConfidence}</td><td>${usage.length ? `${inputTokens.toLocaleString("es-ES")} · $${cost.toFixed(6)}` : "No registrado"}</td></tr>`; }).join("")}</tbody></table>${candidates.map(({ name, rows }) => { const counts = countBy(rows, "modelChoice"); return `<details><summary>Elecciones de ${esc(name)}</summary><p>${[...counts].sort((a, b) => b[1] - a[1]).map(([model, count]) => `${esc(model)}: ${count}`).join(" · ") || "Sin elecciones válidas"}</p></details>`; }).join("")}</section>`;
}

function modelCatalog(): string {
  return `<section><h2>Modelos de decisión comparados</h2><table><thead><tr><th>Modelo</th><th>Precio publicado</th><th>Contexto</th><th>Evaluación</th></tr></thead><tbody><tr><th><a href="https://openrouter.ai/typesafe/jev-1.13" target="_blank" rel="noreferrer">Jev 1.13</a></th><td>$0.042/M entrada · salida gratis</td><td>32K</td><td>Pool de referencia</td></tr><tr><th><a href="https://openrouter.ai/jaredpalmer/kev-4b" target="_blank" rel="noreferrer">Kev 4B</a></th><td>$0.042/M entrada · salida gratis</td><td>8K</td><td>Prueba System One, resultados arriba</td></tr></tbody></table><p class="hint">Precios y límites según las fichas de OpenRouter; pueden cambiar.</p></section>`;
}

function routerSection(candidates: readonly Candidate[]): string {
  if (!candidates.length) return "";
  const rows = candidates.flatMap((candidate) => candidate.rows);
  const valid = rows.filter(success);
  const latency = valid.map((row) => row.latencyMs);
  const choices = countBy(rows, "modelChoice");
  return `<section><h2>Jev Router · prueba generativa exploratoria</h2><p>Jev Router se usa mediante Chat Completions: selecciona modelo/esfuerzo para la conversación y devuelve texto. No ofrece el contrato de decisión tipada de Jev 1.13; por eso esta prueba con una instrucción para producir JSON <strong>no se incluye en las comparativas ni métricas de decisión</strong>.</p><p class="hint">${valid.length}/${rows.length} respuestas del piloto se pudieron interpretar como JSON; latencia media ${Math.round(average(valid))} ms, mediana ${Math.round(percentile(latency, 0.5))} ms. Esto mide obediencia al formato solicitado, no calidad de routing ni exactitud de clasificación.</p><details><summary>Elecciones escritas en el JSON exploratorio</summary><p>${[...choices].sort((a, b) => b[1] - a[1]).map(([model, count]) => `${esc(model)}: ${count}`).join(" · ") || "Sin elecciones válidas"}</p></details><p class="hint">Una evaluación adecuada debería medir respuestas generadas (por ejemplo, código ejecutado contra tests y seguimientos multi-turno), además de latencia, disponibilidad y uso. <a href="https://openrouter.ai/typesafe/jev-router" target="_blank" rel="noreferrer">Ficha de Jev Router en OpenRouter</a>.</p></section>`;
}

export function renderRouterReport(rows: readonly Row[]): string {
  const valid = rows.filter(success);
  const latency = valid.map((row) => row.latencyMs);
  const choices = [...countBy(rows, "modelChoice")].sort((left, right) => right[1] - left[1]);
  const failures = rows.filter((row) => row.error);
  const errors = new Map<string, number>();
  for (const row of failures) errors.set(row.error!, (errors.get(row.error!) ?? 0) + 1);
  const table = (entries: readonly [string, number][], empty: string) => entries.length
    ? entries.map(([label, count]) => `<tr><td>${esc(label)}</td><td>${count}</td></tr>`).join("")
    : `<tr><td colspan="2">${empty}</td></tr>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jev Router · informe del piloto</title><style>body{font:15px/1.55 system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;background:#f3f6fb;color:#172033}section,.grid article{background:#fff;border:1px solid #dce3ee;border-radius:12px;padding:1rem;margin:1rem 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.75rem}.grid article{margin:0}.grid small{display:block;color:#647084}.grid strong{font-size:1.7rem}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:.6rem;border-bottom:1px solid #e9edf4}code{overflow-wrap:anywhere}</style></head><body><h1>Jev Router · informe del piloto</h1><p>Solo resultados del endpoint <code>typesafe/jev-router</code> vía OpenRouter. No se compara con Jev, Laya ni Kev.</p><div class="grid"><article><small>Solicitudes únicas</small><strong>${rows.length}</strong></article><article><small>JSON parseable</small><strong>${valid.length}/${rows.length}</strong></article><article><small>Latencia media</small><strong>${Math.round(average(valid))} ms</strong></article><article><small>Mediana</small><strong>${Math.round(percentile(latency, 0.5))} ms</strong></article></div><section><h2>Qué demuestra</h2><p>El router produjo una elección escrita de modelo y esfuerzo para este prompt exploratorio. No demuestra que ese routing sea correcto, ni mide la respuesta generada por el modelo seleccionado, su coste o una sesión multi-turno.</p></section><section><h2>Elecciones escritas</h2><table><thead><tr><th>Modelo</th><th>Casos</th></tr></thead><tbody>${table(choices, "Sin respuestas parseables")}</tbody></table></section><section><h2>Fallos conservados</h2><table><thead><tr><th>Error</th><th>Casos</th></tr></thead><tbody>${table([...errors], "Ninguno")}</tbody></table></section><p>Fuente del producto: <a href="https://openrouter.ai/typesafe/jev-router">OpenRouter · Jev Router</a>. Informe generado desde los JSONL locales del piloto.</p></body></html>`;
}

export function renderReport(jev: readonly Row[], laya: readonly Row[], questions: readonly Question[] = [], candidates: readonly Candidate[] = []): string {
  const layaById = new Map(laya.map((row) => [row.questionId, row]));
  const pairs = jev.map((row) => [row, layaById.get(row.questionId)] as const).filter((pair): pair is [Row, Row] => pair[1] !== undefined);
  const modelPairs = pairs.filter(([left, right]) => success(left) && success(right) && left.modelChoice && right.modelChoice);
  const effortPairs = pairs.filter(([left, right]) => success(left) && success(right) && left.reasoningEffort && right.reasoningEffort);
  const modelAgreement = modelPairs.filter(([left, right]) => left.modelChoice === right.modelChoice).length;
  const effortAgreement = effortPairs.filter(([left, right]) => left.reasoningEffort === right.reasoningEffort).length;
  const agreement = (left: readonly Row[], right: readonly Row[]) => {
    const rightById = new Map(right.map((row) => [row.questionId, row]));
    const paired = left.map((row) => [row, rightById.get(row.questionId)] as const).filter((pair): pair is [Row, Row] => pair[1] !== undefined && success(pair[0]) && success(pair[1]));
    const models = paired.filter(([leftRow, rightRow]) => leftRow.modelChoice && rightRow.modelChoice);
    const efforts = paired.filter(([leftRow, rightRow]) => leftRow.reasoningEffort && rightRow.reasoningEffort);
    return { models, efforts, modelSame: models.filter(([leftRow, rightRow]) => leftRow.modelChoice === rightRow.modelChoice).length, effortSame: efforts.filter(([leftRow, rightRow]) => leftRow.reasoningEffort === rightRow.reasoningEffort).length };
  };
  const reasoning = (rows: readonly Row[]) => {
    const counts = countBy(rows, "reasoningEffort");
    return counts;
  };
  const outcomes = (rows: readonly Row[]) => new Map<string, number>([["Correctas", rows.filter(success).length], ["Fallidas", rows.filter((row) => !success(row)).length]]);
  const card = (label: string, value: string | number, note = "") => `<article><small>${esc(label)}</small><strong>${esc(value)}</strong>${note ? `<span>${esc(note)}</span>` : ""}</article>`;
  const rate = (same: number, total: number) => `${total ? (same / total * 100).toFixed(1) : "0.0"}%`;
  const kev = candidates.find(({ name }) => name === "Kev 4B");
  const kevJev = kev ? agreement(kev.rows, jev) : undefined;
  const kevLaya = kev ? agreement(kev.rows, laya) : undefined;
  const reportTitle = kev ? `Jev vs Laya + Kev 4B · ${kev.pool === "tiers" ? "tiers" : "pool general"} · ${kev.rows.length} preguntas` : "Jev vs Laya";
  const questionJson = JSON.stringify(questions).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(reportTitle)} · Informe comparativo</title>
<style>
:root{color-scheme:light;--ink:#172033;--muted:#647084;--line:#dce3ee;--panel:#fff;--bg:#f3f6fb;--jev:${JEV_COLOR};--laya:${LAYA_COLOR};--kev:${KEV_COLOR} }
*{box-sizing:border-box}body{font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;margin:0;background:var(--bg);color:var(--ink)}main{max-width:1120px;margin:auto;padding:2rem 1.25rem 4rem}h1{font-size:clamp(2rem,4vw,3rem);letter-spacing:-.04em;margin:0}h2{font-size:1.15rem;margin:0 0 1rem}header{padding:1rem 0 1.5rem}header p,.hint{color:var(--muted)}header p{margin:.4rem 0}section,.hero{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:1.25rem;margin:1rem 0;box-shadow:0 3px 12px #22335508}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:.8rem;margin:1rem 0}.grid article{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:1rem}.grid small,.grid span{display:block;color:var(--muted)}.grid strong{font-size:1.8rem;letter-spacing:-.03em}.grid span{font-size:.78rem}svg{display:block;width:100%;height:auto;overflow:visible}svg text{fill:var(--ink);font-family:inherit}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:.65rem .5rem;border-bottom:1px solid #e9edf4}thead th{color:var(--muted);font-size:.8rem}tbody tr:last-child>*{border-bottom:0}.legend{color:var(--muted)}.dot{display:inline-block;width:.65rem;height:.65rem;border-radius:50%;margin:0 .25rem 0 .8rem}.dot:first-child{margin-left:0}.dot.jev{background:var(--jev)}.dot.laya{background:var(--laya)}.dot.kev{background:var(--kev)}.columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:1rem}#question-select{display:block;max-width:100%;margin:.5rem 0;padding:.6rem;border:1px solid var(--line);border-radius:8px;background:#fff;font:inherit}pre.question-text{white-space:pre-wrap;overflow-wrap:anywhere;background:#f7f9fc;padding:1rem;border-radius:8px}@media print{body{background:white}main{max-width:none;padding:0}.grid article,section{box-shadow:none;break-inside:avoid}}
</style></head><body><main><header><h1>${esc(reportTitle)}</h1><p>Comparativa de las mismas preguntas de WildChat. Las decisiones se emparejan por ID.</p><p class="legend"><i class="dot jev"></i> Jev vía OpenRouter <i class="dot laya"></i> Laya local${kev ? " · " : ""}${kev ? '<i class="dot kev"></i> Kev 4B vía OpenRouter' : ""}</p></header>
<div class="grid">${card("Preguntas Jev", jev.length)}${card("Preguntas Laya", laya.length)}${kev ? card("Preguntas Kev 4B", kev.rows.length) : ""}${card("IDs emparejados Jev/Laya", pairs.length)}${card("Éxito Jev", `${jev.filter(success).length}/${jev.length}`)}${card("Éxito Laya", `${laya.filter(success).length}/${laya.length}`)}${kev ? card("Éxito Kev 4B", `${kev.rows.filter(success).length}/${kev.rows.length}`) : ""}</div>
<section><h2>Modelos elegidos</h2><p class="hint">Conteo por modelo; cada clasificador escala de forma independiente.</p>${modelChart(jev, laya, kev?.rows)}</section>
<div class="columns"><section><h2>Esfuerzo de razonamiento</h2>${comparisonChart(["low", "medium", "high"], reasoning(jev), reasoning(laya), "Distribución de esfuerzo de razonamiento", 520, kev ? { label: "Kev 4B", counts: reasoning(kev.rows), color: KEV_COLOR } : undefined)}</section><section><h2>Resultado de clasificación</h2>${comparisonChart(["Correctas", "Fallidas"], outcomes(jev), outcomes(laya), "Éxitos y fallos por clasificador", 520, kev ? { label: "Kev 4B", counts: outcomes(kev.rows), color: KEV_COLOR } : undefined)}</section></div>
<section><h2>Confianza en la elección del modelo</h2><p class="hint">El corte de 0,5 se usa aquí para resumir resultados, no es un umbral validado para producción.</p>${confidenceChart(jev, laya, kev?.rows)}<details><summary>¿Qué significa “confianza”?</summary><p>En Jev y Kev, para una pregunta de tipo <code>choice</code>, la confianza resume la forma de la distribución de probabilidades entre las opciones. No significa “probabilidad de que el modelo elegido sea correcto”; para eso haría falta contrastar las elecciones con etiquetas de verdad. (<a href="https://openrouter.ai/blog/tutorials/how-to-use-jev/" target="_blank" rel="noreferrer">Definición de confianza de Jev</a>.)</p><p>Por tanto, <code>&lt; 0,5</code> solo indica que la confianza devuelta quedó por debajo del corte exploratorio elegido para este informe; no significa un 50% de probabilidad de error. Tampoco asumimos que las escalas de Jev, Kev y Laya estén calibradas igual. El corte debería validarse por backend con datos etiquetados y según el coste de equivocarse.</p></details></section>
<section><h2>Acuerdo en las preguntas compartidas</h2><p>Los fallos y los resultados ausentes quedan fuera del denominador de cada medida. Mide coincidencia, no exactitud.</p><table><thead><tr><th>Comparación</th><th>Coincidencia modelo</th><th>Coincidencia esfuerzo</th></tr></thead><tbody><tr><th>Jev vs Laya</th><td>${modelAgreement}/${modelPairs.length} · ${rate(modelAgreement, modelPairs.length)}</td><td>${effortAgreement}/${effortPairs.length} · ${rate(effortAgreement, effortPairs.length)}</td></tr>${kev && kevJev && kevLaya ? `<tr><th>Kev 4B vs Jev</th><td>${kevJev.modelSame}/${kevJev.models.length} · ${rate(kevJev.modelSame, kevJev.models.length)}</td><td>${kevJev.effortSame}/${kevJev.efforts.length} · ${rate(kevJev.effortSame, kevJev.efforts.length)}</td></tr><tr><th>Kev 4B vs Laya</th><td>${kevLaya.modelSame}/${kevLaya.models.length} · ${rate(kevLaya.modelSame, kevLaya.models.length)}</td><td>${kevLaya.effortSame}/${kevLaya.efforts.length} · ${rate(kevLaya.effortSame, kevLaya.efforts.length)}</td></tr>` : ""}</tbody></table></section>
${candidateResults(candidates.filter(({ name }) => name === "Kev 4B"), jev, laya)}
${modelCatalog()}
${routerSection(candidates.filter(({ name }) => name === "Jev Router"))}
<section><h2>Preguntas de la muestra</h2><p class="hint">Dataset incluido al generar este informe desde <code>data/questions.jsonl</code>.</p><label for="question-select">Pregunta<select id="question-select"${questions.length ? "" : " disabled"}><option>Preparando preguntas…</option></select></label><p id="dataset-status" class="hint" role="status"></p><p id="question-meta" class="hint"></p><pre id="question-text" class="question-text">Elige una pregunta para ver el prompt completo.</pre></section>
${latencyTable(jev, laya, kev?.rows)}<div class="columns">${distributionTable("Distribución de modelos · Jev", jev)}${distributionTable("Distribución de modelos · Laya", laya)}${kev ? distributionTable("Distribución de modelos · Kev 4B", kev.rows) : ""}</div>
<footer class="hint">Informe generado a partir de los JSONL de resultados. No se recalculan ni imputan clasificaciones fallidas.</footer></main><script type="application/json" id="question-data">${questionJson}</script><script>
const questionSelect = document.getElementById("question-select");
const datasetStatus = document.getElementById("dataset-status");
const questionMeta = document.getElementById("question-meta");
const questionText = document.getElementById("question-text");
const questions = JSON.parse(document.getElementById("question-data").textContent);
function showQuestion() {
  const question = questions[Number(questionSelect.value)];
  if (!question) return;
  const tags = Array.isArray(question.tags) ? question.tags.filter((tag) => typeof tag === "string").join(", ") : "";
  questionMeta.textContent = [question.id, question.source, tags].filter(Boolean).join(" · ");
  questionText.textContent = question.text;
}
questionSelect.replaceChildren();
questions.forEach((question, index) => {
  const option = document.createElement("option");
  option.value = String(index);
  option.textContent = question.id + " · " + question.source;
  questionSelect.append(option);
});
datasetStatus.textContent = questions.length + " preguntas incluidas.";
questionSelect.addEventListener("change", showQuestion);
if (questions.length) {
  questionSelect.value = "0";
  showQuestion();
} else {
  const emptyOption = document.createElement("option");
  emptyOption.textContent = "No hay preguntas";
  questionSelect.replaceChildren(emptyOption);
  datasetStatus.textContent = "El informe no incluye un dataset de preguntas.";
}
</script></body></html>`;
}

export async function parseRows(path: string): Promise<Row[]> {
  return (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Row);
}

/**
 * Muestra de preguntas pa el selector del informe. En un clon limpio
 * `data/questions.jsonl` no existe (no se publica el dataset), así que la
 * ausencia no es un error: el informe se genera sin el selector.
 */
export async function loadSampleQuestions(path = "data/questions.jsonl"): Promise<Question[]> {
  try {
    return await Array.fromAsync(loadQuestions(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function buildComparisonHtml(jevPath: string, layaPath: string, candidatePaths: readonly string[], questions: readonly Question[] = []): Promise<string> {
  const candidateGroups = new Map<string, { name: string; pool: "wide" | "tiers"; rows: Map<string, Row> }>();
  for (const path of candidatePaths) {
    const name = path.toLowerCase().includes("router") ? "Jev Router" : "Kev 4B";
    const pool = path.toLowerCase().includes("tiers") ? "tiers" : "wide";
    const key = `${name}:${pool}`;
    const group = candidateGroups.get(key) ?? { name, pool, rows: new Map<string, Row>() };
    for (const row of await parseRows(path)) group.rows.set(row.questionId, row);
    candidateGroups.set(key, group);
  }
  const candidates = [...candidateGroups.values()].map(({ name, pool, rows }) => ({ name, pool, rows: [...rows.values()] }));
  return renderReport(await parseRows(jevPath), await parseRows(layaPath), questions, candidates);
}

export async function buildRouterHtml(routerPaths: readonly string[]): Promise<string> {
  const rows = new Map<string, Row>();
  for (const path of routerPaths) for (const row of await parseRows(path)) rows.set(row.questionId, row);
  return renderRouterReport([...rows.values()]);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === "--router") {
    const [outputPath, ...routerPaths] = args.slice(1);
    if (!outputPath || !routerPaths.length) throw new Error("usage: report --router <report.html> <router.jsonl ...>");
    await writeFile(outputPath, await buildRouterHtml(routerPaths));
    console.log(resolve(outputPath));
    return;
  }
  const [jevPath, layaPath, ...rest] = args;
  if (!jevPath || !layaPath) throw new Error("usage: report <jev.jsonl> <laya.jsonl> [report.html] [candidate.jsonl ...] [--out-dir <dir>]");
  const outputPath = rest.find((argument) => argument.endsWith(".html")) ?? join(resolveOutDir(args), "report.html");
  const candidatePaths = rest.filter((argument) => argument.endsWith(".jsonl"));
  await writeFile(outputPath, await buildComparisonHtml(jevPath, layaPath, candidatePaths, await loadSampleQuestions()));
  console.log(resolve(outputPath));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
