# PROMPT: publicar la PoC como repo público + GitHub Pages (multi-PoC)

Pega esto tal cual a una sesión/agente nuevo trabajando en
`E:\workspace\personal\poc-jev-agent-coder`. El objetivo es dejar el repo
publicable, ordenado para alojar más POCs de Jev y de LLMs de decisión, y
con un sitio de GitHub Pages que enseñe los resultados de todas las POCs en
una sola página.

---

## Contexto

Este repo es un arnés TypeScript para experimentar con **motores de decisión
tipada** (contrato "System One": `state` + preguntas `choice` / `score` /
`noul`) y routing de modelos. Hoy contiene dos POCs y va a recibir más, así
que la organización por carpetas es parte del entregable, no un detalle.

Fuera del repo, pero relacionado: hay un artículo de blog que va a enlazar
el sitio publicado (valdepeace.com), y una aportación a
`valdepeace/crush` (PR `charmbracelet/crush#3969`). No toques ninguno de los
dos; solo necesito las URLs al final.

## Estado actual (verificado, no lo re-descubras, confírmalo)

- 31 ficheros trackeados. El repo **no tiene remoto** todavía.
- Hay **dos ficheros `.env` con clave real** (`OPENROUTER_API_KEY=sk-or-v1…`):
  `./.env` y `./pocs/design-patterns/.env`. **Los dos están ignorados** por
  `.gitignore` (el patrón `.env` sin barra matchea a cualquier nivel). El
  histórico de git **no contiene la clave** (`git log --all -p | rg 'sk-or-v1'`
  sale vacío) y ningún fichero trackeado la tiene.
- Hay trabajo **sin commitear**: `pocs/` está sin trackear, y
  `docs/analysis-2026-09-27.md` + `docs/research-datasets.md` aparecen como
  borrados porque se movieron a `pocs/jev-kev-laya/`. La reorganización está
  a medias: termínala y commitea por pasos.
- `results/` (raíz) está ignorado y contiene los artefactos generados:
  13 JSONL de corridas (~9-100 KB cada uno), sus 13 `*.summary.csv`, 4 CSV
  agregados (`jev-summary`, `jev-tiers-summary`, `laya-summary`,
  `laya-tiers-summary`) y 3 HTML (`report.html` y `report-tiers.html` de
  ~1,2 MB cada uno, `report-router.html` de 2 KB). Los HTML embeben los
  textos de los prompts.
- `data/questions.jsonl` (300 preguntas de WildChat-1M, 1,2 MB) está
  ignorado y **no debe publicarse**; se regenera con `npm run prepare`.
- Los runners tienen rutas por defecto a `results/` en `scripts/run-benchmark.ts`,
  `scripts/run-laya-benchmark.ts`, `scripts/run-candidate-benchmark.ts` (esta
  última con `results/${candidate}-…` hardcodeado en la línea ~65) y
  `scripts/report.ts` (`results/report.html`). Eso es lo único que ata los
  artefactos a la raíz.

## Objetivo

1. Reorganizar el repo por POC (cada carpeta, autocontenida).
2. Publicarlo como repo **público** sin filtrar ningún secreto.
3. Publicar en **GitHub Pages** un hub con todas las POCs y una página por
   POC con sus resultados.
4. Dejar la estructura y las reglas escritas para las POCs que vengan.

## Estructura destino

```text
<repo>/
  README.md              # qué es el lab, índice de POCs, cómo reproducir, licencias
  AGENTS.md              # convenciones pa agentes (espejo de CLAUDE.md)
  CLAUDE.md              # apunta a AGENTS.md
  PROMPT.md              # handoff existente (se queda)
  package.json  tsconfig.json  .gitignore  .env.example
  src/                   # contrato compartido y clientes (Jev, Laya, pool, dataset)
  scripts/               # runners, análisis, informe, build del sitio (multi-POC)
  site/                  # fuentes del sitio publicado (index.html + assets)
  pocs/
    README.md            # índice de POCs (una fila por POC)
    jev-kev-laya/
      README.md  WHY.md
      analysis/          # análisis en markdown con fecha
      plans/             # notas de diseño/planificación de esta POC
      results/           # JSONL + summary.csv de las corridas publicadas
    design-patterns/
      README.md  WHY.md  .env.example  lab.html  lab.js  server.js  router.ts  …
  data/                  # contrato del JSONL + README (sin datos: ignorados)
  docs/                  # solo lo transversal (p. ej. el README de estructura)
```

Reglas de la estructura:

- Todo lo de una POC vive dentro de `pocs/<slug>/`; la raíz solo tiene el
  arnés compartido, el sitio y la documentación transversal.
