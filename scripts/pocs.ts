/**
 * Registro de POCs del sitio. Es la única lista que hay que tocar al añadir
 * un experimento: el hub y las páginas se generan de aquí.
 *
 * `assets` son ficheros a mano que se copian tal cual; `pages` son informes
 * que se renderizan desde los JSONL versionados en `pocs/<slug>/results/`.
 */
export interface SiteAsset {
  source: string;
  file: string;
}

export interface SitePage {
  file: string;
  title: string;
  comparison?: { jev: string; laya: string; candidates?: readonly string[] };
  router?: readonly string[];
  /** Página de la POC de afinidad de caché: se renderiza desde su artefacto. */
  cacheAffinity?: { artifact: string };
}

export interface PocSite {
  slug: string;
  title: string;
  question: string;
  date: string;
  summary: string;
  /** Muestra de preguntas (JSONL) que los informes incrustan, si aplica. */
  questions?: string;
  assets?: readonly SiteAsset[];
  pages?: readonly SitePage[];
}

const JEV_KEV_LAYA = "pocs/jev-kev-laya";
const DESIGN_PATTERNS = "pocs/design-patterns";
const CACHE_AFFINITY = "pocs/cache-affinity";

export const POCS: readonly PocSite[] = [
  {
    slug: "jev-kev-laya",
    title: "Jev, Kev y Laya",
    question: "¿Cómo difieren los tres motores de decisión ante las mismas preguntas de programación?",
    date: "2026-09-27",
    summary: "300 prompts de programación de WildChat-1M, tres motores de decisión tipada y dos pools de modelos.",
    questions: `${JEV_KEV_LAYA}/questions.jsonl`,
    pages: [
      {
        file: "report.html",
        title: "Pool general de 16 modelos",
        comparison: {
          jev: `${JEV_KEV_LAYA}/results/benchmark-2026-09-27T14-44-37.993Z.jsonl`,
          laya: `${JEV_KEV_LAYA}/results/laya-2026-09-27T14-44-37.980Z.jsonl`,
          candidates: [
            `${JEV_KEV_LAYA}/results/kev-wide-2026-09-27T16-59-09.765Z.jsonl`,
            `${JEV_KEV_LAYA}/results/router-2026-09-27T16-31-17.126Z.jsonl`,
          ],
        },
      },
      {
        file: "report-tiers.html",
        title: "Tiers por proveedor",
        comparison: {
          jev: `${JEV_KEV_LAYA}/results/benchmark-tiers-2026-09-27T17-20-00Z.jsonl`,
          laya: `${JEV_KEV_LAYA}/results/laya-tiers-2026-09-27T17-20-00Z.jsonl`,
          candidates: [
            `${JEV_KEV_LAYA}/results/kev-tiers-2026-09-27T16-53-09.705Z.jsonl`,
            `${JEV_KEV_LAYA}/results/kev-tiers-retry-2026-09-27T16-57-06.293Z.jsonl`,
          ],
        },
      },
      {
        file: "report-router.html",
        title: "Jev Router (piloto)",
        router: [`${JEV_KEV_LAYA}/results/router-2026-09-27T16-31-17.126Z.jsonl`],
      },
    ],
  },
  {
    slug: "design-patterns",
    title: "Patrones de diseño",
    question: "¿Cómo integrar un motor de decisión sin darle autoridad de ejecución?",
    date: "2026-09-27",
    summary: "Laboratorio offline: filtros de capacidad, policy de confianza y margen, abstención y afinidad de sesión.",
    assets: [
      { source: `${DESIGN_PATTERNS}/lab.html`, file: "lab.html" },
      { source: `${DESIGN_PATTERNS}/lab.js`, file: "lab.js" },
    ],
  },
  {
    slug: "cache-affinity",
    title: "Afinidad de caché",
    question: "¿Cuánto cuesta cambiar de modelo a mitad de sesión, y a partir de qué diferencia de precio amortiza?",
    date: "2026-09-28",
    summary: "Simulación determinista del coste de caché por turno: acantilado de reescritura, TTL y turnos de amortización.",
    pages: [
      {
        file: "report.html",
        title: "Coste del router en caliente",
        cacheAffinity: { artifact: `${CACHE_AFFINITY}/results/simulation.jsonl` },
      },
    ],
  },
];

/** Ruta del artefacto de un POC dentro de `dist/site/`. */
export function assetPath(slug: string, file: string): string {
  return `${slug}/${file}`;
}
