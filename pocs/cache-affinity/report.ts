/**
 * Informe HTML de la POC: tablas y gráficos renderizados desde el artefacto
 * versionado en `results/simulation.jsonl`. No recalcula nada, así que cada
 * cifra publicada se puede reproducir volviendo a leer el JSONL.
 */
import type { SimulationArtifact } from "./scenarios.js";
import { INK, LINE, MUTED, PALETTE, barChart, escapeHtml, lineChart } from "./charts.js";

const usd = (value: number) => `$${value.toFixed(4)}`;
const multiple = (value: number) => `${value.toFixed(2)}×`;
const tokens = (value: number) => value.toLocaleString("es-ES");
const turns = (value: number | null) => (value === null || !Number.isFinite(value) ? "nunca" : String(value));

/** Margen por encima del coste de la sesión fija: es la cifra titular. */
export function poolMultiple(artifact: SimulationArtifact): number {
  const sticky = artifact.scenarios.find((scenario) => scenario.id === "sticky");
  const worst = artifact.scenarios.reduce((max, scenario) => Math.max(max, scenario.result.total), 0);
  return sticky && sticky.result.total > 0 ? worst / sticky.result.total : 0;
}

function scenarioTable(artifact: SimulationArtifact): string {
  const baseline = artifact.scenarios.find((scenario) => scenario.id === "sticky")?.result.total ?? 1;
  const rows = artifact.scenarios.map((scenario) => {
    const relative = scenario.result.total / baseline;
    const color = relative > 1.05 ? PALETTE[3] : PALETTE[2];
    return `<tr><th>${escapeHtml(scenario.name)}</th><td>${escapeHtml(scenario.description)}</td>` +
      `<td>${scenario.poolSize}</td><td>${scenario.result.switches}</td>` +
      `<td>${tokens(scenario.result.cacheReadTokens)}</td><td>${tokens(scenario.result.cacheWriteTokens)}</td>` +
      `<td>${usd(scenario.result.total)}</td><td style="color:${color};font-weight:600">${multiple(relative)}</td></tr>`;
  }).join("");
  return `<section><h2>Coste de la sesión por escenario</h2>` +
    `<p class="hint">Sesión de ${artifact.prefixTokens.toLocaleString("es-ES")} tokens de prefijo estable, ` +
    `${artifact.newInputTokens} nuevos y ${artifact.outputTokens} de salida por turno, TTL de ${artifact.defaultTtlTurns} turnos. ` +
    `El múltiplo es relativo al modelo fijo.</p>` +
    `<table><thead><tr><th>Escenario</th><th>Qué hace</th><th>Pool</th><th>Cambios</th>` +
    `<th>Tokens leídos de caché</th><th>Tokens escritos</th><th>Coste</th><th>vs fijo</th></tr></thead><tbody>${rows}</tbody></table>` +
    `<p class="hint">Dos mecanismos distintos están detrás del sobrecoste: <strong>reescribir el prefijo</strong> al entrar en un modelo frío, ` +
    `y <strong>no encontrar nunca caché</strong> cuando el pool es más grande que la ventana del TTL. El caso del mismo modelo en otro endpoint ` +
    `es pérdida pura: mismos precios, sin ahorro que amortice.</p></section>`;
}

function cumulativeChart(artifact: SimulationArtifact): string {
  const series = artifact.scenarios.map((scenario, index) => ({
    label: scenario.name,
    color: PALETTE[index % PALETTE.length],
    values: scenario.result.turns.map((turn) => turn.cumulative),
    dashed: index === 0,
  }));
  const xLabels = (artifact.scenarios[0]?.result.turns ?? []).map((turn) => `t${turn.index + 1}`);
  return `<section><h2>Coste acumulado turno a turno</h2>` +
    `<p class="hint">La sesión fija (línea discontinua) se calienta en el primer turno y luego avanza casi plano. ` +
    `A partir de 10 modelos en el pool, cada turno vuelve a pagar el prefijo completo.</p>` +
    lineChart({ series, xLabels, ariaLabel: "Coste acumulado por turno y escenario", yFormat: (value) => `$${value.toFixed(2)}` }) +
    `</section>`;
}

