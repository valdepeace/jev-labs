# Análisis: pool por nivel dentro de cada proveedor

**Muestra:** primeras 100 preguntas del dataset WildChat de programación.
**Pool:** nueve opciones: modelos expensive/medium/cheap de Anthropic, OpenAI y Google.
**Corridas:**

- Jev vía OpenRouter: `../results/benchmark-tiers-2026-09-27T17-20-00Z.jsonl` — 100/100 correctas.
- Laya local: `../results/laya-tiers-2026-09-27T17-20-00Z.jsonl` — 100/100 correctas.
- Comparativa: generada con `npm run report` (no versionada).

Los grupos de longitud usan `<200` caracteres para short, `200–999` para medium y `>=1000` para long. Es una aproximación, no una etiqueta de dificultad; `reasoning_effort` es la valoración del propio clasificador.

## Elecciones por proveedor y backend

| Backend | Proveedor | Cheap | Medium | Expensive |
|---|---|---:|---:|---:|
| Jev | Anthropic | 2 Haiku | 49 Sonnet | 0 Opus |
| Jev | OpenAI | 0 Luna | 35 GPT-6 Sol | 13 GPT-6 Astra |
| Jev | Google | 0 Flash Lite | 1 Gemini 3.8 Flash | 0 Gemini 3.1 Pro |
| Laya | Anthropic | 0 Haiku | 5 Sonnet | 0 Opus |
| Laya | OpenAI | 0 Luna | 0 GPT-6 Sol | 50 GPT-6 Astra |
| Laya | Google | 0 Flash Lite | 0 Gemini 3.8 Flash | 45 Gemini 3.1 Pro |

## ¿El nivel cambia con la longitud o el esfuerzo?

### Jev

- **Anthropic:** eligió el tier medio 49 veces y el cheap 2 veces; nunca eligió Opus. Las dos elecciones cheap se dividieron entre una pregunta short y una long, así que no aparece una preferencia consistente por Haiku para preguntas cortas.
- **OpenAI:** GPT-6 Astra (expensive) apareció 13 veces: 12 en preguntas long y una medium; ninguna short. Ocho de esas 13 recibieron `high`, mientras cinco recibieron `low`. GPT-6 Sol (medium) se eligió 35 veces y sí cubrió long (15), medium (10) y short (10). Es una señal parcial de asociación entre Astra y mayor longitud, no una regla clara de dificultad.
- **Google:** solo hubo una elección: Gemini 3.8 Flash (medium) para una pregunta short con esfuerzo `medium`. No permite comparar tiers del proveedor.

Jev sí seleccionó el tier barato, pero solo Haiku y en dos preguntas. No eligió GPT-6 Luna ni Gemini Flash Lite. Las pocas elecciones Astra se inclinaron hacia preguntas largas, aunque el pool no produjo evidencia suficiente para afirmar una política estable de tier según dificultad.

### Laya

- **Anthropic:** las cinco elecciones fueron Sonnet (medium), todas para preguntas long con esfuerzo `medium`.
- **OpenAI:** las 50 elecciones fueron GPT-6 Astra (expensive). Hubo 18 preguntas long, 17 medium y 15 short; las 50 recibieron esfuerzo `medium`.
- **Google:** las 45 elecciones fueron Gemini 3.1 Pro (expensive): 30 long, 8 medium y 7 short. El esfuerzo fue `medium` en 44 y `high` en una.

Laya no eligió ningún tier barato ni para preguntas cortas ni para largas. Dentro de OpenAI y Google seleccionó siempre el modelo expensive sin importar la longitud observada; para Anthropic eligió Sonnet. En esta muestra se ve una preferencia fija de modelo por proveedor, no sensibilidad clara al nivel de precio o a la longitud.

## Acuerdo, confianza y coste temporal

- Coincidencia de modelo: 14/100 (14%).
- Coincidencia de esfuerzo: 52/100 (52%).
- Confianza de modelo menor que 0,5: Jev 48/100; Laya 100/100.
- Fiabilidad: ambos 100/100.
- Latencia media: Jev 271 ms; Laya 4.664 ms. Mediana: 267 ms y 3.748 ms, respectivamente.

## Conclusión y límite

En este pool controlado, Jev muestra alguna variación por tier, principalmente al escoger Astra para prompts largos, pero casi no prueba los modelos baratos. Laya concentra OpenAI y Google en sus tiers expensive y no varía la selección por longitud. El patrón apunta más a preferencias del clasificador por proveedor/modelo que a una selección de coste calibrada por dificultad.

La muestra es exploratoria (100 preguntas) y la longitud solo aproxima dificultad. Además, no se ejecutaron las tareas de programación con los modelos elegidos; estos datos evalúan decisiones de enrutamiento, no calidad final ni ahorro real. Los tiers de proveedores chinos quedan diferidos; el alcance de esta fase está definido en `../plans/2026-09-27-model-pool-refresh-and-provider-tiers.md`.
