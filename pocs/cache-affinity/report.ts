/**
 * Informe HTML de la POC: tablas y gráficos renderizados desde el artefacto
 * versionado en `results/simulation.jsonl`. No recalcula nada, así que cada cifra
 * publicada se puede reproducir volviendo a leer el JSONL.
 */
import type { SimulationArtifact, StrategyComparison, Timeline } from "./scenarios.js";
import { INK, LINE, MUTED, PALETTE, barChart, escapeHtml, lineChart } from "./charts.js";

const usd = (value: number) => `$${value.toFixed(4)}`;
const multiple = (value: number) => `${value.toFixed(2)}×`;
const percent = (value: number) => `${Math.round(value * 100)}%`;
const tokens = (value: number) => value.toLocaleString("es-ES");
const turns = (value: number | null) => (value === null || !Number.isFinite(value) ? "nunca" : String(value));
const policyColor = (policy: string) => ({
  fixed: PALETTE[4], cheapest: PALETTE[0], loadBalanced: PALETTE[5], quality: PALETTE[3], cacheAware: PALETTE[2], warmOrSwitch: PALETTE[1],
}[policy] ?? MUTED);

function card(label: string, value: string, note = ""): string {
  return `<article><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong>${note ? `<span>${escapeHtml(note)}</span>` : ""}</article>`;
}

function section(title: string, hint: string, body: string): string {
  return `<section><h2>${escapeHtml(title)}</h2><p class="hint">${hint}</p>${body}</section>`;
}

/** Tabla de las cinco estrategias en un workload, con su múltiplo frente al modelo fijo. */
function strategyTable(comparison: StrategyComparison): string {
  const rows = comparison.runs
    .slice()
    .sort((left, right) => left.multipleOfFixed - right.multipleOfFixed)
    .map((run) => `<tr><th>${escapeHtml(run.policyName)}</th>` +
      `<td style="color:${policyColor(run.policy)};font-weight:600">${multiple(run.multipleOfFixed)}</td>` +
      `<td>${usd(run.total)}</td><td>${percent(run.cacheHitRatio)}</td><td>${run.switches}</td>` +
      `<td>${usd(run.coldPrefixPenalty)}</td></tr>`).join("");
  return `<table><thead><tr><th>Estrategia</th><th>vs modelo fijo</th><th>Coste</th><th>Acierto de caché</th><th>Cambios</th><th>Penalización de prefijo frío</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/**
 * Timeline: la fila de modelo por turno y el estado de caché (H tibia, M fría).
 * Es lo que hace visible el mecanismo, no solo el total.
 */
function timelineChart(timeline: Timeline): string {
  const cell = 22;
  const labelWidth = 210;
  const rows = timeline.rows.map((row, index) => {
    const x = labelWidth + index * cell;
    const fill = row.warm ? PALETTE[2] : PALETTE[3];
    return `<rect x="${x}" y="0" width="${cell - 3}" height="18" rx="4" fill="${fill}" opacity="${row.warm ? 0.85 : 0.55}"/>` +
      `<text x="${x + (cell - 3) / 2}" y="13" font-size="10" text-anchor="middle" fill="#fff">${row.warm ? "H" : "M"}</text>` +
      `<text x="${x + (cell - 3) / 2}" y="34" font-size="9" text-anchor="middle" fill="${MUTED}">${escapeHtml(row.model.replace(/^(.*?)-.*$/, "$1"))}</text>`;
  }).join("");
  const ticks = timeline.rows.map((row, index) => (index % 5 === 0
    ? `<text x="${labelWidth + index * cell + 9}" y="48" font-size="9" text-anchor="middle" fill="${MUTED}">t${index + 1}</text>`
    : "")).join("");
  const width = labelWidth + timeline.rows.length * cell + 10;
  return `<div class="timeline"><p class="timeline-label">${escapeHtml(timeline.label)}</p>` +
    `<svg viewBox="0 0 ${width} 56" role="img" aria-label="Modelo y estado de caché por turno de ${escapeHtml(timeline.label)}">` +
    `<text x="0" y="13" font-size="11">${escapeHtml(timeline.label)}</text>${rows}${ticks}</svg></div>`;
}

function timelineSection(artifact: SimulationArtifact): string {
  const chosen = artifact.timelines;
  return section(
    "Timeline de sesión: modelo y caché por turno",
    "Cada celda es un turno: <strong>H</strong> encontró caché tibia, <strong>M</strong> pagó el prefijo en frío. Misma dificultad de partida para las tres.",
    chosen.map(timelineChart).join(""),
  );
}

/** Brecha de precios: dónde deja de compensar mantener la caché. */
function priceGapSection(artifact: SimulationArtifact): string {
  const rows = artifact.priceGaps.map((row) => ({
    label: row.midPrice === 1 ? "nivel trivial igual de caro" : `nivel trivial a ${row.midPrice.toFixed(2)}×`,
    value: row.cheapest,
    display: `barato ${multiple(row.cheapest)} · cache-aware ${multiple(row.cacheAware)}`,
    color: row.winner === "cheapest" ? PALETTE[0] : PALETTE[2],
  }));
  const chart = lineChart({
    series: [
      { label: "B · el más barato", color: PALETTE[0], values: artifact.priceGaps.map((row) => row.cheapest) },
      { label: "B' · balanceo", color: PALETTE[5], values: artifact.priceGaps.map((row) => row.loadBalanced) },
      { label: "D · consciente de la caché", color: PALETTE[2], values: artifact.priceGaps.map((row) => row.cacheAware), dashed: true },
    ],
    xLabels: artifact.priceGaps.map((row) => `${row.midPrice.toFixed(2)}×`),
    ariaLabel: "Multiplo de coste frente al modelo fijo segun el precio del nivel trivial",
    yFormat: (value) => `${value.toFixed(2)}×`,
  });
  const crossover = artifact.priceGaps.filter((row) => row.winner !== "cheapest").map((row) => row.midPrice);
  const threshold = crossover.length ? Math.min(...crossover) : undefined;
  return section(
    "El ancho de la brecha de precios decide",
    `Con el nivel intermedio al <strong>mismo precio</strong> que el pico, cambiar de modelo por dificultad no ahorra nada y solo paga reescrituras. ` +
    `Ahí gana el router consciente de la caché. La ventaja se mantiene hasta que el nivel trivial baja de ${threshold === undefined ? "—" : `${threshold.toFixed(2)}×`}` +
    `, y a partir de ahí el más barato por petición se impone en coste.`,
    `<div class="legend"><i style="background:${PALETTE[0]}"></i> B barato <i style="background:${PALETTE[5]}"></i> B' balanceo <i style="background:${PALETTE[2]}"></i> D cache-aware (discontinua)</div>` + chart,
  );
}

