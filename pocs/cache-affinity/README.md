# POC: afinidad de caché en el router de modelos

**Pregunta:** ¿cuándo es más barato mantener un modelo por su caché que cambiar a otro más
barato por token?

**Respuesta corta:** depende de dos cosas que no son el router — **el ancho de la brecha de
precios** y **si el linaje se revisita antes de que caduque el TTL**. Mantener la caché gana
mientras los modelos alternativos estén dentro de ~3× de precio; con brechas mayores, el
router que siempre elige el más barato gana en coste aunque destrocé la caché. Y con un
turno que tarde más que el TTL, la caché se pierde igual: el acantilado medido es **5,72×**.

## Los cinco routers

| # | Estrategia | Mira la caché | Repo grande (100K) | Repo medio (40K) | Con pausas |
| --- | --- | --- | ---: | ---: | ---: |
| A | Modelo fijo (cubre el pico) | — | 1,00× | 1,00× | 1,00× |
| B | El más barato por petición | no | **0,60×** | **0,63×** | **0,46×** |
| C | Calidad con margen de seguridad | no | 0,94× | 0,97× | 0,95× |
| D | Consciente de la caché | sí | 1,02× | 1,02× | 0,44× |
| E | Regla de dos líneas | sí | 1,02× | 1,02× | 0,44× |

Múltiplo del coste frente al modelo fijo (menos es mejor). **D y E empatan en todos los
workloads**: una regla de dos líneas —«quédate mientras tu caché esté viva, si no cambia al
más barato»— captura todo el beneficio de la heurística ponderada. Ese es el resultado más
incómodo del estudio, y está medido, no supuesto.

D y E compran otra cosa que el coste: **93% de acierto de caché frente al 90% de B, y 1
cambio de modelo frente a 21**. En una sesión real eso es latencia y previsibilidad.

## Las condiciones

**1 · La brecha de precios decide.** Con el nivel intermedio al mismo precio que el
pico, cambiar de modelo por dificultad no ahorra nada y solo paga reescrituras:

| Precio del nivel trivial | B barato | B' balanceo | D cache-aware | Gana |
| --- | ---: | ---: | ---: | --- |
| 1,00× | 1,49× | 1,50× | **1,19×** | cache-aware |
| 0,50× | 1,28× | 1,31× | **1,19×** | cache-aware |
| 0,30× | 1,20× | 1,24× | **1,19×** | cache-aware |
| 0,20× | **1,16×** | 1,20× | 1,19× | el más barato |
| 0,10× | **1,12×** | 1,16× | 1,19× | el más barato |

El cruce está entre 0,20× y 0,30×: **el router consciente de la caché gana 9 de los 11
tramos**, y pierde en cuanto el ahorro por token supera la penalización.

**2 · El TTL manda, y no es lineal.** Dos modelos alternos, prefijo de 40K, TTL de 5 min:

| Ritmo entre turnos | Acierto de caché | Coste |
| --- | ---: | ---: |
| 10 s | 90% | 1,15× |
| 60 s | 90% | 1,15× |
| **150 s** | **0%** | **5,72×** |
| 30 min | 0% | 5,72× |

No hay degradación gradual: o el linaje se revisita dentro de la ventana, o no se reutiliza
nada. Y esto lo sufre igual un modelo fijo, porque el TTL corre en reloj, no en turnos.

**3 · El tamaño del pool engaña.** Lo que importa es el tiempo entre revisitas:

| Patrón | Coste | Acierto |
| --- | ---: | ---: |
| `A A A A A A` | 1,00× | 97% |
| `A B B B A` | 1,08× | 93% |
| `A B A B A B` | 1,09× | 93% |
| `A A B A A` | 1,12× | 93% |
| `A B C A B C` | 1,31× | 90% |
| `A B C D A` | **2,10×** | 83% |

**4 · Por debajo del mínimo cacheable, el routing por turno es gratis.** Con 500 tokens de
contexto alternar modelos cuesta 1,07× frente a quedarse; con 150K, 1,29×. Los mínimos reales
van de 512 a 32.768 tokens según proveedor y modelo.

**5 · La contaminación del prefijo cuesta una reescritura, no una pérdida.** Un diff o una
salida de tests por delante del breakpoint tiran todas las entradas, incluidas las del modelo
fijo. Pero el prefijo contaminado **se vuelve a cachear**: el coste es una reescritura por
evento. En el workload intensivo en tools el acierto de B cae al 43%.

