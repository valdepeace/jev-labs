# AGENTS.md — poc-jev-agent-coder

Arnés TypeScript para comparar **motores de decisión tipada** (Jev, Kev, Laya)
sobre preguntas reales de programación, y publicar los resultados como sitio
estático. Este fichero es el contrato de trabajo; `CLAUDE.md` apunta aquí.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm test` | Suite completa (`tsx --test scripts/*.test.ts src/*.test.ts`). |
| `npx tsc --noEmit` | Typecheck. `tsconfig.json` solo incluye `src`. |
| `npm run prepare` | Regenera `data/questions.jsonl` desde WildChat-1M. |
| `npm run classify` / `:tiers` / `:laya` | Corridas contra Jev (OpenRouter) o Laya local. Escriben en `pocs/jev-kev-laya/results`. |
| `npm run report` | Informe comparativo HTML del pool general. |
| `npm run site` | Genera el sitio completo en `dist/site/`. |
| `npm run audit` | Falla si hay una clave en el árbol versionado. **Obligatorio antes de publicar.** |
| `npm run analyze` | Agregados CSV desde los JSONL. |

Correr Jev/Kev cuesta dinero: pide OK explícito antes de lanzar una corrida y
nunca lo metas como paso automático de una tarea más larga.

## Estructura (contrato)

```text
src/       contrato y clientes compartidos (Jev, Laya, pool, dataset)
scripts/   runners, análisis, informe, registro de POCs, generador del sitio
site/      fuentes a mano del sitio: index.html (hub) y style.css
pocs/<slug>/   README.md, WHY.md, plans/, analysis/, results/, questions.jsonl
data/      contrato del JSONL de trabajo; el fichero real no se publica
results/   scratch de los runners; ignorado por git
dist/site/ sitio generado; ignorado por git
docs/      solo documentación transversal
```

- Todo lo de un experimento vive en `pocs/<slug>/`. La raíz solo tiene el arnés
  compartido, el sitio y los docs transversales.
- `pocs/<slug>/results/` **se versiona**: es la fuente del sitio. `/results/` de
  la raíz es scratch e ignorado. El slug es kebab-case y estable: define la URL
  de la POC en el sitio.
- `pocs/<slug>/questions.jsonl` es la muestra de prompts que el informe incrusta,
  y también se versiona (con atribución ODC-BY). Si una POC no publica prompts,
  basta con omitir `questions` en su entrada del registro.

## Cómo añadir una POC

1. `pocs/<slug>/` con `README.md` (pregunta, alcance, fuentes) y `WHY.md`
   (motivos, hipótesis, no-objetivos).
2. `plans/` con las notas de diseño y `analysis/` con los análisis fechados.
3. `results/` con los JSONL y CSV de las corridas publicadas y, si el informe
   publica los prompts, `questions.jsonl` con la muestra.
4. Una fila en `pocs/README.md`.
5. Una entrada en `POCS` de `scripts/pocs.ts` (slug, título, pregunta, fecha,
   resumen, `questions`, `pages`/`assets`). `npm run site` construye el hub y las
   páginas desde ahí: es la única lista que hay que tocar.
6. `npm test` y `npm run audit` en verde.

## Reglas no negociables

- **Ningún `.env` se commitea, nunca, ni con `-f`.** Están en `.gitignore`
  (`**/.env`). Antes de cada commit:
  `git status --porcelain --ignored` y `git check-ignore -v .env pocs/*/.env`.
- **Nada de `git add -A` a ciegas.** `data/*.jsonl` y `results/` de la raíz son
  scratch y no se publican. Lo que sí se publica, por decisión de cada POC, es su
  muestra de preguntas en `pocs/<slug>/questions.jsonl` (300 prompts de
  WildChat-1M) junto a los artefactos de `pocs/<slug>/results/`. La muestra
  completa de WildChat-1M no se incluye: se regenera con `npm run prepare`.
  `PROMPT*.md` está ignorado porque es material de handoff, no documentación.
- **Antes de publicar o de hacer push**, los tres chequeos:

  ```bash
  npm run audit                                                  # arbol versionado
  git log --all -p | grep -E 'sk-or-v1-[0-9a-f]{16,}'            # historico completo
  git status --porcelain --ignored                               # .env fuera del indice
  ```

  El segundo debe salir vacío. No escribas claves de ejemplo con el prefijo
  completo en tests ni en docs: rompen esta alarma. Monta el valor por trozos
  (`["sk-or", "v1", "…"].join("-")`) si necesitas un fixture.
- **Atribución ODC-BY obligatoria** en el pie del sitio y en el README:
  *"Contains information from WildChat-1M (allenai/WildChat-1M), which is made
  available under the ODC Attribution License."*
- No reescribas el histórico ni hagas force-push. Si aparece un secreto
  commiteado, **para y avisa**: la clave se rota (borrarla con `filter-repo` no
  basta en un repo público).
- Pregunta antes de crear el remoto, publicar el sitio o cualquier acción
  irreversible.
- No añadas dependencias, frameworks ni bundlers al sitio: HTML y CSS a mano.
- No ejecutes corridas nuevas contra OpenRouter para publicar lo que ya existe.

## Gotchas

- `prepare` es un **hook de ciclo de vida de npm**: `npm install` / `npm ci` lo
  ejecutan automáticamente y descargan la muestra de WildChat. En CI y en
  entornos sin red usa `npm ci --ignore-scripts` (es lo que hace el workflow).
- `NodeNext` (`"type": "module"`): los imports relativos llevan extensión `.js`
  (`./models.js`), también desde `scripts/`.
- `tsconfig.json` solo incluye `src/`, así que `tsc --noEmit` **no** valida
  `scripts/`; los tests son la red de seguridad de esa carpeta.
- Los runners no llevan rutas hardcodeadas: el directorio de salida llega por
  `--out-dir` (o `RESULTS_DIR`), con `results/` como default. Añadir un runner
  nuevo significa usar `resolveOutDir` de `scripts/paths.ts`.
- `report.ts` exporta `buildComparisonHtml`/`buildRouterHtml`; `site.ts` los
  reutiliza. Los informes incrustan la muestra de la POC
  (`poc.questions` → `pocs/<slug>/questions.jsonl`), así que las páginas pesan
  ~1,2 MB; si el fichero no existe, el informe se genera sin el selector en
  lugar de fallar (`loadSampleQuestions` tolera `ENOENT`).
- `scripts/pocs.ts` es el registro del sitio: añadir una POC sin tocarlo no la
  publica.
- `MODEL_POOL` (`src/models.ts`) se refresca contra el catálogo de OpenRouter. Si
  un id se descataloga, Jev no falla: devuelve una elección sin sentido. Los
  tiers de proveedores chinos están diferidos (ver el plan en
  `pocs/jev-kev-laya/plans/`).
- `--pool` debe ser `wide` o `tiers`, y `--limit` un entero positivo: ambos se
  validan **antes** de llamar a la red.
- El pie del sitio se inyecta con `withFooter`; el hub trae el suyo en
  `site/index.html`.
