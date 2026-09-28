# poc-jev-agent-coder

Arnés TypeScript compartido para experimentar con **motores de decisión tipada**
(contrato "System One": un `state` y preguntas `choice` / `score` / `noul`) y con
routing de modelos. El código reutilizable vive en `src/`, los comandos en
`scripts/`, cada experimento con su evidencia en `pocs/` y el sitio publicado se
genera en `dist/site/`.

Sitio publicado: **https://poc-jev-agent-coder.valdepeace.com** · Código: [valdepeace/poc-jev-agent-coder](https://github.com/valdepeace/poc-jev-agent-coder)

## POCs

| POC | Pregunta | Estado |
| --- | --- | --- |
| [Jev, Kev y Laya](./pocs/jev-kev-laya/README.md) | ¿Cómo difieren los tres motores de decisión ante las mismas preguntas de programación? | Corridas locales publicadas; falta análisis conjunto por ID y reintentos de Kev. |
| [Patrones de diseño](./pocs/design-patterns/README.md) | ¿Cómo integrar un motor de decisión sin darle autoridad de ejecución? | Contrato offline y pruebas de filtros, policy, abstención y afinidad. |

## Estructura

```text
src/       contrato y clientes compartidos (Jev, Laya, pool y dataset)
scripts/   preparación, runners, análisis, informe y generación del sitio
site/      fuentes a mano del sitio (hub y CSS); lo generado va a dist/site/
pocs/      una carpeta por experimento: README, WHY, plans, analysis y results
data/      contrato del JSONL de preguntas (los datos no se publican)
results/   scratch local de los runners, ignorado por git
docs/      documentación transversal (mapa de dónde vive cada cosa)
```

Dentro de una POC, `results/` **sí** se versiona: es la fuente del sitio. Para
publicar una corrida, escribe ahí los artefactos elegidos:

```powershell
npm run classify -- --out-dir pocs/jev-kev-laya/results
```

## Cómo reproducir

```powershell
npm ci
npm test                      # suite completa (tsx --test)
npx tsc --noEmit              # typecheck
npm run prepare               # regenera data/questions.jsonl desde WildChat-1M
$env:OPENROUTER_API_KEY = "sk-or-..."; npm run classify   # Jev, pool general
npm run classify:laya         # Laya local, necesita LAYA_URL o el endpoint por defecto
npm run report                # informe comparativo en results/report.html
npm run site                  # sitio completo en dist/site/
npm run audit                 # falla si hay una clave en el árbol versionado
```

Las corridas que invocan Jev/Kev por OpenRouter consumen credenciales y tienen
coste; no se ejecutan automáticamente ni desde CI. Los runners escriben por
defecto en `results/` (scratch); `--out-dir` o `RESULTS_DIR` lo cambian.

## Atribución y licencias

Este repositorio republica **resultados** derivados de WildChat-1M, no el
dataset. La muestra de preguntas (`data/questions.jsonl`) no se publica y se
regenera con `npm run prepare`:

> Contains information from WildChat-1M
> ([allenai/WildChat-1M](https://huggingface.co/datasets/allenai/WildChat-1M)),
> which is made available under the
> [ODC Attribution License](https://opendatacommons.org/licenses/by/1-0/).

Las medidas de estas POCs son disponibilidad, latencia, distribución de
elección, esfuerzo y acuerdo entre motores. El acuerdo **no** es exactitud: no
hay etiqueta de verdad sobre qué modelo debía resolver cada prompt.
