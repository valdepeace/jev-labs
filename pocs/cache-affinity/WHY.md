# Por qué esta POC

## El motivo

El lab compara motores que eligen modelo por pregunta. El router de `crush` lo hace **por
mensaje de usuario**: `internal/router/decide.go` construye las preguntas en cada mensaje y
`coordinator.go` aplica el override si la confianza en la elección supera `1/poolSize`.

Ese diseño choca con una propiedad de los proveedores que no está en el código: **la caché
de prompt está indexada por modelo**. Al cambiar de modelo, el prefijo cacheado del modelo
anterior no se puede leer, y el nuevo turno paga el prefijo completo a precio de escritura.

Los ahorros que el router reporta (`RouterSavings` en `coordinator.go`) comparan el uso real
contra el modelo más caro del pool, pero **nunca cobran la escritura de caché que provoca el
cambio**. El número que sale es estructuralmente optimista y, en el peor caso, de signo
contrario al real.

## La hipótesis que se quería poner a prueba

Que el cambio de modelo en caliente sea caro. Resultó ser más matizado:

- **Confirmado para pools grandes.** Con un pool tan grande como la ventana del TTL, ninguna
  visita encuentra la entrada fresca y el coste se satura en ~5× sin ninguna lectura de caché.
- **Refutado para pools pequeños.** Con dos modelos alternos cada uno se revisita dentro del
  TTL, ambos linajes siguen tibios y el sobrecoste es de 1,48×, no 5×. El enemigo no es
  cambiar de modelo: es cambiar de modelo hacia un linaje que ya ha caducado.
- **El caso peor no es el cambio de tier, es el cambio lateral.** Mismo precio y otra entrada
  de caché (el mismo modelo en otro endpoint, o dos modelos del mismo tier) es pérdida pura:
  hay reescritura y no hay ahorro que la amortice, nunca.

## No-objetivos

- **No mide la caché real del proveedor.** La fija el proveedor; aquí se modela con sus
  ratios documentados y se declara el TTL como supuesto explícito.
- **No llama a OpenRouter.** Cero credenciales y cero coste; el informe entra en CI.
- **No toca `crush`.** La evidencia de esta POC es el modelo y el informe, no un parche en el
  fork. Lo que se deduce para el fork son condiciones de decisión, no código.
- **No juzga la calidad del routing.** Mide el suelo de coste que un cambio tiene que superar
  para pagarse; puede seguir siendo la decisión correcta por otras razones.

## Lo que sostiene la conclusión

Las cifras adimensionales: el múltiplo de coste frente a la sesión fija, los turnos de
amortización frente al cociente de precios, y el punto exacto de saturación. La columna en
dólares usa un precio base declarado y editable, solo para dar escala, porque los ratios de
caché —que son los que documenta el proveedor— son lo que decide el resultado.