**6 · Cuándo amortiza cambiar de modelo.** La reescritura se recupera cuando el modelo nuevo
es claramente más barato, y antes si el proveedor no cobra la escritura:

| Modelo nuevo | Escritura al 1,25× | Escritura gratuita |
| --- | ---: | ---: |
| mismo precio | nunca | nunca |
| 20% más barato | 32 turnos | 27 |
| la mitad | 8 turnos | 6 |
| un quinto | 2 turnos | 2 |
| un décimo | 0 (el turno frío ya gana) | 0 |

## Las 12 preguntas del estudio

| # | Pregunta | Respuesta medida |
| --- | --- | --- |
| 1 | ¿Cuánto contexto hace falta para que la caché domine? | El mínimo cacheable del proveedor (~1.024 tokens aquí). Por debajo, el cambio de modelo no cuesta nada; por encima, crece con el prefijo. |
| 2 | ¿Cuánto más barato debe ser el otro modelo? | Con prefijo largo, la mitad de precio amortiza en 8 turnos; un 20% más barato tarda 32. A igual precio, nunca. |
| 3 | ¿Qué impacto tiene el TTL? | **El mayor de todos.** Es el único factor que lleva la tasa de acierto a cero de golpe. |
| 4 | ¿Cuánto afecta la frecuencia del usuario? | Entre 60 s y 150 s por turno con TTL de 5 min se pasa del 90% al 0% de acierto. |
| 5 | ¿Cuándo tiene sentido renovar una caché? | Cuando hacerlo evita una reescritura futura y el turno no cuesta mucho más. Un cache read **ya renueva el TTL gratis**, así que quedarse en un modelo tibio casi siempre lo renueva. |
| 6 | ¿Varias cachés calientes a la vez? | Sí, y es barato: dos linajes alternos se mantienen tibios a 1,09× mientras las revisitas caigan dentro del TTL. |
| 7 | ¿Cuánto cuesta el cambio de modelo en una sesión? | Depende del patrón: 8%–110% del coste de una sesión fija en estos workloads; con el TTL agotado, 5,72×. |
| 8 | ¿Cuándo gana el modelo fijo? | Cuando los routers alternativos pagan capacidad o caché sin ganar nada: en el repo pequeño, C cuesta 3,00× por sobreaprovisionar calidad. |
| 9 | ¿Cuándo gana un router dinámico? | Cuando la brecha de precios es grande (>3×): 0,60× en el repo grande. |
| 10 | ¿Cuándo gana un router consciente de la caché? | Mientras los candidatos estén dentro de ~3× de precio, y siempre que un router inestable esté en juego. |
| 11 | ¿Cómo cambia en contextos de 50K–150K? | El múltiplo crece con el prefijo (1,07× a 1,29×) pero **no aparece un acantilado nuevo**: lo que cambia es el coste absoluto de cada reescritura. |
| 12 | ¿Compensa perder calidad? | **Sin respuesta.** Este lab no tiene etiqueta de verdad de qué modelo debía resolver cada prompt. |

## Reproducir

```powershell
npm run cache-affinity   # regenera results/simulation.jsonl
npm run site             # renderiza el informe en dist/site/cache-affinity/
npm test                 # 24 tests: aritmetica, ledger, politicas, informe
```

Sin credenciales y sin red. El informe se renderiza desde el JSONL versionado, así que cada
cifra se puede recalcular.

## Ficheros

| Fichero | Qué es |
| --- | --- |
| `cache-cost.ts` | El modelo: TTL en reloj, mínimo cacheable, contaminación, hook de política. |
| `ledger.ts` | Estado de caché explícito por `proveedor:modelo:hashDelPrefijo`. |
| `policies.ts` | Las cinco estrategias. |
| `sequences.ts` | Pool, patrones de revisita y workloads. |
| `scenarios.ts` | Comparación de estrategias y los cinco barridos. |
| `charts.ts` | Primitivas SVG: barras, líneas y timeline. |
| `report.ts` | El informe. |
| `plans/` | El diseño acordado antes de implementar. |

## Qué no mide

La **calidad** de la respuesta (no hay etiqueta de verdad en este lab: entra solo como
restricción asumida). La **tasa de acierto real** del proveedor: ningún API la expone antes
de la petición, así que el router solo puede llevar su propio registro. La **latencia y el
TTFT**. El **almacenamiento** de la caché explícita de Gemini y el **TTL largo** de Anthropic
(1 hora, escritura al 2×). El coste de las llamadas al clasificador.
