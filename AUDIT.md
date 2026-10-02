# Auditoría UX — Clarvex

**2 de octubre de 2026** · `/clarvex-audit` · commit `cb75b6d`

Flujos auditados: **Conteo**, **Checklist**, **Entrada** y **Cobro**. Nueve rutas,
comprobadas una por una contra `app/**/page.tsx` antes de escribir nada.

---

## ⚠️ Lo que esta auditoría NO es

**Sin clave de `uxuiprinciples.com`.** `UXUI_API_KEY` no está definida y su API
responde **403** sin ella. Eso significa:

| Herramienta | Qué se pudo hacer |
|---|---|
| `uxui-evaluator` | marco aplicado desde conocimiento interno, **sin** citas ni datos de impacto |
| `interface-auditor` | taxonomía de *smells* aplicada, **sin** las recetas completas |
| `flow-checker` | ⚠️ **NO se ejecutó**: exige nivel pro y no tiene modo libre |

**Todo hallazgo de aquí sale de leer el código**, no de la API. Cada uno lleva su
archivo y su línea para que se pueda comprobar. Lo que no pude verificar lo digo.

---

## Resumen

| | |
|---|---|
| Bloqueantes | **2** — ✅ los dos **cerrados** el 2 de octubre |
| Altas | 2 |
| Medias | 2 |
| Flujos limpios | Checklist, Entrada, Cobro |

⚠️ **Los seis hallazgos están en el flujo de CONTEO**, que es el que la tienda
camina a diario. Checklist, Entrada y Cobro salieron limpios en lo que esta
auditoría mira, y eso es lo que hace al resultado creíble: no es que todo esté
mal, es que un flujo se quedó atrás.

---

## ✅ B-1 · Cuatro pantallas de Conteos se quedan en «Cargando…» para siempre

**Severidad: bloqueante** · *silent-errors + dead-end-states* (feedback)

### Qué se ve

La persona abre Conteos, la señal del centro comercial parpadea —cosa que pasa a
diario— y la pantalla se queda en **«Cargando…»**. Sin mensaje, sin botón, sin
nada que tocar. No hay forma de distinguirlo de una carga lenta, así que se
espera. Y sigue esperando.

### Por qué pasa

La función que carga no tiene `catch`. Cuando `fetch` o `res.json()` lanzan, el
estado se queda en `null`, el render entra por la rama de «Cargando…» y **ahí se
queda**: no hay poll, no hay reintento y el rechazo se pierde como
*unhandled rejection*.

| Archivo | Línea | Qué deja colgado |
|---|---|---|
| `components/conteos/ConteosList.tsx` | 85 | la lista de conteos —la **entrada** del flujo |
| `components/conteos/ConteosMarbetes.tsx` | 35 | el alta de marbetes |
| `components/conteos/ConteoDiario.tsx` | 74 | el conteo diario de Dama |
| `app/conteos/marbetes/imprimir/page.tsx` | 25 | la vista de impresión |

⚠️ **Y ninguna reintenta por evento.** Comprobado: cero `visibilitychange` y cero
oyente de `online` en las tres. Guardar el teléfono y volver a sacarlo tampoco lo
arregla.

### Por qué importa

Esto ya se diagnosticó y se arregló en esta app —ver «Un fallo de RED no es *no
hay sesión*» en `CLAUDE.md`— y la solución quedó en `lib/use-session.ts`, que
reintenta **al volver a la app y al recuperar internet**. Ese patrón nunca llegó
a los componentes de Conteos. Es la misma lección que el documento ya escribió
tres veces: *la pregunta no es «¿está arreglado este camino?» sino «¿queda algún
camino abierto?»*.

### Remediación

1. Envolver las cuatro cargas en `try/catch` y guardar el fallo en estado.
2. Pintar, en vez de «Cargando…» eterno, **qué pasó y un botón de reintentar** —
   la app ya tiene el texto para esto: «Sin conexión. Intenta de nuevo.»
   (`ConteoDetail.tsx:451`).
3. Reintentar **por evento, nunca por temporizador**: al volver a la app y al
   recuperar red, como hace `useSession`. Un temporizador gasta batería sin
   ninguna señal de que algo cambió.
4. Añadir una prueba de patrón que recorra `components/conteos/**` y falle
   **nombrando** la carga que no tenga `catch`, al estilo de
   `tests/overlay-sobre-la-barra.test.ts`.

⚠️ `ConteoDetail.tsx:70` **sí** tiene su `catch`, con el motivo escrito: ahí un
poll reintenta solo. No copiar ese comentario a las otras cuatro — en ellas no
hay poll, así que ignorar el fallo deja la pantalla muerta.

