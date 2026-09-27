# Prompt: seguir esta POC

Pega esto (o pásaselo tal cual a un agente/sesión de Claude nueva) pa continuar
la implementación desde donde se dejó.

---

Quiero que implementes una POC en `E:\workspace\personal\poc-jev-agent-coder`
(ya tiene el scaffolding preparado — lee `README.md` y `docs/research-datasets.md`
antes de nada).

## Objetivo

Probar el clasificador **Jev** (`~typesafe/jev-latest` vía OpenRouter, contrato
"System One" — `client.alpha.decisions.create`) contra un **listado grande de
preguntas reales de programadores** (no preguntas sintéticas de examen, sino
prompts reales que developers le hacen a un asistente de IA mientras
programan), pa ver:

1. Qué modelo recomienda Jev pa cada pregunta (`model_choice`), con un **pool
   de modelos mucho más ancho que los 3 que usábamos hasta ahora** — mínimo
   10-15 modelos cubriendo varias familias/tiers (flagship, balanceado,
   rápido/compacto) de Anthropic, OpenAI, Google y algún open-weight
   (Meta Llama, etc.).
2. Qué reasoning effort recomienda (`reasoning_effort`: low/medium/high).
3. Si el patrón de elección de Jev tiene sentido según el TIPO de pregunta
   (debug rápido vs. diseño de arquitectura vs. "cómo hago X en el lenguaje
   Y" vs. pregunta ambigua/larga), y si hay preguntas donde la confianza es
   baja o el resultado parece ruido.

Esto es continuación directa del trabajo de:

- `E:\workspace\personal\jev\poc\jev-triage-ts` — la POC hermana: mismo stack
  (Node + TS + `@openrouter/sdk`), mismo contrato System One. Reutiliza su
  `src/providers.ts` (cliente genérico) y su forma de llamar a
  `client.alpha.decisions.create` (ver `src/support-router.ts` de esa POC
  pa ver el patrón exacto de preguntas `choice`/`score`/`noul`).
- `E:\workspace\personal\crush\internal\router\decide.go` — la
  implementación en Go, en producción, de exactamente esta misma idea
  (`BuildQuestions`, `reasoningLevels`, `modelFamilyDescriptions`). Esa
  tabla de descripciones por familia de modelo (sacada de models.dev) es un
  buen punto de partida pa las descripciones que necesita `model_choice`
  como criteria — amplíala, no la reinventes desde cero.

## Lo que YA está preparao en esta carpeta

- `package.json`, `tsconfig.json`, `.env.example` — mismo stack que
  `jev-triage-ts` (Node + TS + `@openrouter/sdk`, `tsx` pa dev).
- `src/models.ts` — pool de modelos ampliao (stub con ~15 candidatos y sus
  descripciones, sacao de la tabla de `crush/internal/router/decide.go` +
  algunos más) — revísalo, complétalo o pódalo según lo que tengas
  disponible en tu cuenta de OpenRouter.
- `src/classify.ts` — stub del cliente que llama a Jev con
  `reasoning_effort` + `model_choice`, siguiendo el contrato de
  `jev-triage-ts/src/providers.ts` y `support-router.ts`.
- `src/dataset.ts` — interfaz `Question { id, text, source, tags? }` y un
  loader stub que lee de `data/questions.jsonl` (formato JSON Lines, una
  pregunta por línea).
- `docs/research-datasets.md` — candidatos reales ya investigaos (Kaggle +
  HuggingFace) pa la base de datos de preguntas. **Falta**: descargar el
  dataset elegido, filtrarlo a preguntas de programación, y volcarlo a
  `data/questions.jsonl`.

## Lo que falta hacer

1. **Conseguir el dataset.** Empieza por los candidatos de
   `docs/research-datasets.md` (LMSYS-Chat-1M tiene mirror en Kaggle;
   WildChat-1M está en HuggingFace). Si ninguno convence, sigue buscando en
   Kaggle/GitHub/HuggingFace — el criterio es: preguntas REALES hechas por
   humanos a un asistente de IA (no exámenes ni katas), en contexto de
   desarrollo de software. Filtra por idioma/tema si el dataset es
   multi-dominio (LMSYS y WildChat lo son — hay que quedarse solo con los
   turnos que son preguntas de programación).
2. **Muestreo.** No hace falta correr el millón de conversaciones contra
   Jev — define un tamaño de muestra razonable (unos cientos, estratificao
   por tipo de pregunta si puedes) y documenta el criterio de muestreo.
3. **Completar `src/classify.ts` y `src/models.ts`** con el pool de modelos
   definitivo y las llamadas reales a Jev.
4. **Correr la clasificación** sobre la muestra y volcar resultados (modelo
   elegido, confianza, reasoning effort, confianza) a un CSV/JSON pa
   analizar — un script en `scripts/` tipo `run-benchmark.ts`
   (`jev-triage-ts` ya tiene un patrón parecido en `run-benchmark.ts`,
   puedes mirarlo de referencia aunque no es exactamente lo mismo).
5. **Análisis.** Agrupar resultados por tipo de pregunta / lenguaje /
   longitud, ver si Jev distribuye sensatamente entre el pool ampliao o si
   colapsa siempre en 2-3 modelos favoritos, y si la confianza de
   `model_choice` decae según crece el pool (esto es justo lo que motivó el
   `MinModelConfidence` floor en `crush/internal/router` — repasa
   `docs/superpowers/plans/2026-09-26-router-summary.md` de ese repo si
   quieres el contexto completo de por qué existe ese floor).

## Notas

- Necesitas `OPENROUTER_API_KEY` (mismo que usa `jev-triage-ts`).
- No hay presupuesto ilimitao de llamadas a Jev — pregunta antes de lanzar
  una corrida grande si el tamaño de muestra sube de unos pocos cientos.
- Sigue el estilo de comentarios y estructura de `jev-triage-ts`: comentarios
  solo donde aporten contexto no obvio, sin over-engineering.