function breakEvenChart(artifact: SimulationArtifact): string {
  const rows = artifact.breakEven.map((row) => ({
    label: row.factor === 1 ? "mismo precio (1,0×)" : `${row.factor.toFixed(1)}× · ${Math.round((1 - row.factor) * 100)}% más barato`,
    value: row.turns ?? 80,
    display: turns(row.turns),
    color: row.turns === 0 ? PALETTE[2] : PALETTE[1],
  }));
  return `<section><h2>¿Cuándo amortiza cambiar de modelo?</h2>` +
    `<p class="hint">Turnos que hay que permanecer en el modelo nuevo para que la reescritura del prefijo se recupere. ` +
    `Aproximación de prefijo largo: <code>T ≈ (w·f − r) / (r·(1 − f))</code>, con <code>w</code> el multiplicador de escritura, ` +
    `<code>r</code> el de lectura y <code>f</code> el cociente de precios. Las barras de &quot;nunca&quot; se dibujan a 80 turnos.</p>` +
    barChart(rows, "Turnos de amortización frente al cociente de precios") +
    `<p class="hint">Cambiar entre modelos del mismo tier —el caso más frecuente en un pool ancho— no tiene ahorro que amortizar: ` +
    `solo se paga la reescritura. Por debajo de la mitad de precio, en cambio, amortiza en menos de diez turnos.</p></section>`;
}

function poolChart(artifact: SimulationArtifact): string {
  const rows = artifact.pools.map((row) => ({
    label: `pool de ${row.poolSize} modelo${row.poolSize === 1 ? "" : "s"}`,
    value: row.multiple,
    display: `${multiple(row.multiple)} · ${row.cacheReadTokens === 0 ? "sin lecturas de caché" : `${tokens(row.cacheReadTokens)} leídos`}`,
    color: row.cacheReadTokens === 0 ? PALETTE[3] : row.poolSize === 1 ? PALETTE[2] : PALETTE[0],
  }));
  return `<section><h2>Coste frente al tamaño del pool</h2>` +
    `<p class="hint">El daño no lo hace el cambio de modelo en sí, sino <strong>si el linaje se revisita dentro de la ventana del TTL</strong>. ` +
    `Con turnos de ~30 s y un TTL de 5 minutos, la entrada caduca a los ${artifact.defaultTtlTurns} turnos: en cuanto el pool alcanza ese tamaño, ` +
    `ninguna visita encuentra la entrada fresca, el coste se satura en ${multiple(Math.max(...artifact.pools.map((row) => row.multiple)))} ` +
    `y las lecturas de caché caen a cero.</p>` +
    barChart(rows, "Coste relativo frente al tamaño del pool de modelos") +
    `<p class="hint">Los escenarios <em>mismo modelo en otro endpoint</em> y <em>dos modelos alternos</em> caen por debajo del codo: ` +
    `con un pool de 2 cada linaje se revisita dentro del TTL y ambos siguen tibios.</p></section>`;
}

function methodology(artifact: SimulationArtifact): string {
  const preset = artifact.presets.anthropic;
  return `<section><h2>Método y límites</h2>` +
    `<p>Modelo determinista, sin red. El prefijo crece con lo ya enviado, así que mantenerse en un modelo no sale gratis: solo sale barato. ` +
    `Los ratios son los documentados por el proveedor —escritura ${preset.cacheWriteMultiplier}× y lectura ${preset.cacheReadMultiplier}× ` +
    `del precio base de entrada— y el precio base se usa solo para dar escala (${usd(preset.inputUsdPerMTok)}/Mtok). ` +
    `Por eso las cifras que sostienen la conclusión son las adimensionales.</p>` +
    `<table><thead><tr><th>Supuesto</th><th>Valor</th><th>De dónde sale</th></tr></thead><tbody>` +
    `<tr><th>Prefijo estable</th><td>${tokens(artifact.prefixTokens)} tokens</td><td>Orden de magnitud de un system prompt con herramientas de un agente de código.</td></tr>` +
    `<tr><th>Delta por turno</th><td>${artifact.newInputTokens} / ${artifact.outputTokens} tokens</td><td>Petición corta de agente con respuesta breve.</td></tr>` +
    `<tr><th>TTL de caché</th><td>${artifact.defaultTtlTurns} turnos</td><td>TTL de 5 minutos del proveedor a ~30 s por turno.</td></tr>` +
    `<tr><th>Escritura / lectura</th><td>${preset.cacheWriteMultiplier}× / ${preset.cacheReadMultiplier}×</td><td>Multiplicadores documentados del proveedor.</td></tr>` +
    `</tbody></table>` +
    `<p class="hint">Lo que este informe <strong>no</strong> mide: la tasa de acierto real del proveedor, el coste de las llamadas al clasificador, ` +
    `ni el tiempo hasta el primer token. Tampoco mide la calidad: cambiar de modelo puede seguir siendo correcto por otras razones. ` +
    `Lo que sí muestra es el suelo de coste que ese cambio tiene que superar para pagarse a sí mismo.</p></section>`;
}

