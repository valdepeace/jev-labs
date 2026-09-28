# Por qué esta POC

## El motivo

El lab compara motores que eligen modelo por pregunta. El router de `crush` lo hace **por
mensaje de usuario**: `internal/router/decide.go` construye las preguntas en cada mensaje y
`coordinator.go` aplica el override si la confianza supera `1/poolSize` — con un pool de 16
ese suelo es 0,0625, y en las corridas publicadas de este lab **300 de 300 decisiones lo
superan**, así que el router cambiaría de modelo en todos los turnos.

Ese diseño choca con una propiedad de los proveedores que no está en el código: **la caché de
prompt está indexada por modelo y por endpoint**. Al cambiar de modelo, el prefijo cacheado no
se puede leer, y el turno nuevo lo paga entero a precio de escritura.

Los ahorros que el fork reporta (`RouterSavings`) comparan el uso real contra el modelo más
caro del pool, pero **nunca cobran la escritura que provoca el cambio**. El número sale
optimista de forma estructural.

## La hipótesis, y qué pasó con ella

> En agentes con grandes contextos reutilizables, elegir siempre el modelo aparentemente más
> barato para cada petición puede no ser la estrategia de menor coste total.

**Confirmada en una banda estrecha, refutada fuera de ella.** Con un baseline honesto, el
router que siempre elige el más barato **gana en coste** en casi todos los workloads
(0,46×–0,63× frente al modelo fijo), porque el ahorro por token supera la penalización de
reescribir el prefijo. El router consciente de la caché solo gana mientras los candidatos
estén dentro de ~3× de precio entre sí (9 de 11 tramos medidos).

Tres hallazgos que no esperaba y que cambiaron el diseño:

1. **El enemigo no es el cambio de modelo, es el TTL.** Un turno que tarda más que la ventana
   de caché pierde el prefijo igual que un cambio de modelo: la tasa de acierto pasa del 90%
   al 0% entre 60 s y 150 s por turno. El modelo se tuvo que reescribir para correr en reloj
   en vez de en turnos.
2. **La contaminación del prefijo no es una pérdida permanente.** Un diff o una salida de
   tests por delante del breakpoint tiran todas las entradas, pero el prefijo contaminado se
   vuelve a cachear: cuesta una reescritura por evento, no un cambio de régimen.
3. **Una regla de dos líneas iguala a la heurística.** «Quédate mientras tu caché esté viva,
   si no cambia al más barato» empata con la heurística de horizonte en todos los workloads.
   Cualquier heurística ponderada con pesos configurables tiene que justificarse contra eso.

Igual de importante: **el problema solo existe si el router es inestable.** Con un mapeo
determinista de dificultad a modelo, los linajes se revisitan dentro del TTL y las cachés se
mantienen tibias solas. Lo que destruye la caché es que la elección varíe por razones que no
son la dificultad — reparto de carga, salud de proveedor, ruido de confianza—, que es
exactamente lo que hace un gateway real.

## No-objetivos

- **No mide la caché real del proveedor.** La impone él; aquí se modela con sus ratios
  documentados y el TTL como supuesto declarado.
- **No mide calidad.** No hay etiqueta de verdad de qué modelo debía resolver cada prompt.
  La calidad entra como restricción asumida (capacidad mínima por turno), nunca como medida.
- **No llama a OpenRouter.** Cero credenciales, cero coste, entra en CI.
- **No toca `crush`.** La evidencia son el modelo y el informe, no un parche en el fork.
- **No implementa RL ni bandits.** El problema es un MDP (la decisión de hoy cambia el estado
  de mañana), pero con un horizonte de un paso y una regla de permanencia se captura casi todo
  el valor: el estudio lo demuestra midiendo que E iguala a D en 5 de 6 workloads.

## Lo que sostiene las conclusiones

Las cifras adimensionales: múltiplos de coste, tasas de acierto y turnos de amortización. La
columna en dólares usa un precio base declarado solo para dar escala, porque los ratios de
caché —escritura 1,25×, lectura 0,1×— son lo que decide el resultado. Todos los supuestos que
cambiarían la conclusión están en la tabla de método y límites del informe.