- `results/` de la raíz es **espacio de trabajo** (ignorado), donde los
  runners escriben por defecto. Publicar una corrida = copiar los artefactos
  elegidos a `pocs/<slug>/results/`, que **sí** se versiona porque es la
  fuente del sitio.
- Ojo con el `.gitignore`: el patrón actual `results/` (sin barra inicial)
  ignora también `pocs/*/results/`. Hay que cambiarlo por `/results/` para
  ignorar solo la raíz. No intentes re-incluir con negaciones
  (`!pocs/*/results/*.jsonl`): git no re-incluye ficheros cuyo directorio
  padre está excluido.
- El slug es kebab-case y estable: es el que aparecerá en la URL del sitio.
- `docs/superpowers/plans/*.md` se reparten a `pocs/<slug>/plans/`.
- `data/questions.jsonl` y cualquier `.env` **nunca** se commitean.

## Reglas no negociables

1. **Ningún `.env` se commitea, nunca, ni con `-f`.** Antes de cada commit:
   `git status --porcelain --ignored` y `git check-ignore -v .env pocs/*/.env`.
2. **Nada de `git add -A` a ciegas**: revisa el `git status` completo antes.
3. No reescribas el histórico ni hagas force-push. Si encontraras un secreto
   commiteado en algún momento, **para y avísame**: rotamos la clave antes de
   seguir (borrarlo con `filter-repo` no basta, el repo va a ser público).
4. No publiques `data/questions.jsonl` ni copias del dataset. El sitio enlaza
   a `allenai/WildChat-1M` y documenta `npm run prepare` pa reproducir la
   muestra.