function sequenceSection(artifact: SimulationArtifact): string {
  const rows = artifact.sequences.map((row) => `<tr><th>${escapeHtml(row.name)}</th><td><code>${escapeHtml(row.pattern)}</code></td>` +
    `<td>${multiple(row.multipleOfSingle)}</td><td>${percent(row.cacheHitRatio)}</td><td>${row.switches}</td>` +
    `<td>${row.cacheExpirations}</td><td>${usd(row.coldPrefixPenalty)}</td></tr>`).join("");
  return section(
    "Patrones de revisita: el tamaño del pool engaña",
    "Lo que decide no es cuántos modelos hay, sino <strong>si cada linaje se revisita antes de que caduque</strong>. Todos los patrones con revisita dentro de la ventana del TTL salen casi gratis.",
    `<table><thead><tr><th>Patrón</th><th>Secuencia</th><th>vs siempre el mismo</th><th>Acierto</th><th>Cambios</th><th>Caducidades</th><th>Penalización</th></tr></thead><tbody>${rows}</tbody></table>`,
  );
}

function paceSection(artifact: SimulationArtifact): string {
  const chart = barChart(artifact.paces.map((row) => ({
    label: row.secondsPerTurn < 60 ? `${row.secondsPerTurn} s por turno` : `${row.secondsPerTurn / 60} min por turno`,
    value: row.multipleOfSingle,
    display: `${multiple(row.multipleOfSingle)} · acierto ${percent(row.cacheHitRatio)}`,
    color: row.cacheHitRatio === 0 ? PALETTE[3] : PALETTE[2],
  })), "Coste relativo segun el ritmo entre turnos");
  return section(
    "El TTL manda: el mismo patrón a distintos ritmos",
    "Dos modelos alternos, prefijo de 40K, TTL de 5 minutos. Mientras el usuario escribe cada minuto o menos, ambos linajes aguantan tibios. " +
    "Cuando un turno tarda más que el TTL, la tasa de acierto cae a cero de golpe.",
    chart,
  );
}

function prefixSection(artifact: SimulationArtifact): string {
  const chart = barChart(artifact.prefixes.map((row) => ({
    label: `${tokens(row.prefixTokens)} tokens`,
    value: row.multipleOfSingle,
    display: row.cacheable ? `${multiple(row.multipleOfSingle)} · penalización ${usd(row.coldPrefixPenalty)}` : `no cacheable · ${multiple(row.multipleOfSingle)}`,
    color: row.cacheable ? PALETTE[0] : MUTED,
  })), "Coste de alternar modelos frente a quedarse, por tamaño de contexto");
  return section(
    "Cuánto contexto hace falta para que la caché importe",
    "Por debajo del mínimo cacheable del proveedor (~1.024 tokens en este modelo) alternar modelos y quedarse en uno cuestan prácticamente lo mismo. " +
    "A partir de ahí la diferencia crece con el prefijo, sin acantilado: cada cambio extra se paga una vez.",
    chart,
  );
}

