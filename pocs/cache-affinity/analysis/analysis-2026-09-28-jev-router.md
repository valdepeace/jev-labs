# Análisis: ¿es efectivo un router de modelos hecho con Jev? (2026-09-28)

**La pregunta real del lab.** El resto del estudio mide coste de caché; esto lo traduce a la
decisión que se quiere tomar: si merece la pena que Jev gobierne qué modelo atiende cada turno.

**Respuesta:** Jev sirve para **elegir tier y esfuerzo**, y sirve sobre todo para **decidir
cuándo no cambiar**, pero **no** sirve como selector de modelo por turno sobre un pool ancho.
Y no puede resolver el problema de caché porque no lo ve: el estado de caché no es observable y
no está en su entrada.

Fuentes: `../results/simulation.jsonl` (este POC) y los resultados publicados de
`../../jev-kev-laya/results/` (corridas reales de Jev y Kev sobre 300 preguntas).

## 1. La aritmética que enmarca todo

| | Coste |
| --- | ---: |
| Una decisión de Jev (~600 tokens de entrada a $0,042/M) | $0,0000252 |
| Penalización de caché que puede provocar (prefijo de 50K) | **$0,0875** |
| La misma con prefijo de 100K | **$0,1750** |

El coste del router es **3.500 a 6.900 veces menor** que la penalización que puede disparar. El
problema nunca es lo que cuesta preguntarle a Jev: es lo que cuesta hacerle caso.

## 2. La calidad de la decisión, medida

De las 296 decisiones emparejadas por ID entre Jev y Kev sobre el mismo pool de 16 modelos:

| Medida | Valor |
| --- | ---: |
| Coinciden en el modelo elegido | **58/296 = 19,6%** |
| Coinciden en el esfuerzo de razonamiento | 181/296 = 61,1% |
| Modelos distintos que Jev llegó a elegir | 7 de 16 |
| Concentración en los dos primeros (`claude-sonnet-5`, `gpt-6-sol`) | 256/300 = 85% |
| `modelConfidence`: media / mediana | 0,519 / 0,520 |
| Decisiones que superan el suelo `1/poolSize = 0,0625` | **300/300 = 100%** |
| `modelConfidence` por debajo de 0,5 | 126/300 = 42,0% |

Dos lecturas que deciden el diseño:

1. **La elección de modelo es casi ruido respecto al prompt.** Dos motores tipados, la misma
   pregunta y el mismo pool coinciden una de cada cinco veces. Si fuera una función estable del
   prompt, convergerían. Es decir: la elección está dominada por la idiosincrasia del motor.
   El esfuerzo, en cambio, coincide el 61% — la dificultad sí es una propiedad del prompt.
2. **El suelo de confianza no filtra nada.** Con un pool de 16 el suelo es 0,0625 y lo superan
   **todas** las decisiones, incluidas las que están por debajo de 0,5. El gate no distingue
   una decisión informada de una moneda al aire: solo descarta el ruido puro por debajo de 1/16.

## 3. Por qué eso es exactamente el peor régimen de caché

En este mismo estudio, el único perdedor claro entre seis routers es el que **selecciona de
forma inestable entre candidatos equivalentes**: repartir carga sin mirar la caché llega a
**3,99×** sin ganar un céntimo por token, porque no hay ahorro de precio que compense la
reescritura del prefijo.

Un router que elige entre 7 de 16 modelos con un 19,6% de acuerdo entre motores cae en ese
régimen. Y los dos modelos donde concentra el 85% de las decisiones pertenecen a la misma
banda —el tier "balanced" de dos proveedores—, que es precisamente la banda donde el estudio
mide que **la caché decide y el ahorro por token no paga la reescritura** (cruce entre 0,20× y
0,30× de cociente de precios).

## 4. Veredicto por uso

| Para qué decide Jev | ¿Efectivo? | Por qué |
| --- | --- | --- |
| `reasoning_effort` | **Sí, con reservas** | No cambia el linaje de caché, y la dificultad sí es del prompt (61% de acuerdo entre motores). Reserva: en algunos proveedores cambiar el esfuerzo fuerza relectura completa del prefijo. |
| Modelo por turno, pool ancho | **No** | Elección inestable (19,6%) y candidatos del mismo tier: se cae en el régimen de 3,99×. |
| Modelo por turno, salto de tier | **Sí** | Con el modelo nuevo ≥3× más barato la reescritura amortiza en ~3 turnos y el ahorro por token domina. |
| Decidir cuándo **no** cambiar | **Sí, y es el uso más valioso** | Es la pregunta que ningún router per-turno se hace, y es la que este estudio cuantifica. |

## 5. La puerta que falta

Jev **no puede** resolver el problema de caché porque no lo ve: ningún proveedor expone el
estado de caché antes de la petición, y la entrada de Jev es solo `state` (el texto). Inyectarle
un resumen del ledger sería pedirle a un clasificador que razone sobre un estado que no puede
verificar.

La forma efectiva es dejar que Jev proponga y que la caché disponga:

```text
¿hay caché tibia en el modelo actual?
├─ no  → aplicar la decisión de Jev sin restricción. No hay nada que perder.
└─ sí  → ¿el modelo propuesto es ≥3× más barato?
         ├─ no  → no cambiar. Es la banda en la que la caché decide.
         └─ sí  → cambiar y comprometerse a permanecer ≥3 turnos.
```

Corolario operativo: el router debería ser **agresivo justo después de una caducidad** y
**conservador mientras la caché esté tibia**. Hoy decide igual en los dos casos.

## 6. Dónde encajaría en `crush`

| Punto | Cambio |
| --- | --- |
| `internal/agent/coordinator.go:552` (gate de aplicación) | Añadir la condición de caché: no aplicar el override si el linaje actual está tibio y el nuevo no es claramente más barato |
| `internal/router/decide.go` | La decisión de esfuerzo puede aplicarse siempre; la de modelo necesita el ledger de sesión |
| `RouterSavings` (`coordinator.go:411-421`) | Cobrar la escritura de caché que provoca el cambio. Hoy el contrafactual no la incluye, así que el número que ve el usuario es optimista por construcción |
| `EffectiveMinModelConfidence` (`internal/config/config.go:538`) | El suelo `1/poolSize` deja pasar el 100% de las decisiones. Subirlo no arregla el coste por sí solo, pero un suelo de 1/poolSize no filtra nada |

## 7. Lo que sigue sin saberse

**No hay evidencia de que la elección de Jev sea buena.** El 19,6% de acuerdo entre motores dice
que la decisión es inestable, no que sea incorrecta: sin etiqueta de verdad de qué modelo debía
resolver cada prompt, no se puede medir acierto. Así que la respuesta completa es:

> Router de Jev **para coste**: sí, con la puerta de caché y limitado a saltos de tier.
> Router de Jev **para calidad**: sin evidencia en este lab.

Y la línea que resume el estudio entero: **un router que decide por turno no elige entre
precios de modelo, elige entre precios de modelo tibios y precios de modelo fríos.**
