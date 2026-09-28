# Análisis: pool refrescado de 16 modelos

**Muestra:** 300 preguntas de programación de WildChat-1M, la misma muestra del primer benchmark.
**Pool:** 16 candidatos de Anthropic, OpenAI, Google, Meta y proveedores chinos (`src/models.ts`).
**Corridas:**

- Jev vía OpenRouter: `../results/benchmark-2026-09-27T14-44-37.993Z.jsonl` — 300/300 clasificaciones correctas.
- Laya local: `../results/laya-2026-09-27T14-44-37.980Z.jsonl` — 298/300 correctas, 2 fallidas.
- Informe HTML: generado con `npm run report` (no versionado).

## 1. La confianza de Jev sube; Laya sigue casi siempre por debajo de 0,5

| `model_confidence < 0.5` | Pool previo, 12 modelos | Pool refrescado, 16 modelos |
|---|---:|---:|
| Jev | 241/300 (80,3%) | 126/300 (42,0%) |
| Laya | 297/300 (99,0%) | 296/298 (99,3%) |

En Jev, la ampliación y actualización del pool coincidió con una caída importante de decisiones de baja confianza. La señal aún es baja en 42% de los casos, pero ya no domina la muestra. Laya se mantiene en el mismo patrón de confianza muy baja.

## 2. Jev usa siete modelos, aunque se concentra en dos

| Modelo | Casos | Porcentaje de clasificaciones válidas |
|---|---:|---:|
| Claude Sonnet 5 | 154 | 51,3% |
| GPT-6 Sol | 102 | 34,0% |
| GPT-6 Astra | 25 | 8,3% |
| Claude Opus 5.5 | 13 | 4,3% |
| Claude Haiku 4.5 | 4 | 1,3% |
| Gemini 3.8 Flash | 1 | 0,3% |
| Llama 4 Scout | 1 | 0,3% |

Sonnet 5 y GPT-6 Sol reúnen 85,3% de las decisiones. En la corrida anterior, Claude Sonnet 4 y GPT-4o reunían aproximadamente 86%. Cambió qué modelos ganan, pero el nivel de concentración de Jev es casi igual; añadir candidatos no repartió las elecciones de manera uniforme.

Laya eligió Gemini 3.1 Pro Preview en 248/298 resultados válidos (83,2%). GPT-6 Astra quedó segundo con 20 (6,7%); los otros diez modelos elegidos suman el 10,1% restante. Su distribución también colapsa en un único modelo.

## 3. El acuerdo entre clasificadores continúa casi nulo para el modelo

Sobre los 298 pares válidos para ambas decisiones:

| Decisión | Acuerdo |
|---|---:|
| Modelo | 4/298 (1,3%) |
| Esfuerzo de razonamiento | 145/298 (48,7%) |

El acuerdo de modelo mejora respecto a 1/300 (0,3%) de la corrida anterior, pero sigue siendo muy bajo. Los backends favorecen proveedores distintos: Jev elige principalmente Claude y OpenAI; Laya, Gemini. El esfuerzo de razonamiento permanece en un nivel similar al 48,7% anterior.

## 4. Latencia y fiabilidad

| Backend | Correctas | Fallidas | Media | Mediana | p95 |
|---|---:|---:|---:|---:|---:|
| Jev | 300/300 | 0 | 280 ms | 271 ms | 357 ms |
| Laya | 298/300 | 2 | 4.967 ms | 4.216 ms | 8.883 ms |

Las dos clasificaciones fallidas de Laya quedan fuera de las medidas de acuerdo y de la distribución de modelos; sí cuentan en latencia. En esta muestra, Laya tardó unas 17,7 veces más que Jev según la media.

## 5. Esfuerzo de razonamiento

- Jev: `medium` 150, `high` 92, `low` 58.
- Laya: `medium` 276, `high` 22, `low` 0, sobre 298 resultados válidos.

Jev mantiene variación entre los tres niveles. Laya no usó `low` y eligió `medium` en 92,6% de los resultados válidos.

## Conclusión

El pool refrescado reduce las clasificaciones de baja confianza de Jev y hace que el backend use más nombres de modelo, aunque las decisiones siguen concentradas en dos opciones. Laya conserva confianza baja y preferencia fuerte por Gemini. El acuerdo entre backends sobre el modelo (1,3%) no basta para tratar `model_choice` como una decisión estable entre sistemas; conviene conservarlo como señal y mantener un umbral de confianza si se usa para enrutar.

La corrida mide decisiones de enrutamiento sobre 300 prompts, no la calidad de las respuestas que producirían los modelos seleccionados. Los resultados describen esta muestra y estas versiones del pool, no una evaluación general de calidad.