export function renderCacheAffinityReport(artifact: SimulationArtifact): string {
  const worst = artifact.scenarios.reduce((max, scenario) => (scenario.result.total > max.result.total ? scenario : max), artifact.scenarios[0]);
  const breakEvenHalf = artifact.breakEven.find((row) => row.factor === 0.5);
  // El acantilado empieza cuando el pool alcanza la ventana del TTL en turnos.
  const saturation = artifact.pools.find((row) => row.cacheReadTokens === 0)?.poolSize;
  const card = (label: string, value: string, note = "") => `<article><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong>${note ? `<span>${escapeHtml(note)}</span>` : ""}</article>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Afinidad de caché en el router de modelos · Informe</title><style>` +
    `:root{color-scheme:light;--ink:${INK};--muted:${MUTED};--line:${LINE};--panel:#fff;--bg:#f3f6fb}` +
    `*{box-sizing:border-box}body{font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;background:var(--bg);color:var(--ink)}` +
    `main{max-width:1120px;margin:auto;padding:2rem 1.25rem 4rem}h1{font-size:clamp(1.8rem,4vw,2.6rem);letter-spacing:-.03em;margin:0 0 .5rem}` +
    `h2{font-size:1.15rem;margin:0 0 .75rem}header{padding:.5rem 0 1rem}.hint,small,span{color:var(--muted)}` +
    `section,.grid article{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:1.25rem;margin:1rem 0;box-shadow:0 3px 12px #22335508}` +
    `.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.8rem;margin:1rem 0}.grid article{margin:0;padding:1rem}` +
    `.grid small,.grid span{display:block;font-size:.78rem}.grid strong{font-size:1.6rem;letter-spacing:-.03em}` +
    `table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}` +
    `th,td{text-align:left;padding:.6rem .5rem;border-bottom:1px solid #e9edf4;font-size:.92rem}thead th{color:var(--muted);font-size:.8rem}` +
    `tbody tr:last-child>*{border-bottom:0}svg{display:block;width:100%;height:auto;overflow:visible}svg text{fill:var(--ink);font-family:inherit}` +
    `code{background:#eef2f9;border-radius:4px;padding:.1rem .3rem;font-size:.85em}` +
    `@media print{body{background:#fff}section,.grid article{box-shadow:none;break-inside:avoid}}</style></head><body><main>` +
    `<header><h1>Afinidad de caché en el router de modelos</h1>` +
    `<p>La caché de prompt está indexada <strong>por modelo</strong>, no por conversación. Un router que elige modelo en cada turno destruye, ` +
    `en cada cambio, la caché que el turno anterior acabó de pagar. Este informe mide cuánto cuesta.</p></header>` +
    `<div class="grid">${card("Coste del peor escenario", multiple(poolMultiple(artifact)), `frente a mantener el modelo (${worst.name})`)}` +
    `${card("Caché perdida, pool de 10+", saturation !== undefined ? `≥${saturation}` : "n/a", `modelos bastan para agotar la ventana del TTL (${artifact.defaultTtlTurns} turnos)`)}` +
    `${card("Con el modelo a la mitad de precio", breakEvenHalf ? turns(breakEvenHalf.turns) : "n/a", "turnos para amortizar el cambio")}` +
    `${card("Mismo precio, otro modelo", turns(artifact.breakEven.find((row) => row.factor === 1)?.turns ?? null), "nunca amortiza")}` +
    `${card("Reproducir", "npm run cache-affinity", "sin credenciales ni red")}</div>` +
    `${scenarioTable(artifact)}${cumulativeChart(artifact)}${poolChart(artifact)}${breakEvenChart(artifact)}${methodology(artifact)}` +
    `<p class="hint">Cifras recalculables desde <code>pocs/cache-affinity/results/simulation.jsonl</code>, generado por <code>${escapeHtml(artifact.generatedBy)}</code>.</p>` +
    `</main></body></html>`;
}