function breakEvenSection(artifact: SimulationArtifact): string {
  const anthropic = artifact.breakEven.filter((row) => row.style === "anthropic");
  const rows = anthropic.map((row) => `<tr><th>${row.factor === 1 ? "mismo precio" : `${row.factor.toFixed(1)}× · ${Math.round((1 - row.factor) * 100)}% más barato`}</th>` +
    `<td>${turns(row.turns)}</td><td>${turns(artifact.breakEven.find((item) => item.style === "freeWrite" && item.factor === row.factor)?.turns ?? null)}</td></tr>`).join("");
  return section(
    "¿Cuándo amortiza cambiar de modelo?",
    "Turnos que hay que permanecer en el modelo nuevo para recuperar la reescritura del prefijo. Aproximación de prefijo largo: " +
    "<code>T ≈ (w·f − r) / (r·(1 − f))</code>, con <code>w</code> el multiplicador de escritura, <code>r</code> el de lectura y <code>f</code> el cociente de precios. " +
    "La segunda columna muestra cuánto se acorta cuando el proveedor no cobra la escritura.",
    `<table><thead><tr><th>Modelo nuevo</th><th>Escritura al 1,25× (Anthropic)</th><th>Escritura gratuita (OpenAI, Gemini)</th></tr></thead><tbody>${rows}</tbody></table>`,
  );
}

function poolSection(artifact: SimulationArtifact): string {
  const chart = barChart(artifact.pools.map((row) => ({
    label: `pool de ${row.poolSize} · revisita cada ${row.revisitSeconds} s`,
    value: row.multipleOfSingle,
    display: `${multiple(row.multipleOfSingle)} · acierto ${percent(row.cacheHitRatio)}`,
    color: row.cacheHitRatio === 0 ? PALETTE[3] : PALETTE[0],
  })), "Coste relativo segun el tamano del pool y el tiempo entre revisitas");
  return section(
    "Coste frente al pool, medido en tiempo de revisita",
    `La columna de la izquierda traduce el tamaño del pool a <strong>segundos entre dos visitas al mismo linaje</strong>, que es la variable que de verdad manda: ` +
    `un pool de 16 con turnos de 30 s revisita cada 8 minutos y pierde la caché; un pool de 8 la conserva.`,
    chart,
  );
}

function methodology(artifact: SimulationArtifact): string {
  const { assumptions } = artifact;
  return section(
    "Método, supuestos y límites",
    "Modelo determinista y sin red. Los ratios son los documentados por el proveedor; el precio base solo da escala, y por eso lo que sostiene las conclusiones son las cifras adimensionales.",
    `<table><thead><tr><th>Supuesto</th><th>Valor</th><th>De dónde sale</th></tr></thead><tbody>` +
    `<tr><th>Prefijo estable</th><td>10K–150K tokens</td><td>Orden de magnitud de un system prompt con herramientas, un mapa del repo y el historial.</td></tr>` +
    `<tr><th>Delta por turno</th><td>${assumptions.newInputTokens} / ${assumptions.outputTokens} tokens</td><td>Petición corta de agente con respuesta breve.</td></tr>` +
    `<tr><th>Ritmo</th><td>${assumptions.secondsPerTurn} s por turno</td><td>Equivale al TTL de 5 minutos del proveedor, que es la ventana que decide todo.</td></tr>` +
    `<tr><th>Escritura / lectura</th><td>${assumptions.anthropic.cacheWriteMultiplier}× / ${assumptions.anthropic.cacheReadMultiplier}×</td><td>Multiplicadores documentados (Anthropic 5 min).</td></tr>` +
    `<tr><th>Mínimo cacheable</th><td>${tokens(assumptions.anthropic.cacheMinTokens)} tokens</td><td>Mínimos reales de 512 a 32.768 según proveedor y modelo; se usa un valor representativo.</td></tr>` +
    `<tr><th>Dificultad por turno</th><td>patrón declarado</td><td><strong>Supuesto, no medida.</strong> Sin mezcla de dificultad ningún router por turno cambiaría de modelo y el problema no existiría.</td></tr>` +
    `</tbody></table>` +
    `<p class="hint"><strong>Lo que este informe no mide:</strong> la calidad de la respuesta (este lab no tiene etiqueta de verdad de qué modelo debía resolver cada prompt, así que la calidad entra solo como restricción asumida), ` +
    `la tasa de acierto real del proveedor (el modelo la impone; nadie puede observarla antes de la petición), la latencia y el TTFT, el coste de las llamadas al clasificador, ` +
    `el almacenamiento de la caché explícita de Gemini y el TTL largo de Anthropic (1 hora, escritura al 2×).</p>`,
  );
}