---

## ✅ B-2 · «Abrir conteo de hoy» puede no hacer absolutamente nada

**Severidad: bloqueante** · *silent-errors* (feedback)

### Qué se ve

Gerencia toca el botón principal del flujo. El botón dice «Abriendo…», vuelve a
su estado normal… y no pasa nada. Ni conteo nuevo, ni mensaje, ni pista.

### Por qué pasa

`components/conteos/ConteosList.tsx:99-114` usa `try` / `finally` **sin `catch`**:

```js
try {
  const res = await fetch("/api/conteos", { method: "POST", ... });
  const data = await res.json();
  if (data.error) { setError(data.error); return; }
  if (data.id) router.push(`${base}/${data.id}`);
} finally {
  setCreating(false);          // ⚠️ repone el botón pase lo que pase
}
```

Dos caminos mudos:

- **Falla la red o el JSON** → lanza, el `finally` repone el botón y nadie se
  entera.
- **La respuesta no trae `id` ni `error`** → no entra en ninguna rama. Silencio.

### Por qué importa

Es la acción principal de la pantalla principal del flujo más usado. Un botón que
se repone sin decir nada se lee como «no funciona», y lo siguiente es una llamada
a gerencia o abrir el conteo dos veces.

### Remediación

1. Añadir `catch` con «No se pudo abrir el conteo. Revisa tu conexión.»
2. Cubrir el caso sin `id` ni `error`: si la respuesta no trae conteo, **decirlo**
   en vez de caer en el hueco.
3. Comprobar `res.ok` antes de leer el cuerpo.

---

## ✅ A-1 · Una respuesta con error del servidor se descarta en silencio

**Severidad: alta** · *silent-errors* (feedback)

`components/conteos/ConteoDiario.tsx:74-78`:

```js
const response = await fetch(`/api/conteos/diario?section=...`);
if (response.ok) setState(await response.json());
```

Un **500**, un **403** o un **401** no entran en el `if` y **no hacen nada**: el
estado sigue en `null` y la pantalla queda igual que con la red caída. Desde
fuera, «el servidor falló» y «no hay señal» se ven idénticos, y piden cosas
distintas de quien lo vive.

**Remediación:** ramificar por código. `401` manda a `/login`; `403` dice que no
tiene permiso; el resto ofrece reintentar. Es la misma distinción que esta app ya
hace en `lib/cola-offline.ts`, donde **el 401 se reintenta** porque es «todavía
no sé», no «no hay nada».

---

## A-2 · «Cargando…» es texto suelto, no un esqueleto

**Severidad: alta** · *dead-end-states* (feedback) · F.1.1.02 Carga cognitiva

Las cuatro pantallas de Conteos muestran un `<p>Cargando…</p>` centrado. No
anticipa la forma de lo que viene, no ocupa el sitio del contenido y, combinado
con **B-1**, es exactamente el estado en el que se quedan atascadas.

El resto de la app ya usa esqueletos (`components/ui/Skeleton.tsx`), así que esto
además rompe la consistencia —*inconsistent-actions*— dentro del mismo producto.

**Remediación:** sustituir por el esqueleto que ya existe, con la forma de la
tarjeta de progreso y de las filas del historial. Arreglar esto **no sustituye a
B-1**: un esqueleto eterno es tan dead-end como un texto eterno, solo que más
bonito.

---

## M-1 · El historial de conteos no tiene tope

**Severidad: media** · *overloaded-screen* (eficiencia) · F.1.1.04 Miller

`ConteosList` pinta **todos** los conteos cerrados, uno por fila. Hoy son pocos;
a conteo quincenal son veinticuatro al año y creciendo, sin paginar ni agrupar.
La pantalla sigue funcionando, pero la pregunta que se hace ahí —«¿cuándo fue el
anterior?»— se contesta con los tres primeros.

**Remediación:** mostrar los últimos cinco y un «Ver todos». No es urgente: se
vuelve molesto, no roto.

---

## M-2 · El contraste del héroe no se puede dar por bueno sin medirlo

**Severidad: media** · *contrast-blindness* (accesibilidad)

La tarjeta superior de Conteos usa `papel-hero` —degradado azul oscuro con texto
blanco— **solo dentro de la APK**. El número grande de avance va en `text-white`
sobre ese degradado.