5. **Atribución ODC-BY obligatoria**: WildChat-1M se distribuye bajo
   [ODC-BY 1.0](https://opendatacommons.org/licenses/by/1-0/), y los informes
   republican texto de prompts. Hay que incluir en el pie del sitio y en el
   README una nota del tipo: *"Contains information from WildChat-1M
   (allenai/WildChat-1M), which is made available under the ODC Attribution
   License."*
6. Pregúntame **antes** de: crear el remoto, elegir el nombre del repo,
   publicar el sitio y cualquier acción irreversible o pública.
7. No cambies `valdepeace.com` ni el CNAME del sitio del blog: ese dominio
   sigue sirviendo el blog Docusaurus. El lab va en su propio subdominio o en
   el Pages del proyecto.

## Pasos

### 0. Preflight (lectura, sin tocar nada)

- Confirma los hechos del apartado "Estado actual": remoto, ficheros
  ignorados, escaneo de secretos en trackeados y en histórico, `npm test` y
  `npx tsc --noEmit` en verde.
- Revísame conmigo, en un solo mensaje: nombre del repo propuesto, dominio del
  sitio y si publicamos los prompts de la muestra verbatim. Espera respuesta.

### 1. Terminar la reorganización en la raíz

- Copia a `pocs/jev-kev-laya/results/` los artefactos de las corridas ya
  publicadas: los 13 JSONL, sus `*.summary.csv` y los 4 CSV agregados. La
  raíz `results/` se queda como scratch. Tras cambiar el patrón del
  `.gitignore` a `/results/`, esos ficheros pasan a ser versionables:
  añádelos explícitamente, revisando antes que no arrastras nada más.
- Reparte `docs/superpowers/plans/*.md` a `pocs/<slug>/plans/` y borra el
  árbol `docs/superpowers/` vacío.
- Actualiza **todos** los enlaces relativos de `README.md`, `pocs/*/README.md`,
  `pocs/*/analysis/*.md`, `PROMPT.md` y `data/README.md` a las rutas nuevas.
- Deja `docs/README.md` explicando qué vive en la raíz y qué en cada POC.

### 2. Hacer el arnés multi-POC

- Quita las rutas `results/…` hardcodeadas de los tres runners y de
  `report.ts`: reciben el directorio de resultados por argumento
  (`--out-dir`) o por variable de entorno, con el mínimo código posible.
- Los scripts de `package.json` apuntan a la POC correspondiente, así que
  `npm run classify`, `npm run report`, etc. siguen funcionando desde la raíz.
- Añade un `npm run site` que genere el sitio: por cada POC, renderiza sus
  informes desde los JSONL commiteados y actualiza el hub.
- Tests: actualiza `scripts/*.test.ts` que dependan de rutas y añade uno que
  cubra el nombre/ubicación de salida. `npm test` y `npx tsc --noEmit` verdes.

### 3. Sitio de GitHub Pages

- `site/index.html`: hub con una tarjeta por POC (título, la pregunta que
  responde, fecha, enlace a su página) y el aviso ODC-BY en el pie. Sin
  dependencias externas ni frameworks: HTML y CSS a mano, tipografía de
  sistema, que se lea bien en móvil.
- Una página por POC: reutiliza el HTML que ya genera `scripts/report.ts` y
  añádele el aviso de atribución; no reescribas los informes.
- `.github/workflows/pages.yml`: en push a `main`, `npm ci`, `npm test`,
  `npm run site` y despliegue de `dist/site` con
  `actions/configure-pages` + `actions/upload-pages-artifact` +
  `actions/deploy-pages` (permisos `pages: write`, `id-token: write`). El
  Pages del repo se configura con origen "GitHub Actions".
- El generador escribe en `dist/site/` (ignorado); `site/` solo contiene las
  fuentes a mano. **No** commitees los HTML de 1,2 MB ni ninguna copia
  generada: commitéa solo las fuentes, los JSONL y los CSV publicados.

### 4. Higiene de secretos y de datos

- Endurece `.gitignore`: `**/.env`, `.env.*` con la excepción `!.env.example`,
  `node_modules/`, `/dist/`, `data/*.jsonl`, `/results/` (solo la raíz; ver la
  nota de `pocs/<slug>/results/`), `.codebase-memory/`, `.serena/`,
  `.superpowers/`, `.claude/`.
- Añade `pocs/design-patterns/.env.example` (mismas claves, sin valores) y
  revisa `./.env.example` para que solo tenga `OPENROUTER_API_KEY=`.
- Añade a `package.json` un `npm run audit` que escanee patrones de clave
  (`sk-or-v1`, `OPENROUTER_API_KEY=.+`) en el árbol trackeado y falle si
  encuentra algo. Documéntalo en `AGENTS.md` como paso previo a publicar.
- Nota pa mí (no lo hagas tú): la clave de OpenRouter ha pasado por
  transcripciones de agentes; si quieres rotarla antes de hacer público el
  repo, dime y la cambio.

### 5. README + AGENTS.md del lab

- `README.md` raíz: qué es el lab, índice de POCs, cómo reproducir una corrida
  (con `OPENROUTER_API_KEY`), dónde vive cada cosa, licencias y atribución,
  y enlace al sitio publicado.
- `AGENTS.md`: la estructura destino como contrato, las reglas no negociables
  de secretos y datos, cómo añadir una POC nueva (checklist: carpeta, README,
  WHY, plans, analysis, results, fila en `pocs/README.md` y tarjeta en el
  hub) y el aviso de que `results/` es lo único publicable de una corrida.
  `CLAUDE.md` apunta a `AGENTS.md`.

### 6. Commits

Commits pequeños y por tema, en este orden: reorganización → arnés multi-POC →
sitio y workflow → higiene de secretos → documentación. Mensajes centrados en
el porqué, en primera línea < 72 caracteres.

### 7. Crear el remoto y publicar (con mi OK del paso 0)

- `gh repo create valdepeace/<repo> --public --source . --remote origin` y push
  de `main`.
- Activa Pages con origen GitHub Actions y comprueba que el workflow termina
  en verde y el hub responde.
- Si elijo subdominio: añade el `CNAME` al artefacto del sitio
  (`labs.valdepeace.com`) y dime el registro DNS exacto que tengo que crear
  (CNAME `labs` → `valdepeace.github.io`). El certificado TLS lo emite GitHub
  cuando el DNS resuelve.

### 8. Verificación final (con evidencias, no afirmaciones)

- Clon limpio en un directorio temporal: `npm ci && npm test && npm run site`
  funcionan sin ningún `.env`.
- `git log --all -p | rg 'sk-or-v1'` vacío **en el repo remoto**.
- `git status --porcelain --ignored` sin `.env` fuera del bloque de ignorados.
- El hub y cada página de POC cargan, los enlaces internos no dan 404 y el
  aviso ODC-BY aparece en el pie.
- Cada número del informe se puede recalcular desde el JSONL commiteado.

## Qué me devuelves

1. La URL del hub y la URL de la página de esta POC (`jev-kev-laya`).
2. El nombre del repo y el subdominio (o el del proyecto si no hay subdominio).
3. El registro DNS a crear, si aplica.
4. El árbol final de carpetas y la lista de commits.
5. La salida literal de la verificación del paso 8.

Con eso termino el artículo del blog y enlazo el sitio.

## Fuera de alcance

- No toques `E:\workspace\personal\my-website` (el blog) ni
  `E:\workspace\personal\crush` (el fork con el router).
- No ejecutes corridas nuevas contra OpenRouter: consume crédito y no hace
  falta pa publicar lo que ya hay.
- No borres ni reescribas los JSONL, los CSV ni los informes existentes.
- No añadas frameworks, bundlers ni dependencias nuevas al sitio.