export function renderCacheAffinityReport(artifact: SimulationArtifact): string {
  const cliffRow = artifact.paces.filter((row) => row.cacheHitRatio === 0).sort((left, right) => left.secondsPerTurn - right.secondsPerTurn)[0];
  const bestAware = artifact.priceGaps.filter((row) => row.winner === "cacheAware");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Afinidad de caché en el router de modelos · Informe</title><style>` +
    `:root{color-scheme:light;--ink:${INK};--muted:${MUTED};--line:${LINE};--panel:#fff;--bg:#f3f6fb}` +
    `*{box-sizing:border-box}body{font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;background:var(--bg);color:var(--ink)}` +
    `main{max-width:1120px;margin:auto;padding:2rem 1.25rem 4rem}h1{font-size:clamp(1.8rem,4vw,2.6rem);letter-spacing:-.03em;margin:0 0 .5rem}` +
    `h2{font-size:1.15rem;margin:0 0 .75rem}h3{font-size:1rem;margin:1rem 0 .5rem}header{padding:.5rem 0 1rem}.hint,small,span{color:var(--muted)}` +
    `section,.grid article{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:1.25rem;margin:1rem 0;box-shadow:0 3px 12px #22335508}` +
    `.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:.8rem;margin:1rem 0}.grid article{margin:0;padding:1rem}` +
    `.grid small,.grid span{display:block;font-size:.78rem}.grid strong{font-size:1.6rem;letter-spacing:-.03em}` +
    `table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}` +
    `th,td{text-align:left;padding:.6rem .5rem;border-bottom:1px solid #e9edf4;font-size:.92rem}thead th{color:var(--muted);font-size:.8rem}` +
    `tbody tr:last-child>*{border-bottom:0}svg{display:block;width:100%;height:auto;overflow:visible}svg text{fill:var(--ink);font-family:inherit}` +
    `code{background:#eef2f9;border-radius:4px;padding:.1rem .3rem;font-size:.85em}` +
    `.legend{color:var(--muted);font-size:.85rem;margin-bottom:.5rem}.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin:0 .3rem 0 .8rem}.legend i:first-child{margin-left:0}` +
    `.timeline{margin:.75rem 0}.timeline svg{min-width:640px}.timeline-label{display:none}` +
    `@media print{body{background:#fff}section,.grid article{box-shadow:none;break-inside:avoid}}</style></head><body><main>` +
    `<header><h1>Afinidad de caché en el router de modelos</h1>` +
    `<p>La caché de prompt está indexada <strong>por modelo y por endpoint</strong>, no por conversación. Un router que cambia de modelo pierde el prefijo que el turno anterior acabó de pagar. ` +
    `Este informe compara cinco estrategias y busca <strong>las condiciones</strong> en las que mantener la caché compensa.</p></header>` +
    `<div class="grid">${card("Acantilado de caché", cliffRow ? multiple(cliffRow.multipleOfSingle) : "—", "coste de alternar modelos cuando el ritmo supera el TTL")}` +
    `${card("El TTL manda", cliffRow ? `${cliffRow.secondsPerTurn} s` : "—", "por turno; a partir de ahí la tasa de acierto cae a 0%")}` +
    `${card("Gana el cache-aware", bestAware.length ? `${bestAware.length} de ${artifact.priceGaps.length}` : "0", "tramos de brecha de precios en que mantener la caché es más barato")}` +
    `${card("Regla simple vs heurística", "empate", "la regla de dos líneas iguala a la heurística en los workloads estables")}` +
    `${card("Reproducir", artifact.generatedBy, "sin credenciales ni red")}</div>` +
    timelineSection(artifact) +
    priceGapSection(artifact) +
    paceSection(artifact) +
    sequenceSection(artifact) +
    section("Los cinco routers, sobre cada workload", "El modelo fijo usa el modelo más barato que cubre la dificultad máxima del workload: es la única forma honesta de fijar uno solo en una sesión con picos.",
      artifact.strategies.map((comparison) => `<h3>${escapeHtml(comparison.workloadName)} <small>· ${escapeHtml(comparison.description)}</small></h3>` + strategyTable(comparison)).join("")) +
    poolSection(artifact) +
    prefixSection(artifact) +
    breakEvenSection(artifact) +
    methodology(artifact) +
    `<p class="hint">Cifras recalculables desde <code>pocs/cache-affinity/results/simulation.jsonl</code>, generado por <code>${escapeHtml(artifact.generatedBy)}</code>.</p>` +
    `</main></body></html>`;
}
