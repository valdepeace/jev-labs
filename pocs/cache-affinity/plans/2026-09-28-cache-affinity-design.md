# POC: afinidad de caché en el router de modelos

## Fase 1 (en curso): comparar estrategias de routing

## Pregunta

**¿Cuándo es más barato mantener un modelo por su caché que cambiar a otro más barato por
token?**

La caché de prompt está indexada por modelo (y por endpoint), no por conversación. Un router
que elige modelo en cada turno destruye la caché que el turno anterior acabó de pagar.

## Hipótesis

> En agentes de programación con grandes contextos reutilizables, elegir siempre el modelo
> aparentemente más barato para cada petición puede no ser la estrategia de menor coste
> total.

**No se acepta por defecto.** Las conclusiones tienen que salir de las condiciones medidas.

## Alcance de la fase 1

**Dentro:** un modelo de coste de caché con TTL en reloj, mínimo cacheable y contaminación
del prefijo; un ledger de estado explícito; cinco estrategias puras comparadas sobre los
mismos workloads; y el informe con tablas, timeline de sesión y ciclo de vida de la caché.

**Fuera (fase 2, opcional):** llamadas reales a OpenRouter para validar el modelo. Requiere
extender la telemetría de `src/classify.ts` y gastar crédito.

**Fuera (decidido):** RL, bandits y programación dinámica; un dashboard aparte; la
disposición de carpetas `/src/router/`, `/src/cache/` del prompt original.

## La calidad no entra en el objetivo

Este lab **no tiene etiqueta de verdad** de qué modelo debía resolver cada prompt: los
análisis de `jev-kev-laya` lo dicen explícitamente ("el acuerdo no es exactitud"). Por eso:

- La fase 1 es un **estudio de coste**. La calidad entra como **restricción asumida**
  (un turno exige un nivel mínimo de capacidad y solo se consideran modelos que lo cumplen).
- La dificultad del turno es un **supuesto declarado** del workload, no una medida. Los
  motores de decisión del lab (Jev, Kev) servirían como *proxy de dificultad* en una fase
  posterior, nunca como *medida de calidad*.
- La pregunta "¿compensa perder calidad?" **no se responde** con estos datos, y el informe
  lo dice.

## El modelo

```
prefijo_t   = P0 + Σ_{i<t} U_i                  # system + tools + historial
turno t:    lee   min(caché_dominio, prefijo_t)      a precio de lectura
            escribe (prefijo_t − leído)              a precio de escritura
            paga U_t a entrada completa, O_t a salida
            + almacenamiento, si el proveedor lo cobra
después:    caché_dominio = prefijo_{t+1}       # dominio = proveedor:modelo:hash
```

Reglas que reproducen el problema real:

- **La caché es por dominio**, no por conversación: cambiar de modelo o de endpoint estrena
  linaje. Volver a un dominio cuya entrada sigue viva **sí** reutiliza caché — el problema no
  es `cambio = pérdida`, es `cambio + tiempo + mutación del prefijo`.
- **La entrada caduca por reloj**, no por turnos: `ttlSeconds` frente al tiempo transcurrido.
  Un turno lento o una pausa del usuario matan la caché igual que un cambio de modelo.
- **Por debajo de `cacheMinTokens` no hay caché.** Los mínimos reales van de 512 a 32.768
  tokens según proveedor y modelo: en prompts cortos el routing por turno es gratis.
- **La contaminación del prefijo invalida todo.** Un turno marcado como volátil (un diff, una
  salida de tests, un timestamp antes del breakpoint) tira **todas** las entradas, también
  las del modelo fijo.

## Estrategias comparadas

| # | Estrategia | Criterio | Mira la caché |
| --- | --- | --- | --- |
| A | `fixed` | siempre el mismo modelo | — |
| B | `cheapest` | el más barato elegible por precio de lista | no |
| C | `quality` | el más barato que cubre la capacidad exigida, ponderando latencia declarada | no |
| D | `cacheAware` | coste proyectado del turno con el ledger, más el crédito por renovar una caché viva | sí |
| E | `warmOrSwitch` | regla de dos líneas: quédate mientras tu caché esté viva, si no cambia al más barato | sí |

La estrategia E existe para poner a prueba la D: si una regla simple captura casi todo el
beneficio, la heurística ponderada no se justifica.

## Ratios y precios

En múltiplos del precio base de entrada, que es el dato que documenta cada proveedor:

| Ratio | Anthropic (5 min) | Escritura gratuita (OpenAI, Gemini) |
| --- | --- | --- |
| lectura de caché | 0.1× | 0.1× |
| escritura de caché | 1.25× | 1.0× |

Las cifras que sostienen las conclusiones son **adimensionales** (múltiplos de coste, turnos
de amortización, tasa de acierto). La columna en dólares usa un precio base declarado.

## Huecos declarados

- **Almacenamiento de Gemini** (`$/Mtok/hora` en caché explícita): no se modela. Sus números
  son de otro modo de caché y no se han verificado contra una cuenta real.
- **TTL largo de Anthropic** (1 hora, escritura a 2×): no se modela; el modelo tiene un solo
  multiplicador de escritura.
- **Tasa de acierto real del proveedor**: el modelo la *impone*; nadie puede observarla antes
  de la petición. El router solo puede llevar su propio registro.
- **Coste de las llamadas al clasificador:** fuera del modelo.

## Éxito

- Cada cifra del informe se recalcula desde el JSONL versionado.
- `npm test` cubre la aritmética, las políticas, el TTL, el mínimo cacheable y la contaminación.
- El build del sitio no necesita credenciales.