No lo marco como fallo porque **no lo medí**: el degradado va de `#071F47` a
`#287DFF`, y el blanco sobre el extremo claro es justo donde puede quedarse
corto. El paso 4 de este comando es el que debe calcularlo.

⚠️ Antecedente que lo hace probable: el 29 de septiembre esa misma tarjeta
quedaba con **blanco sobre blanco** fuera de la APK, y hubo que acotarla. Y cinco
botones de Conteos se pintaron con la letra del color de su relleno
(`tests/texto-invisible.test.ts`).

---

## Lo que está bien, y conviene no romper

| | |
|---|---|
| **Conteo ciego** | el campo nace vacío: enseñar lo ya contado convierte el recuento en una confirmación |
| **Un solo conteo abierto** | el botón se deshabilita y **dice por qué** —«Hay un conteo abierto»—, no se queda muerto sin explicación |
| **Motivo de lista cerrada** | con texto libre, a las dos semanas todo diría «se vendió» |
| **El detalle se recupera solo** | `ConteoDetail` tiene su `catch` con el motivo escrito, y un poll que reintenta |
| **La cola del checklist** | lo que no llegó **se nombra siempre**, aunque no quede nada pendiente |
| **El bloqueo del PIN** | cinco intentos y backoff exponencial, con el mismo «no» para todos los casos |

---

## Flujos sin hallazgos

**Checklist**, **Entrada** y **Cobro** pasaron lo que esta auditoría mira. Sus
cargas están protegidas y sus mensajes dicen qué hacer:

- `app/checklist/page.tsx:160` — «No se pudo cargar el checklist.»
- `app/checklist/page.tsx:241` — «Sin conexión y sin sitio para guardarla.»
- `app/suscripcion/page.tsx:53` — «No se pudo cargar la suscripción.»
- `app/login/page.tsx` — dieciocho rutas de error, cada una con su texto.

⚠️ **Eso no es un aprobado completo.** Sin `flow-checker` no se recorrieron sus
listas de preflight y postflight, y nada de esto se probó **en un teléfono real**:
es lectura de código. Los estados vacíos y la jerarquía visual de esas tres
pantallas quedan sin auditar.

---

## Lo que falta de este comando

| Paso | Estado |
|---|---|
| 1 · Auditoría | hecho, sin `flow-checker` |
| 2 · Pulido `--bolder` y `--a11y` | **pendiente** |
| 3 · Textos con `ux-writing` | **pendiente** |
| 4 · Verificación de contraste WCAG | **pendiente** — es quien cierra M-2 |

El flujo con más bloqueantes es **Conteo**, así que es sobre él donde toca el
paso 2.

---

## Lo que se arregló el mismo día

**B-1, B-2 y A-1 quedaron cerrados.** El patrón vive ahora en
`lib/use-carga.ts`, hermano de `useSession` y `useAppData`, y las cuatro
pantallas lo usan. Lo que ve la persona está en
`components/conteos/NoSePudoCargar.tsx`: dice qué pasó, que se reintenta solo
cuando vuelva la señal, y ofrece un botón para no esperar.

⚠️ **El botón existe aunque se reintente solo**: eso la persona no lo sabe, y
sin algo que tocar la pantalla sigue pareciendo rota.

⚠️ **Y el reintento va por EVENTO** --al volver a la app y al recuperar la
señal--, nunca por temporizador, y **solo mientras ha fallado**. Si no, cada
vez que alguien saca el teléfono del bolsillo se dispararía una petición más.

`tests/carga-que-no-cuelga.test.ts` fija el patrón con cuatro pruebas: recorre
`app/` y `components/` y falla **nombrando** la pantalla que espere datos sin
saber fallar. Comprobada en rojo revirtiendo un arreglo.

### Contraste medido, no estimado

Con el CSS real de este build, en los dos temas:

| | claro | oscuro | exige |
|---|---|---|---|
| Título | **17.93** | **13.37** | 4.5 |
| Cuerpo | **5.02** | **5.72** | 4.5 |
| Botón | **13.37** | **13.37** | 4.5 |

Los seis pasan AA. El botón mide **44 px** exactos de alto, el mínimo táctil.

⚠️ De paso: el tema oscuro de esta app se activa con la clase **`.dark`**, no
con `data-theme`. Medirlo con el atributo da el tema claro y un «pasa» falso.

### Lo que sigue pendiente

A-2 (esqueleto), M-1 (historial sin tope) y M-2 (contraste del héroe `papel-hero`
dentro de la APK, que es otro par de colores y **no** el medido arriba). Y los
pasos 2 y 3 del comando: el pulido y la revisión de textos.
