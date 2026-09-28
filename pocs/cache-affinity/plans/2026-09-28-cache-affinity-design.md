# POC: afinidad de caché en el router de modelos

## Pregunta

**¿Cuánto cuesta cambiar de modelo a mitad de sesión, y a partir de qué diferencia de
precio amortiza?**

La caché de prompt del proveedor está indexada por modelo. Un router que elige modelo
en cada turno destruye, en cada cambio, la caché que el turno anterior acabó de pagar.
Esta POC mide ese sobrecoste y la condición bajo la que el cambio compensa.

## Alcance

**Dentro:** un modelo de coste de caché por turno, determinista y sin red; los
escenarios que ilustran el acantilado; y el informe con tablas y gráficos que se
publica en el sitio.

**Fuera:** llamadas reales a OpenRouter (enfoque B, validación manual posterior),
cambios en `E:\workspace\personal\crush`, y cualquier medición de la tasa de acierto
real del proveedor. Esa tasa la fija el proveedor; aquí se modela.

## El modelo

Una sesión de agente de código tiene un prefijo estable (system prompt + definiciones
de herramientas + historial) que se reenvía en cada turno, y un delta nuevo por turno.

```
prefijo_t   = P0 + Σ_{i<t} U_i            # el historial crece con lo ya enviado
turno t:    lee   min(caché[m], prefijo_t)      a precio de lectura
            escribe (prefijo_t − leído)         a precio de escritura
            paga U_t a precio de entrada completo
            paga O_t a precio de salida
después:    caché[m] = prefijo_{t+1}       # por modelo: cada modelo tiene su linaje
```

Reglas que hacen que el modelo reproduzca el problema real:

- **La caché es por modelo.** Entrar en un modelo sin caché caliente se paga a precio de
  escritura sobre todo el prefijo, no sobre el delta.
- **La caché caduca.** `cacheTtlTurns` de inactividad por modelo; por defecto el TTL de
  5 minutos de Anthropic, expresado en turnos.
- **Las escrituras no se amortizan si vuelves a cambiar.** Si el router cambia otra vez
  antes de que el turno amortice, la escritura anterior se tira.

## Ratios y precios

Todo se expresa en **múltiplos del precio base de entrada**, que es lo que documenta
cada proveedor, en vez de inventar precios por modelo:

| Ratio | Anthropic (5 min) | Proveedor con escritura gratuita |
| --- | --- | --- |
| lectura de caché | 0.1× | 0.1× |
| escritura de caché | 1.25× | 1.0× |
| salida | por modelo | por modelo |

El informe reporta principalmente medidas **adimensionales** (coste en frío / coste en
tibio, múltiplo acumulado, turnos de amortización). La columna en dólares usa un
`inputUsdPerMTok` declarado y editable, solo para dar escala.

## Escenarios

1. **Modelo fijo** — una sola entrada de caché, se calienta y se mantiene.
2. **Cambio cada turno** — dos modelos alternándose; ninguna caché llega a calentarse.
3. **Cambio una vez y me quedo** — el caso al que aspira un router con afinidad.
4. **Barrido de factor de precio** `f` (1.0, 0.8, 0.5, 0.2, 0.1) — turnos de
   amortización frente al acantilado.
5. **Mismo modelo, distinto endpoint** — mismo precio, otra caché: pérdida pura, sin
   ahorro que la compense.

## Entregables

- `cache-cost.ts` — el modelo, puro y sin red.
- `run-simulation.ts` — escribe `results/simulation.jsonl` (versionado: es la fuente del
  informe, y permite recalcular cada número).
- `report.ts` — tablas y gráficos SVG a mano (sin dependencias), una página del sitio.
- Entrada en `scripts/pocs.ts` y en el hub.

## Éxito

- Cada cifra del informe se recalcula desde el JSONL versionado.
- `npm test` cubre la aritmética: turno tibio vs frío, caducidad, amortización.
- El build del sitio no necesita credenciales ni `data/questions.jsonl`.
