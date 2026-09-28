/**
 * Primitivas de gráfico en SVG a mano, sin dependencias, para el informe de esta
 * POC. Siguen la paleta y el estilo tipográfico de `scripts/report.ts` para que
 * el sitio se vea coherente, pero viven aquí porque son de otra forma: barras
 * horizontales con etiqueta y series de líneas, en vez de barras comparadas de
 * dos o tres clasificadores.
 */

export const INK = "#172033";
export const MUTED = "#647084";
export const LINE = "#dce3ee";
export const PALETTE = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#0ea5e9", "#a855f7"] as const;

export function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export interface BarRow {
  label: string;
  value: number;
  /** Texto a mostrar junto a la barra; por defecto, el valor crudo. */
  display?: string;
  color?: string;
}

/** Barras horizontales con columna de etiqueta. No dibuja barras de valor 0. */
export function barChart(rows: readonly BarRow[], ariaLabel: string, width = 680): string {
  const labelWidth = 200;
  const barWidth = width - labelWidth - 70;
  const rowHeight = 30;
  const max = Math.max(1, ...rows.map((row) => row.value));
  const bars = rows.map((row, index) => {
    const y = 26 + index * rowHeight;
    const label = `<text x="0" y="${y + 12}" font-size="12">${escapeHtml(row.label)}</text>`;
    if (row.value === 0) {
      return `${label}<text x="${labelWidth}" y="${y + 12}" font-size="11" fill="${MUTED}">${escapeHtml(row.display ?? "0")}</text>`;
    }
    const bar = Math.max(2, (row.value / max) * barWidth);
    return `${label}<rect x="${labelWidth}" y="${y}" width="${bar}" height="14" rx="4" fill="${row.color ?? PALETTE[0]}"/>` +
      `<text x="${labelWidth + bar + 6}" y="${y + 12}" font-size="11">${escapeHtml(row.display ?? String(row.value))}</text>`;
  }).join("");
  const height = rows.length * rowHeight + 40;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(ariaLabel)}">${bars}</svg>`;
}

export interface LineSeries {
  label: string;
  color: string;
  values: readonly number[];
  /** Serie discontinua, para el caso de referencia. */
  dashed?: boolean;
}

export interface LineChartInput {
  series: readonly LineSeries[];
  xLabels: readonly string[];
  ariaLabel: string;
  yFormat?: (value: number) => string;
  width?: number;
  height?: number;
}

/** Series de líneas con leyenda, rejilla horizontal y etiquetas en los extremos del eje X. */
export function lineChart(input: LineChartInput): string {
  const { series, xLabels, ariaLabel, yFormat = (value: number) => value.toFixed(2), width = 680, height = 260 } = input;
  const padding = { top: 30, right: 20, bottom: 42, left: 64 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const max = Math.max(1e-9, ...series.flatMap((item) => item.values));
  const count = Math.max(2, ...series.map((item) => item.values.length));
  const x = (index: number) => padding.left + (index / (count - 1)) * plotWidth;
  const y = (value: number) => padding.top + plotHeight - (value / max) * plotHeight;

  const grid = [0, 0.5, 1].map((fraction) => {
    const value = max * fraction;
    return `<line x1="${padding.left}" y1="${y(value)}" x2="${width - padding.right}" y2="${y(value)}" stroke="${LINE}" stroke-width="1"/>` +
      `<text x="${padding.left - 8}" y="${y(value) + 4}" font-size="10" fill="${MUTED}" text-anchor="end">${escapeHtml(yFormat(value))}</text>`;
  }).join("");

  const lines = series.map((item) => {
    const points = item.values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
    return `<polyline points="${points}" fill="none" stroke="${item.color}" stroke-width="2"${item.dashed ? ' stroke-dasharray="5 4"' : ""}/>`;
  }).join("");

  const legend = series.map((item, index) => {
    const offset = 0 + index * 132;
    return `<rect x="${padding.left + offset}" y="6" width="10" height="10" rx="3" fill="${item.color}"/>` +
      `<text x="${padding.left + offset + 15}" y="15" font-size="11">${escapeHtml(item.label)}</text>`;
  }).join("");

  const ticks = xLabels.map((label, index) => {
    if (xLabels.length > 6 && index !== 0 && index !== xLabels.length - 1 && index % Math.ceil(xLabels.length / 5) !== 0) return "";
    return `<text x="${x(index)}" y="${height - padding.bottom + 18}" font-size="10" fill="${MUTED}" text-anchor="middle">${escapeHtml(label)}</text>`;
  }).join("");

  const axis = `<line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + plotHeight}" stroke="${LINE}"/>` +
    `<line x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${width - padding.right}" y2="${padding.top + plotHeight}" stroke="${LINE}"/>`;

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(ariaLabel)}">${legend}${grid}${axis}${lines}${ticks}</svg>`;
}
