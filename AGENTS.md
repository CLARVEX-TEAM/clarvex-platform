# AGENTS.md

> El resto de este archivo son pautas de diseño y de arranque, y siguen
> vigentes. Esta primera sección es **el estado real del proyecto hoy** y va en
> español porque es el idioma de `CLAUDE.md`, que es la fuente operativa.

---

# 🔴 EN QUÉ ESTAMOS AHORA — 14 de agosto de 2026

## Qué pasó

El **11 de agosto de 2026, sobre las 17:00 de Monterrey**, Grupo Axo deshabilitó
los enlaces de compartir anónimos en su tenant de SharePoint. **Cinco de las seis
fuentes de datos cayeron a la vez**, todas en la misma corrida del cron:

| Tienda | Fuentes caídas |
|---|---|
| TH San Agustín | KPIS, HORARIOS, DESCUENTOS_POS, ASISTENCIA |
| GUESS Galerías | HORARIOS |

Error en `SyncLog`: *«El link devolvió una página web, no un Excel»* — SharePoint
sirve la página de «enlace deshabilitado» en lugar del XLSX.

**Sobrevivió `GUESS / KPIS`**, la única fuente que no lee un enlace de Axo: pasa
por un flujo de Power Automate que copia el archivo a un OneDrive nuestro. Ver
la memoria `integracion-microsoft-sharepoint`.

## Qué se quiere lograr

**Que la app deje de depender de archivos de Excel ajenos.** En vez de leer
hojas del SharePoint de Axo, la operación se captura en la propia plataforma.

El punto clave para entender el alcance: **la app ya es dueña de las tablas y de
toda la lógica encima** (`Kpi`, `Schedule`, `Attendance`, comisiones, calendario
retail, KPIs, reportes). Excel solo aportaba **las filas**. Así que esto NO es
reescribir la app: es **sustituir el parser por un formulario**. Todo lo que
consume esos datos se queda igual.

## Arquitectura elegida: acceso directo a Retool

```
Gerente abre https://captura.adrianluna.mx
  → inicia sesión directamente en Retool con su invitación individual
  → Retool abre la app publicada «Captura Clarvex»
  → atributos seguros del usuario fijan storeId, storeName y role
  → sus funciones POSTean a /api/admin/capture/*
  → validación + reglas de negocio + escritura en la base
```

Retool pinta la interfaz; **la lógica de negocio vive en este repo**. Se descartó
que Retool escribiera SQL directo: se saltaría el calendario retail, el
`weekNumber`, el patrón de fila ancla y el filtro del usuario kiosko, y eso
corrompe en silencio.

Los gerentes y subgerentes entran como **usuarios internos invitados** de la
organización de Retool. Cada persona tiene su cuenta individual y Retool le
envía un enlace para crear su contraseña; el administrador configura antes su
grupo, tienda y cargo. También pueden usar **Sign in with Google** si su correo
lo admite. `External Apps` permanece desactivado: no usar el flujo de usuarios
externos para esta operación.

⚠️ **Hallazgo del 13 de agosto:** «Captura Clarvex» fue creada con el **nuevo App
Builder** de Retool (proyecto de código con `/frontend` y `/backend`), no como
una **Classic app**. Retool documenta que las apps del nuevo builder **todavía
no admiten incrustación en sitios o aplicaciones externas**. El endpoint
clásico acepta el UUID y devuelve 200, pero la URL firmada termina en una
pantalla blanca.

Esto se reprodujo fuera de Clarvex: una URL firmada nueva se abrió directamente
en el navegador, llegó a
`/embedded/authed/b6ebeac8-95fd-11f1-a579-b33e5e6ede64/page1`, cargó el shell de
Retool sin errores de consola y dejó `App Body` vacío. Por tanto, **no es CSP,
certificado, iframe ni sandbox de Clarvex**.

**Decisión tomada el 13 de agosto:** se descarta la incrustación, no Retool. Los
usuarios internos invitados entrarán directamente al dominio personalizado. Así
se conservan las pantallas del nuevo App Builder y no hay que
reconstruirlas como Classic app ni como formularios nativos de Clarvex.

## Dónde vamos

| Fuente | Endpoint | Pantalla Retool nuevo builder |
|---|---|---|
| HORARIOS | ✅ `/api/admin/capture/schedules` | ✅ guardado confirmado desde la cuenta operativa con el parche `0.0.3` |
| ASISTENCIA | ✅ `/api/admin/capture/attendance` | ✅ prueba completa desde cuenta operativa hasta la base de Clarvex |
| KPIS | ✅ `/api/admin/capture/kpis` | ✅ guardado confirmado desde la cuenta operativa; parche `0.0.3` aclara los acumulados |
| DESCUENTOS_POS | ✅ `/api/admin/capture/discounts` | ✅ guardado confirmado desde la cuenta operativa con el parche `0.0.4` |
| TICKET_ELECTRONICO | ✅ `/api/admin/capture/electronic-tickets` | ✅ lectura y escritura probadas; publicado en Retool `0.0.7` |

**El reemplazo del RDV está construido y validado**: los cinco endpoints, las
cinco pantallas de captura y el tráfico de tienda dentro de KPIs. Los atributos seguros de
usuario (`storeId`, `storeName` y `role`) ya están creados en Retool sin valor
predeterminado. La cuenta operativa de TH San Agustín ya validó las cuatro
capturas originales y Ticket electrónico de extremo a extremo. La app ya está
abierta; falta terminar de invitar a los gerentes/subgerentes restantes y
comprobar su aislamiento por tienda.

El dominio personalizado **`captura.adrianluna.mx` ya está operativo** con
certificado de Let's Encrypt, y `RETOOL_ORG_URL` apunta a él.
`POST /api/embed-url/external-user` responde 200 con verificación TLS estricta.

Lo que costó llegar ahí, por si vuelve a pasar (ticket **#00121648**):

- La emisión del certificado tardó **casi un día**, muy por encima de los «unos
  minutos» que promete la documentación. Su soporte confirmó **hasta 24 horas**.
- Durante ese tiempo el host sirve el *Kubernetes Ingress Controller Fake
  Certificate*: la validación aparece en verde y la emisión va aparte y lenta.
  **Palomita verde no significa certificado listo.**
- ⚠️ **No tocar el dominio mientras esté pendiente.** Eliminarlo y volver a
  añadirlo reinicia el ciclo, y Retool tarda minutos en liberar el hueco (el
  plan admite un único dominio personalizado).
- `curl -k` es la forma de comprobar que todo lo demás está bien antes de que
  emita: si devuelve 200 con `embedUrl`, token, grupo y app son correctos y solo
  falta el certificado.


### 🔔 Alarma de captura — sustituye a `sync-alert`

`sync-alert` quedó como no-op al retirar los Excel de Axo, y el crontab se
quedó **sin ninguna alarma de frescura**. El riesgo no se fue con los enlaces:
cambió de forma y a peor. Antes fallaba una máquina; ahora depende de que una
persona capture cada día, y un olvido **no produce ningún error** — solo KPIs
quietos y decisiones tomadas sobre datos viejos.

`POST /api/cron/capture-alert`, a diario a las **18:00 UTC (12:00 Monterrey)**:
al mediodía la captura del día anterior ya debería estar hecha y aún queda
jornada para ponerse al día.

- Reutiliza el criterio de `lib/sync-freshness` —mismo margen de días, mismo
  trato a las fechas futuras— para que «congelado» signifique lo mismo antes y
  después de la migración.
- Solo tiendas con `kpisEnabled`; un aviso por persona y día
  (`DailyNotificationLog`, tipo `CAPTURE_STALE`).
- Distingue dos casos: una tienda que capturaba y **dejó** de hacerlo es un
  olvido y se avisa; una que **nunca** capturó es una puesta en marcha
  incompleta y no se avisa a diario, porque gerencia no puede arreglarlo desde
  la pantalla de captura.

En su primera corrida (15 de agosto) detectó **GUESS Galerías con 3 días sin
capturar** y avisó a sus dos gerentes. Respaldo del crontab previo en
`/root/crontab.backup-20260815`.

### Lo que hace especial a `KPIS`

Solo acepta datos **crudos**: meta, venta, tickets y piezas. Todo lo demás se
deriva, y ahí está lo que un `INSERT` externo se saltaría:

- `upt` y `avgTicket` salen de la propia fila. Guardan **0** cuando no hay
  tickets —no `null`— porque son NO nulables y es lo que hace `ratio()` en el
  importador. Mostrar «—» es cosa de `lib/kpi-view.ts`, no del dato guardado.
- **`ranking` es la posición de ESE DÍA** frente a las compañeras: capturar a una
  cambia el puesto de todas, así que se recalcula la fecha completa.
- **`monthlySales` / `monthlyGoal` son acumulados**: capturar un día mueve el
  acumulado de todos los días de ese mes para esa persona.

La respuesta `monthsRecalculated` no cuenta meses calendario distintos: cuenta
pares **persona-mes** recalculados. Si se capturan cuatro colaboradores del mismo
mes, el valor correcto es `4`. Desde el parche Retool `0.0.3` la interfaz lo
muestra como **«Acumulados mensuales»** y aclara «Uno por colaborador del mes
capturado»; no se cambió el cálculo ni el contrato del endpoint.

`monthlyGoal` pasa a ser la **suma de las metas diarias**. El importador prefería
la meta TTLS de la hoja cuando existía, pero esa hoja es justo lo que se deja de
leer.

El **tráfico de tienda** viaja aparte de `entries`, en su propio array por fecha,
porque no es un dato de persona. Se escribe en la fila de **cada** asesor de ese
día junto con su conversión.

Repetirlo parece redundante y no lo es: `aggregateStoreTraffic` toma el **máximo
por fecha**, no la suma, justamente para no multiplicarlo por el número de
personas. Guardarlo en una sola fila dejaría al resto sin conversión.

La conversión es `null` sin tráfico, **no cero**: sin visitantes no significa
«entró gente y no compró nadie», significa que no se sabe. `Kpi.conversion` sí
es nulable, a diferencia de `upt` y `avgTicket`.

### Lo que hace especial a `DESCUENTOS_POS`

La numeración del RDV no se muestra como una semana ISO lunes-domingo. Para la
captura, la semana retail es **domingo-sábado** y conserva el número ISO de la
semana que termina en ese domingo. Ejemplo verificado: **semana 32 de 2026 = 9
al 15 de agosto**; la semana 33 = 16 al 22 de agosto. El parche Retool `0.0.4`
corrigió la pantalla de Descuentos, que antes mostraba erróneamente 3–9 de
agosto. La conversión se hace en UTC para evitar desplazamientos por zona
horaria y no modifica el `weekNumber` enviado al endpoint.

El margen consolidado de tienda, tanto semanal como mensual, es **ponderado**:
se suman primero `discountAmount` y `grossSales` de todas las personas y semanas
incluidas, y después se calcula `(descuento total / venta bruta total) × 100`.
Nunca se promedian porcentajes individuales. Como los importes semanales viven
solo en la fila ancla, al sumar un mes retail cada semana se cuenta una sola vez.

**No crea filas propias.** El margen es semanal y `Kpi` es diaria, así que se
escribe en la **primera fila de la semana** (patrón de fila ancla) y en el resto
queda `null`. Repetirlo en los siete días multiplicaría por siete cualquier suma.

Se agrupa por **`weekNumber`, nunca por `weekStart`**: en esta tabla `weekStart`
vale lo mismo que `date` en cada fila, así que agrupar por él daría una «semana»
por día.

Si no existen KPIs de esa semana **no se inventa una fila**: se devuelve 200 con
la lista en `weeksWithoutKpis`. Crear un `Kpi` vacío solo para colgar un
descuento falsearía venta y metas.

⚠️ **El margen es un TECHO, no una meta**: pasarse es malo, así que el semáforo
va al revés que en el resto (verde si es BAJO). `isCeiling()` en
`lib/kpi-view.ts` es quien lo distingue.

**Orden obligatorio: KPIS antes que DESCUENTOS_POS.** El margen DTO no crea filas
propias: busca los `Kpi` de esa semana y escribe los totales en la primera
(patrón de fila ancla, `lib/data-source-sync.ts:749-779`). Sin filas de KPI no
tiene dónde escribir.

⚠️ **`KPIS` es la pieza delicada.** Toca `commissionAmount`, `commissionPercent`
y `commissionMinimum`, más los derivados `upt`, `avgTicket` y `conversion`.
`CLAUDE.md` marca la lógica de comisiones como intocable sin aprobación
explícita, y su modo de fallo no es un error rojo: es una comisión mal pagada
que nadie detecta hasta la quincena. **No apurarla.**

## Estado de la app: ABIERTA

Clarvex se reabrió el **13 de agosto de 2026**. `MAINTENANCE_MODE=0` en el
`.env` del VPS; las dos instancias PM2 quedaron `online`, `/api/health`
respondió `status=ok` y una visita sin sesión a `/manager` llegó a `/login` sin
la pantalla de mantenimiento. Después de verificarlo se envió la notificación
de reapertura a **19 usuarios activos**.

Si se vuelve a activar mantenimiento, atraviesan la ventana: `/api/health`, los
`platformAdmin`, el **usuario kiosko** (el checklist de tienda es operación
diaria), `/login` + `/api/auth/*` y las rutas de captura.

⚠️ **Solo un usuario tiene `platformAdmin`**: Adrian (102259). Salida de
emergencia por SSH:

```bash
ssh clarvex "cd /root/clarvex-app && sed -i 's/^MAINTENANCE_MODE=.*/MAINTENANCE_MODE=0/' .env && pm2 restart clarvex-team --update-env"
```

### Reapertura ejecutada — 13 de agosto de 2026

El paquete de comunicación de salida quedó desplegado y activado:

- `components/WhatsNewModal.tsx` usa la clave de lanzamiento
  `clarvex-whatsnew-2026-08-captura-propia`, por lo que se mostrará una vez a
  cada usuario al volver a entrar;
- explica que el cambio nació porque Grupo Axo modificó el acceso a los archivos
  compartidos, presenta la integración de Retool mediante su programa para
  startups y reconoce que temporalmente habrá doble captura;
- a `GERENTE` y `SUBGERENTE` les muestra **Conocer la nueva captura**, que abre
  directamente
  `https://captura.adrianluna.mx/rr/app/captura-clarvex`;
- asesores solo ven **Entrar a Clarvex**; el kiosko y la ventana de mantenimiento
  están excluidos del aviso;
- la difusión push fue enviada a 19 usuarios activos:
  - título: `Clarvex vuelve a estar disponible`;
  - cuerpo: `Estrenamos una captura propia para reducir la dependencia de archivos externos. Abre Clarvex y descubre el cambio.`;
  - URL: `/`.

La apertura siguió este orden: (1) cambiar a `MAINTENANCE_MODE=0`, (2) recargar
las dos instancias PM2, (3) comprobar `/api/health`, (4) verificar el acceso sin
sesión hasta `/login` y (5) enviar la difusión por `POST /api/cron/broadcast`.

## Variables de entorno del VPS

```env
ADMIN_CAPTURE_SECRET=   # ✅ configurada — autoriza la escritura de operación
RETOOL_API_TOKEN=       # ✅ configurada — scope ÚNICO "Retool Embed"
RETOOL_ORG_URL=         # ✅ https://captura.adrianluna.mx — el dominio propio,
                        #    obligatorio para la API de incrustación
RETOOL_APP_UUID=        # ✅ b6ebeac8-95fd-11f1-a579-b33e5e6ede64
RETOOL_EMBED_GROUP_ID=  # ✅ 6998583  (grupo «captura tiendas»)
```

Si falta alguna, `/escritorio/captura` responde **503 nombrando cuál**. Es
deliberado: un 500 genérico obligaría a adivinar.

## Accesos: usuarios internos invitados con acceso directo

Las gerentes y subgerentes tienen una cuenta interna individual de Retool, pero
no la crean desde cero: el administrador las invita, asigna grupo y atributos,
y Retool les manda un enlace de una semana para elegir contraseña. Nunca
compartir contraseñas ni crear una cuenta común por tienda: se perdería
auditoría y control de bajas. `External Apps` debe permanecer desactivado.

Entran directamente a `https://captura.adrianluna.mx`. El flujo embebido de
`/escritorio/captura` y `/api/retool/embed-url` queda como implementación
obsoleta y no debe usarse para operación; puede retirarse cuando la prueba
directa quede aprobada.

### 🟡 Pendiente activo (13 ago 2026)

Dominio, TLS, token, grupo y generación de URL están correctos:

- DNS ✅ — `CNAME captura → custom-domain.retool.com`.
- Certificado ✅ — Let's Encrypt válido.
- `RETOOL_ORG_URL` ✅ — `https://captura.adrianluna.mx`.
- `POST /api/embed-url/external-user` ✅ — devuelve 200 y una URL de un solo uso.
- CSP de Clarvex ✅ — permite `frame-src https://captura.adrianluna.mx`.

El endpoint y el SDK de Embed son para **Classic apps**; la app creada es del
**nuevo App Builder**, cuya documentación lista «Embedded apps in external
websites or applications» como funcionalidad aún no soportada. No seguir
modificando CSP, `frame-ancestors`, Cloudflare ni el `sandbox`: ya quedaron
descartados por la prueba directa.

Ya no bloquea la salida porque se eligió acceso directo.

Estado de acceso verificado el 13 de agosto:

- ✅ atributos `storeId`, `storeName` y `role` creados como `String`, sin valor
  predeterminado para que una identidad incompleta falle de forma cerrada;
- ✅ grupo `captura tiendas` limitado a **Use** sobre «Captura Clarvex»;
- ✅ recursos limitados a **Use** sobre `Clarvex API (captura)` y
  `Clarvex producción (solo lectura + 3 columnas)`;
- ✅ sin acceso del grupo a «Diagnóstico de datos» ni «Panel Administración
  Tiendas»;
- ✅ `All Users` no concede acceso a ninguna app ni recurso, así que la
  membresía automática de los usuarios internos no amplía sus permisos;
- ✅ en el rol global `All Users` se desactivaron `Use Assist with Build and Ask
  mode`, `View Assist` y `Build apps in the AI-powered app builder`; los
  usuarios de tienda ya no pueden crear apps, recursos, workflows ni agentes
  después de renovar su sesión;
- ✅ `External Apps` permanece desactivado.
- ✅ «Captura Clarvex» se republicó como parche `0.0.2`, fijado en **Always
  publish latest changes**; el enlace limpio
  `https://captura.adrianluna.mx/rr/app/captura-clarvex` abre la app sin la
  pantalla de republicación y carga `TH SAN AGUSTIN` desde la identidad.
- ✅ en `captura tiendas` → **Additional**, la **Landing page** quedó fijada en
  «Captura Clarvex». Al iniciar sesión, los miembros del grupo deben entrar
  directamente a la captura en vez de quedarse en el inicio general de Retool.
  La raíz `https://captura.adrianluna.mx` sigue siendo la página general si
  alguien la abre manualmente; para accesos y marcadores usar la URL de la app.

Las cinco pantallas de captura ya fueron probadas desde la cuenta operativa. Lo pendiente
es:

1. invitar al resto y asignar sus tres atributos de identidad;
2. comprobar que cada invitación aceptada abre únicamente su propia tienda;
3. validar la fase 1 publicada con las siguientes cuentas invitadas;
4. continuar la migración gradual del resto del escritorio. Clarvex seguirá
   siendo la API, base de datos, motor de reglas, PWA de asesores, kiosko y
   panel privado de Adrian.

### Migración del panel gerencial a Retool — fase 1 publicada

La migración comenzó el 13 de agosto. No es un reemplazo del backend: Retool
solo presenta la interfaz y Clarvex conserva identidad, permisos, PostgreSQL y
reglas de negocio.

- En Clarvex se desplegó `GET /api/admin/retool/dashboard?storeId=...`, protegido
  con `ADMIN_CAPTURE_SECRET`. Es de solo lectura y devuelve un contrato pequeño
  con tienda, fecha, mes retail, venta/meta de hoy y mes, tráfico, operación,
  ranking y bandeja de atención.
- La tienda sigue saliendo de `requireManagerIdentity` en el backend de Retool;
  no existe selector ni se acepta una tienda elegida por el navegador.
- El cálculo vive en `lib/retool-manager-dashboard.ts`; divisor cero devuelve
  `null` para que la interfaz muestre `—`, nunca un cero inventado.
- Commits de Clarvex: `5dfad9f` (endpoint y pruebas) y `644c694` (lista exacta
  del middleware). Ambos están en `main`, desplegados; build limpio, 686 pruebas
  aprobadas, dos procesos PM2 `online` y `/api/health` correcto.
- Retool tiene el borrador `ccf83f9`: agrega **Inicio** como ruta predeterminada,
  renombra la cabecera a **Panel Gerencial Clarvex**, conserva Horarios,
  Asistencia, KPIs y Descuentos, y añade resumen diario/mensual, indicadores,
  ranking y una cola combinada de atención. Incluye skeleton, estado sin datos,
  error visible con reintento, actualización manual y formato `es-MX`.
- La función de Retool se probó contra producción después del despliegue y
  recibió `ok: true` con el contrato real completo. La compilación del borrador
  quedó limpia.
- La API ya entrega `photoUrl` en ranking e incidencias. Como el bucket R2 es
  privado, desde `b500065` esas fotos salen como URLs firmadas temporales; no se
  debe volver a entregar la URL `*.r2.dev` cruda porque Retool recibe 401.
- El borrador Retool `5ada430` usa fotos reales con `object-cover` y fallback de
  iniciales solo cuando la foto es nula o falla. Se verificaron cuatro elementos
  `img` reales en el preview, todos con `complete=true` y `naturalWidth>0`;
  Itzel conserva iniciales porque no tiene foto registrada.
- El borrador `d7d2e22` corrige la navegación responsive. La cabecera es el único
  elemento liquid-glass; por debajo de ~1100 px usa título completo en la primera
  fila y navegación horizontal en la segunda, sin recortar «Descuentos». En
  anchos suficientes vuelve a una sola fila. Compilación limpia.
- **Publicado el 13 de agosto como parche Retool `0.0.5`.** La URL pública
  `https://captura.adrianluna.mx/rr/app/captura-clarvex` ya abre Inicio con el
  panel gerencial, la navegación liquid-glass responsive y las fotos reales.
  Después de publicar se probaron las cinco rutas (Inicio, Horarios, Asistencia,
  KPIs y Descuentos) y las cuatro imágenes firmadas cargaron con
  `complete=true` y `naturalWidth>0`. Itzel conserva el fallback esperado.

### Parche Retool `0.0.6`: contraste y selector de tema

La captura publicada por Adrian mostró un defecto real en modo claro: la clase
`bg-[#0B0C0F]/72` del contenedor glass no produjo color en el CSS compilado y
la cabecera quedó transparente, aunque su título seguía blanco. No era un
problema del navegador ni del dominio.

La corrección se publicó el 13 de agosto como parche Retool **`0.0.6`**:

- `frontend/components/AppNav.tsx` usa fondos RGBA explícitos: blanco al 84 %
  en claro y `#0B0C0F` al 86 % en oscuro, con borde, sombra y contraste propios
  de cada tema. El glass continúa limitado a la navegación.
- Añade un botón visible sol/luna, fuera del carrusel de navegación, con área
  táctil de 44 px en pantallas estrechas, etiquetas accesibles en español y
  estados de foco, hover y movimiento reducido.
- `frontend/theme/themeToggle.ts` conserva la elección en `localStorage` con la
  clave `clarvex-capture-theme`, sincroniza la clase `dark` y `color-scheme`, y
  respeta el tema que Retool ya tenga cuando el usuario todavía no ha elegido.
- `frontend/App.tsx` aplica la preferencia antes de pintar para evitar un
  destello del tema contrario.
- Se verificaron Inicio, Horarios, Asistencia, KPIs y Descuentos tanto en claro
  como en oscuro. La barra dejó de ser transparente en ambos modos y el tema
  oscuro persistió después de recargar la vista previa.
- No se tocaron funciones de captura, rutas, identidad ni reglas de negocio.

Retool confirmó funciones aprobadas y ausencia de conflictos antes de publicar.
Después se abrió la URL pública, donde aparecieron las cinco rutas y el botón
de tema. En producción se midió el fondo oscuro como
`rgba(11, 12, 15, 0.86)` y, tras usar el botón real, el fondo claro como
`rgba(255, 255, 255, 0.84)`, título `rgb(15, 23, 42)`, clase `dark` ausente y
`color-scheme: light`. La preferencia de prueba se devolvió a oscuro.

### Kardex de inventario — fase 1 en el repo (16 de agosto de 2026)

Nace de una necesidad de la operación, no de la migración: la tienda lleva a
mano un kardex con traspasos de entrada y salida (a otras tiendas y a CEDIS),
recepción de mercancía, devoluciones de cliente y venta diaria. La captura va en
Retool y lo visual en Clarvex, igual que el resto.

**El diseño en una línea: la existencia NO se guarda, se calcula.**

```
teórico = inventario inicial
        + recepciones + traspasos de entrada + devoluciones de cliente
        − ventas − traspasos de salida
        ± ajustes
```

**Validado contra el kardex real de la tienda** (`KARDEX TOMMY SAN AGUSTIN 1RA
RONDA 2026.xlsx`, revisado el 16 de agosto). Su aritmética es idéntica:

```
6430 (inventario 18 feb) + 8220 recepción + 23 traspasos recibidos
     − 5275 ventas netas − 2039 traspasos enviados − 0 SFS  =  7359 teórico ✅
```

Hay una prueba en el repo que reproduce esos números exactos, para que el
cálculo no se aleje del que ya saben leer. Sus «ventas netas» son brutas menos
devoluciones (5372 − 97); aquí entran por separado y dan lo mismo.

Decisiones que costaron conversación y no hay que deshacer:

- **El kardex va por RONDAS**, como el Excel. Cada inventario cierra la ronda en
  curso y abre la siguiente con las piezas recién contadas. Dentro de una ronda
  la base **no se toca jamás**: corregirla a media ronda reescribe la existencia
  teórica de todos los días de golpe. Una sola ronda abierta por tienda,
  garantizado por índice único parcial (`closedAt IS NULL`) creado a mano en la
  migración — el chequeo en código no basta con dos instancias de PM2.
- **Cerrar una ronda NO abre la siguiente.** El conteo de cierre suele ajustarse
  en los días posteriores al inventario; encadenarlas dejaría la base nueva
  clavada en una cifra provisional.
- **Para absorber una diferencia ya investigada se registra un `AJUSTE`**, con
  motivo obligatorio. Nunca automático: es la diferencia entre una merma
  explicada y una desaparecida.
- **La venta del día NO se captura.** Sale de las piezas que ya están en `Kpi`.
  Contrapartida: si un día no se capturan KPIs, el kardex cree que la mercancía
  sigue en piso — por eso importa la alarma de captura. Se agrega con
  `PERSON_WHERE`, que excluye al usuario del kiosko.
- **Las devoluciones de cliente SÍ se capturan.** El POS da las piezas vendidas
  brutas y desglosadas por asesor, y las devoluciones aparte a nivel tienda; al
  llegar por caminos distintos no hay doble conteo. Confirmado por Adrian.
- ⚠️ **El día del inventario SÍ entra en la ronda.** Movimientos y ventas usan
  el mismo criterio (`date >= startDate`). **RGIS cuenta antes de que la tienda
  abra**, así que lo de ese día ocurre después del conteo. Lo confirma su propio
  kardex: «Último Inventario» = 18 de febrero, y la primera fila de la hoja
  Ventas es de ese mismo 18 de febrero.
  Se construyó al revés (`> startDate`) y se descubrió al capturar el primer
  movimiento real: la interfaz lo rechazaba por ser del mismo día que la
  apertura. Los dos cortes tienen que moverse juntos: si uno acepta el día del
  conteo y el otro no, ese día se cuenta dos veces o se pierde entero.
- **`quantity` siempre positivo**; el signo lo pone el tipo (`signedQuantity`).
- **SFS (Ship From Store) es una salida propia**, no un traspaso. Lo llevan
  separado en su archivo; esta ronda salió en 0 pero la hoja existe.
- **Sobrantes y faltantes NO entran al teórico** —`quantity` ya son las piezas
  realmente recibidas— pero se guardan: 6 y 10 esta ronda, y son la primera
  pista cuando el conteo de cierre no cuadra.
- **Todo o nada al capturar**: si una fila falla no entra ninguna. En un kardex,
  la duda de qué quedó dentro se paga recontando.

Qué hay en el repo:

- `prisma/schema.prisma` — `InventoryRound`, `InventoryMovement` y el enum
  `InventoryMovementType`. Tres migraciones aditivas; la última crea el índice
  parcial de una sola ronda abierta.
- `lib/inventory-kardex-entry.ts` — validación y cálculo, sin Prisma. 26 pruebas.
- `lib/inventory-kardex.ts` — estado, captura, abrir y cerrar ronda, historial.
- `GET|POST /api/admin/capture/inventory` — estado y movimientos.
- `GET|POST /api/admin/capture/inventory/rounds` — historial, abrir y cerrar.
- `GET /api/admin/capture/inventory/export` — descarga el kardex en el XLSX que
  la tienda ya entrega. La plantilla es `templates/kardex.xlsx`: su propio
  archivo con los datos vaciados y las fórmulas intactas.

🔴 **El archivo NO se rediseña, se rellena.** La toma de inventario la hace un
proveedor externo (**RGIS**) y el formato es de corporativo, a donde se manda.
Cualquier cambio de estructura, estilo o de las tablas es inaceptable.

⚠️ **Por eso el exportador NO usa exceljs.** exceljs reescribe el libro entero y
destroza las tablas de Excel: el archivo obligaba a Excel a «repararlo», los
encabezados perdían su fondo (el texto ya era blanco; el azul se lo daba el
estilo de tabla) y la reparación llegó a **inventar una sucursal** —`03074`— en
una celda que estaba vacía. Se probaron dos rondas de parches sobre exceljs
antes de aceptar que el enfoque era el equivocado.

`lib/kardex-xlsx.ts` edita el XLSX por dentro (es un ZIP de XML) con jszip,
tocando solo filas de datos, rango de tablas y cuatro celdas del resumen.
**Comprobado: 53 de las 68 partes del archivo quedan byte a byte idénticas** al
original; solo cambian las seis hojas, las cinco tablas, `workbook.xml` y sus
dos declaraciones, y desaparece `calcChain.xml` (Excel lo reconstruye).

**No se escribe ningún total.** El libro se marca con `fullCalcOnLoad="1"` y son
las fórmulas originales las que los calculan al abrir. Así el exportado sigue
siendo una hoja de trabajo: si le añaden una fila, todo cuadra solo.

La plantilla se regenera con
`pnpm exec tsx scripts/build-kardex-template.ts <kardex.xlsx>`. Borra las filas
de datos dejando una **fila molde** por hoja —conserva los índices de estilo de
cada columna, sin los cuales las fechas saldrían como números crudos— y borra
los resultados en caché de las fórmulas, que eran cifras reales de la tienda.

**El APTO es SOLO para el desplegable** de destinos y orígenes de traspasos.
Decisión explícita de Adrian: el nombre de la tienda en el resumen lo escribe
Clarvex, no se deduce del código. La celda `E9` traía un
`VLOOKUP(F8, Hoja1!A:B)` y el exportador la sustituye por el nombre real — es la
**única fórmula que se sobrescribe**, y evita depender de un dato que Clarvex no
guarda. `F8` solo se rellena si se pasa `?apto=`.

⚠️ **Los ajustes NO son parte de la operación.** Así funciona de verdad el
cierre: corporativo manda un teórico a RGIS, RGIS cuenta, y **corporativo da de
baja el faltante**; esa baja es la base de la ronda SIGUIENTE. Ejemplo de Adrian:
teórico de corporativo 8000, RGIS encuentra 7990, corporativo da de baja las 10
y la ronda nueva arranca en 7990.

O sea que la diferencia **se resuelve sola al reanclar**, y el tipo `AJUSTE`
queda como salida de emergencia para corregir a mitad de ronda, que hoy no
ocurre. El formato de corporativo tampoco tiene dónde ponerlos y no se añaden al
archivo: si alguna vez se usan, el aviso de `X-Kardex-Warnings` dice en cuántas
piezas discreparán los dos teóricos.

💡 Sin construir: el **teórico que manda corporativo** (8000 en el ejemplo) es un
tercer número, distinto del teórico de Clarvex y del conteo de RGIS. Guardarlo al
cerrar la ronda permitiría comparar los tres.

Bug encontrado al probar el export y corregido: `getKardexState` sin `roundId`
solo miraba la ronda ABIERTA, así que **leer o exportar justo después de cerrar
—el momento más probable— devolvía vacío**. Ahora cae a la última cerrada. La
captura no usa ese respaldo: escribir sigue exigiendo una ronda abierta.
- Las dos rutas registradas en `captureRoutes` del `middleware.ts`.

Probado contra base real, ciclo completo: abrir ronda, rechazo de una segunda
abierta, captura de movimientos, teórico coincidiendo al número, cierre con
diferencia de −75, rechazo de movimientos en ronda cerrada, apertura de la 2ª
ronda con las piezas contadas y su kardex arrancando limpio. Lint, build (salida
sin filtrar) y 721 pruebas en verde.

Lo que se vio en el archivo de la tienda y conviene recordar:

- El catálogo de `Hoja1` trae **72 tiendas Tommy con su APTO** (San Agustín es
  `03029`). Ya está en `lib/inventory-counterparts.ts`, junto con CEDIS y
  Uniformes, y viaja en la respuesta del `GET` para que Retool no mantenga su
  propia copia. **Adrian pidió que aparezcan todas**, aunque en la 1ra ronda solo
  usaron seis destinos: CEDIS (71 envíos) y O. MTY (54) se ofrecen primero.
  El nombre que se muestra es el corto que ya escriben (`O. MTY`, `VALLARTA`),
  no el oficial: quien captura busca por ese.
- ⚠️ **El APTO se guarda aparte de la etiqueta** (`counterpartCode`). Es el
  motivo entero del catálogo: en el papel se anota «CUERNAVACA» y hay **dos**
  (Galerías `03036` y Outlet `03049`); igual con «METEPEC» (`03031` y `03073`).
  Sin el código, ese traspaso deja de ser rastreable.
- Una fila de *Trans. recibidas* (folio `1737816`, 16 pz, CUERNAVACA) **no tiene
  fecha**. Suma al total igual; en el kardex nuevo no pasaría.
- El resumen muestra «Diferencias −7359» y «−100 % de variación» porque la celda
  de existencia física está vacía esperando el conteo. No es un error del
  archivo.

**Desplegado el 17 de agosto de 2026.** Respaldo previo en
`/root/pre-kardex-20260817-0204.dump` (789K), las 4 migraciones aplicadas, las
tablas y el índice parcial verificados en la base, build en verde, PM2 con dos
instancias y health correcto. Los endpoints se probaron contra producción con
`TH SAN AGUSTIN`: devuelven los 7 tipos, las 74 contrapartes y `rounds: []`.

⚠️ Dos trampas del VPS que costaron tiempo y volverán a costarlo:
- **`pg_dump -U postgres` falla**: ese rol NO existe, el usuario es `clarvex`.
  El respaldo sale en 0 bytes y es fácil darlo por bueno.
- **`ADMIN_CAPTURE_SECRET` está entrecomillado en el `.env`**: leerlo con
  `cut -d= -f2-` da 66 caracteres en vez de 64 y produce un 401 idéntico al de
  un token equivocado. Hay que limpiar comillas antes de usarlo en un `curl`.

**Pantalla de Retool publicada como parche `0.0.8`** (commit Retool `8b6e94c`),
ruta `/kardex`, entre «Descuentos» y «Ticket electrónico». Backend en
`backend/kardex/` con el patrón de siempre: `requireManagerIdentity` para el
`storeId`, `clarvexApiCaptura.rawRequest` y los helpers de `restError`. Las dos
funciones mutativas (`saveMovements`, `saveRound`) se aprobaron tras revisar su
código: publicar está bloqueado hasta hacerlo — **una pausa pidiendo aprobación
no es un cuelgue, no cancelarla**.

El export se añadió con `?format=base64` porque el panel no puede pedir el
binario desde el navegador (el secreto no puede viajar al cliente). El runtime de
Retool no expone `utils.downloadFile`, así que la descarga usa un helper propio.

### ⚠️ El `Select` de Radix rompe la app — usar `NativeSelect`

Al abrir la primera ronda desde `0.0.8`, la pantalla se cayó entera con el error
boundary («Something went wrong»). **La escritura funcionó**: la ronda quedó
creada en producción. El fallo era de renderizado.

Causa: la pantalla usaba el **`Select` de Radix** (`lib/shadcn/select.tsx`) en el
selector de tipo de movimiento y en el filtro de la tabla. Ese componente monta
DOM aunque esté cerrado, y en este runtime (React 19 en iframe con CSP) revienta
al montarse. Solo aparecía con una ronda abierta, por eso el estado vacío se veía
bien y todo se caía justo al abrirla.

**El resto de la app nunca usa el `Select` de Radix: todos los desplegables son
`NativeSelect`** (`AttendanceRow`, `ScheduleCell`). Era el único componente fuera
de convención en la pantalla nueva. Corregido en `0.0.9` sustituyéndolo por
`NativeSelect`, conservando el `<optgroup>` de «Excepcionales».

Descartado por el camino, para no volver a mirarlo: no eran los datos (`null` en
`difference`/`closingPieces` y `movements` vacío ya estaban contemplados), no
eran las variantes `success`/`warning` (sí existen, y una desconocida en `cva` no
lanza), y no eran los iconos de lucide.

Confirmado por Adrian: con `0.0.9` **la pantalla ya carga** con la ronda abierta.

### ⚠️ Un hilo de Retool se queda sin commits después de publicar

Tras publicar `0.0.9`, se le pidieron más cambios al **mismo hilo**. El agente los
hizo y dijo «listo», pero al publicar: *«No commits found on this thread branch»*.
Se comprobó leyendo la rama publicada: **seguía con el código viejo**. El trabajo
estaba en el estado del hilo pero sin commit, o sea en el limbo.

**Regla:** después de publicar un hilo, para el cambio siguiente hay que abrir uno
nuevo con `startNewThreadFromMain: true`. Y no basta con que el agente diga que
terminó — hay que **verificar la rama publicada**. Un atajo barato: comparar
`sizeBytes`/`lineCount` del archivo antes y después, sin releer el contenido.

Con el hilo limpio se rehízo el cambio y se publicó como **`0.0.10`**
(9 956 → 10 284 bytes confirmados en `main`).

🟡 **Sin verificar por una persona:** la captura de un movimiento de principio a
fin y el botón de exportar.

### Vista del kardex en Clarvex

`GET /api/kardex` (con sesión, solo lectura) + `/escritorio/kardex` y una tarjeta
en el dashboard. La captura sigue viviendo solo en Retool: dos sitios donde
capturar lo mismo es cómo se acaba con dos verdades.

⚠️ **`/api/kardex`, NO `/api/inventory`.** Esa última ya existía y es el reporte
de **faltantes** de producto (con foto y aviso a gerencia). Al montar esto se
sobrescribió por accidente y hubo que restaurarla con `git checkout`: comprobar
que la ruta está libre antes de escribir el archivo.

`lib/inventory-daily.ts` arma la serie día a día. Emite **todos** los días del
periodo, también los que no tuvieron movimiento: una línea con huecos se lee como
si el inventario hubiera dejado de existir esos días. La tarjeta del dashboard no
se pinta si no hay ronda abierta — un cero ahí se leería como «no queda
mercancía».

**Falta:** decidir si el cierre de ronda se engancha a algo de la app. ⚠️ Ojo: la existencia física la trae **RGIS**, no los `CycleCount` por
marbete, así que ese enganche ya no es evidente.

**El martes 18 de agosto**: no hay que reconstruir la 1ª ronda —serían ~500
movimientos de febrero a agosto—. Se abre directamente la ronda nueva con la
fecha del inventario y las piezas que cuente RGIS como `basePieces`.

✅ **Resuelto:** el conteo lo hace RGIS **antes de abrir**, así que el día del
inventario pertenece a la ronda. Ver la regla del corte más arriba.

### Retiro de Centro de Datos y Ticket electrónico — 14 de agosto

La sincronización heredada con los Excel de Axo quedó retirada de la operación:

- se eliminaron del `crontab` de producción las llamadas a `sync-all`,
  `sync-alert` y `attendance-sync`;
- esos tres endpoints conservan autenticación pero ahora responden como tareas
  deshabilitadas y no leen Excel ni generan alertas;
- los resúmenes diario y de mediodía ya no llaman `syncAllSources`;
- se marcaron como leídas las cuatro alertas heredadas que todavía estaban
  pendientes, sin tocar notificaciones normales;
- Centro de Datos desapareció de la navegación móvil y de escritorio. Las rutas
  antiguas `/datos` y `/escritorio/datos` redirigen a la captura nueva para no
  romper marcadores.

Ticket electrónico conserva su lógica en Clarvex mediante
`GET|POST /api/admin/capture/electronic-tickets`. El dato semanal se guarda en
la primera fila `Kpi` de la semana (fila ancla); el denominador es
`posTransactions` cuando existe y, como compatibilidad, `rdvTransactions` en
datos históricos. Retool nunca elige la tienda: la toma de
`requireManagerIdentity` y solo permite `GERENTE` o `SUBGERENTE`.

La pantalla Retool está publicada como parche **`0.0.7`**, commit Retool
`3efa632`, ruta `/ticket-electronico`. Incluye semanas retail, total de tickets,
captura de electrónicos, porcentaje en vivo, resumen mensual ponderado por
conteos, validación contra valores mayores al total, estados de carga/error y
ambos temas. Se probó una escritura real en TH San Agustín, Retool confirmó un
contador numérico de `1`, se recargó la lectura y se restauró inmediatamente el
valor original; la base terminó sin cambios de prueba pendientes.
La URL pública confirmó las seis rutas del panel: Inicio, Horarios, Asistencia,
KPIs, Descuentos y Ticket electrónico.

Clarvex quedó en `a531f46`, desplegado en producción: lint, TypeScript, build y
las **687 pruebas** pasan. El GET real del endpoint nuevo respondió HTTP 200 con
siete semanas y siete grupos de filas.

### Primera prueba de extremo a extremo: Asistencia ✅

El 13 de agosto a las 09:39 de Monterrey, `jhernandezl2c@gmail.com` guardó una
asistencia desde Retool y la pantalla confirmó `1 registro creado`. Se verificó
directamente en la base de producción que usa Clarvex:

- tienda: `TH SAN AGUSTIN`;
- persona: `ITZEL SAIDY REYES BAUTISTA` (`81893`);
- fecha: `2026-08-13`;
- entrada esperada `10:30`, llegada `12:00`, salida `21:00`;
- `source=MANUAL`, `minutesLate=90`;
- regla confirmada después de la prueba: `status=EXCUSED` y
  `minutesBalance=-90`.

El flujo Retool → endpoint de captura → PostgreSQL → `/api/attendance` quedó
confirmado. La prueba además aclaró la regla real de negocio, que quedó
codificada y cubierta por pruebas:

- hasta 14 minutos después de la entrada esperada: `ON_TIME`, banco sin cambio;
- de 15 a 29 minutos: `LATE` (retardo), banco sin cambio;
- desde 30 minutos: `EXCUSED` (permiso de entrada tarde), se descuenta del banco
  la diferencia completa contra la hora esperada;
- sin marca de entrada, o con texto explícito `FALTA`: `ABSENT`.

Las bandas son relativas al horario de cada persona, no a las 10:30 fijas.

Cambio desplegado en producción el 13 de agosto en `e69f52e`. La fila de Itzel
se volvió a procesar por el endpoint normal de captura y se verificó en la base:
`status=EXCUSED`, `minutesLate=90`, `minutesBalance=-90`, `source=MANUAL`. Las
dos instancias PM2 quedaron `online` y `/api/health` respondió `status=ok`.

### Ajuste de Horarios después de la primera prueba

La primera prueba operativa detectó que Retool bloqueaba todo el guardado cuando
una fila `LABORANDO` no tenía ambas horas y que, por el ancho de la celda, la
salida quedaba recortada. El parche `0.0.3` corrige ambos puntos:

- en `LABORANDO` e `INVENTARIO`, una entrada vacía toma `10:30` y una salida
  vacía toma `21:00`;
- si solo se capturó una de las dos horas, esa hora se conserva y únicamente se
  completa la faltante;
- `DESCANSO`, `VACACIONES` y demás estados no laborados siguen guardando ambas
  horas como `null`;
- Entrada y Salida se muestran apiladas, con etiqueta visible y ancho táctil
  suficiente para móvil.

La misma regla vive en el servidor (`lib/schedule-capture-entry.ts`), no solo en
Retool, para que una interfaz antigua o defectuosa no vuelva a bloquear la
captura. Adrian repitió el guardado desde la cuenta operativa después de recargar
la aplicación y confirmó que ya permite guardar correctamente.

La cuenta administrativa de Adrian (`contacto@clarvex.adrianluna.mx`) **no se
usará para operación ni para la prueba**. Aunque actualmente tiene atributos de
tienda, debe conservarse separada como cuenta de administración. Adrian creará
o indicará otro correo para una cuenta operativa interna con acceso solo a
`captura tiendas`, `role=SUBGERENTE`, `storeId=clarvex-demo-store` y
`storeName=TH SAN AGUSTIN`. Esa segunda cuenta será la primera prueba real de
aislamiento y captura.

Correo elegido: `jhernandezl2c@gmail.com`. La invitación fue aceptada el 13 de
agosto y la cuenta ya está activa. Tiene únicamente los grupos `All Users`
(automático) y `captura tiendas`, sin `admin`, `editor` ni `viewer`. Sus
atributos quedaron guardados y se verificaron cerrando y reabriendo el perfil:
`role=SUBGERENTE`, `storeId=clarvex-demo-store` y
`storeName=TH SAN AGUSTIN`. En este panel cada atributo se persiste con
**Enter**; salir del campo o cerrar el perfil no lo guarda.

Primera invitación del despliegue al resto del equipo enviada el 13 de agosto:
`esoriamontes@gmail.com`, SUBGERENTE de **GUESS Galerías Monterrey**. Quedó en
estado `Pending`, con solo `All Users` + `captura tiendas`, acceso a una app y
dos recursos, sin `admin`, `editor`, `viewer`, workflows ni agentes. Atributos
verificados en el detalle de la invitación: `role=SUBGERENTE`,
`storeId=cmr9yr6te05qagemyll8vv48f` y
`storeName=GUESS Galerías Monterrey`.

✅ **Aceptó el 13 de agosto** y ha entrado desde entonces. Es la primera cuenta
de una tienda distinta a TH San Agustín, así que es con la que conviene
confirmar el aislamiento en la práctica: pedirle que abra la captura y diga qué
tienda le sale. El código no deja otra opción —`getEmployees` recibe solo
`user`, sin parámetro de tienda— pero una prueba real cierra la duda.

⚠️ **`prueba@clarvex.local` quedó DESHABILITADO el 15 de agosto.** Era una
cuenta de tipo *embed* creada sin querer al depurar el certificado, con
identidad de TH San Agustín. Retool no permite borrar usuarios, solo
deshabilitarlos.

La pantalla **Republish to use your custom domain** quedó resuelta el 13 de
agosto. Retool no quitó el aviso con una publicación sin etiqueta; fue necesario
hacer un cambio fuente sin efecto funcional (solo un comentario), publicarlo
como parche `0.0.2` y mantener **Always publish latest changes**. El enlace
limpio ya carga Horarios directamente. Si reaparece, revisar primero la etiqueta
publicada antes de tocar DNS, certificado o Cloudflare.

### Branding del acceso directo

Business permite personalizar nombre de organización, logo, favicon, color de
acento, color de cabecera, visibilidad del menú y remitente de correos. Para el
nuevo App Builder no se admite todavía sustituir por completo la estructura de
la página de login con una app propia; eso es distinto de aplicar branding.

Aplicado el 13 de agosto: nombre **CLARVEX TEAM**, referencias adicionales a
Retool ocultas, acento `#2563EB`, cabecera `#0B0C0F` y menú de usuario oculto.
Logo cargado desde `public/icon-512.png` y favicon desde `public/favicon.ico`.
Retool solo acepta `.ico` para el favicon; se verificó que ese archivo coincide
visualmente con `public/favicon-32x32.png`. La opción **Show logo in app
headers** está activada. Falta definir el remitente de correo.

⚠️ El logo cuadrado se ve sobredimensionado en el login. Retool no publica una
medida obligatoria para el logo (solo admite PNG/JPG), y su vista previa reserva
un área horizontal aproximada de 249 × 87 px. Adrian aprobó el candidato
`public/branding/retool-logo-horizontal.png` (1200 × 300, transparente, símbolo
+ texto «CLARVEX TEAM») y su fuente SVG. **Ya está cargado en Retool** y se
verificó visualmente tanto en el login como en el encabezado de la aplicación.
El favicon continúa usando `public/favicon.ico`.

### Configuración en Retool, y las trampas de cada paso

- **Token**: Settings → API. Scope **solo `Retool Embed`**, nada más. Se muestra
  una única vez.
- **Grupo `captura tiendas`** (id `6998583`): acceso **Use, nunca Edit**, y solo
  a la app «Captura Clarvex» y a los dos recursos de Clarvex. *Use* impide ver el
  secreto o alterar el código que fija la tienda. Los gerentes y subgerentes se
  invitan como usuarios internos; `External Apps` permanece desactivado.
  **No reutilizar Viewer/Editor/Admin**: tienen acceso a *All apps*, o sea
  también al panel de administración con facturación y auditoría.
- **Dominio personalizado**: Settings → **Branding** → campo *Domain name*.
  ⚠️ **No confundir con «Auto-join domains»** de *Advanced settings*: eso son
  dominios de CORREO para que alguien se una a la organización, no la URL.
- **CNAME en Cloudflare**: destino `custom-domain.retool.com` y **proxy en gris
  (DNS only)**. Con la nube naranja, Cloudflare responde con su certificado,
  Retool no puede validar y el dominio se queda «pendiente» sin explicar por qué.
- La API de grupos de Retool (`/api/v2/groups`) devuelve **403 «not available on
  your plan»**. El id del grupo se saca de la URL en Settings → Groups.

---

# 🟡 AWS — 21 de agosto de 2026

Entraron **$1,000 anuales de créditos por AWS Activate**. Nada de la app se ha
migrado todavía: Clarvex sigue en el VPS de Vultr.

## Cómo se entra

| Dato | Valor |
|---|---|
| Cuenta | `775711761052` |
| Región | `us-east-1` |
| Acceso | IAM Identity Center (SSO), **no** llaves permanentes |
| Portal | `https://d-90667a3e8a.awsapps.com/start` |
| Perfil del CLI | `clarvex` → todo lleva `--profile clarvex` |

La sesión dura 8 horas; se renueva con `aws sso login --profile clarvex`.

⚠️ En Windows el binario **no siempre está en el `PATH`** de una terminal ya
abierta. Llamarlo por su ruta funciona siempre:
`C:\Program Files\Amazon\AWSCLIV2\aws.exe`.

⚠️ La instancia de Identity Center se creó **de región única** a propósito. La
opción multi-región replica a Oregón y para eso usa una clave KMS propia, **que
se cobra aparte** (~$1/mes fijo). Con una sola persona, esa resiliencia no
compra nada.

## Alerta de presupuesto — la parte que no es opcional

Presupuesto `clarvex-mensual`: **$20 USD al mes**, avisa al 50 %, al 100 % y
cuando la proyección del mes va a rebasarlo. Va a `contacto@clarvex.adrianluna.mx`.

⚠️ Está creado con **`IncludeCredit: false`**, y ese detalle es todo el punto.
Por omisión AWS cuenta los créditos como descuento: el costo «real» sale en cero
mientras duren, la alerta no salta jamás, y uno se entera del gasto el día que
llega la primera factura de verdad. Así mide el consumo **antes** de los
créditos.

## Bedrock — en producción desde el 21 de agosto

La lectura del reporte del POS (`lib/pos-vision.ts`) ahora va por Bedrock
primero, con **Gemini de respaldo**. No es cambiar de bando: si Bedrock tiene un
mal momento, la captura del día no puede quedarse sin leer.

Medido con una captura real y el mismo prompt de producción: **12 de 12 campos
correctos en 3.7 s**, contra los 10-15 s de Gemini. Desde el VPS, 1.3 s en una
llamada mínima. Con Haiku, el modelo pequeño.

Costo real, con las tarifas de lista: **~$0.002 por lectura**. Una al día son
seis centavos de dólar al mes.

Trampas que costaron tiempo y están cubiertas por prueba:

- ⚠️ **El ID del catálogo NO se puede invocar directo.** Hay que usar el perfil
  de inferencia, con prefijo `us.`:
  `us.anthropic.claude-haiku-4-5-20251001-v1:0`. Sin él, Bedrock responde que el
  modelo «no admite rendimiento bajo demanda», que no dice nada.
- ⚠️ **Bedrock envuelve el JSON en ` ```json `**, a diferencia de Gemini, que lo
  entrega limpio por el `responseSchema`. Sin quitar la envoltura el parseo falla
  SIEMPRE, y falla al final, con el trabajo ya hecho. Lo resuelve
  `stripCodeFence` en `lib/pos-vision-bedrock.ts`.
- ⚠️ Las credenciales llevan **nombre propio** (`BEDROCK_ACCESS_KEY_ID`,
  `BEDROCK_SECRET_ACCESS_KEY`), no las genéricas `AWS_*`. El cliente de R2
  también es del SDK de AWS: unas variables `AWS_*` sueltas en el entorno
  podrían acabar mandando las fotos a otra parte.

La validación se sacó a **una sola función** (`validateVisionText`): venga de
donde venga la lectura, pasa por el mismo esquema y por la comprobación de las
cuentas del reporte. Un proveedor nuevo no puede colarse por una puerta más
floja que el otro.

**Cuenta nueva, dos trámites de una sola vez** —ya hechos—: la verificación
automática de AWS (bloquea Bedrock hasta ~2 h) y el formulario de caso de uso de
Anthropic.

## ⚠️ Pendiente: borrar la llave `clarvex-bedrock`

Hay un usuario IAM **`clarvex-bedrock`** con una llave permanente en el `.env`
del VPS, acotado a `bedrock:InvokeModel` y `bedrock:Converse` sobre modelos de
Anthropic y nada más.

Existe SOLO porque Clarvex vive fuera de AWS. **El día que la app corra en EC2 esa
llave sobra**: se le asigna un rol a la instancia y AWS entrega credenciales
temporales solas. Borrarla es parte de la migración, no un extra:

```bash
aws iam delete-access-key --user-name clarvex-bedrock --access-key-id <id> --profile clarvex
aws iam delete-user-policy --user-name clarvex-bedrock --policy-name solo-invocar-bedrock --profile clarvex
aws iam delete-user --user-name clarvex-bedrock --profile clarvex
```

Las credenciales que sobran y nadie borra son las que se filtran dos años después.

## La migración — plan y estado

**No empezada.** El VPS va sobrado: 2 vCPU, 4 GB, carga 0.09, 33 días de
servicio. Migrar es por aprovechar los créditos, no por necesidad.

Tamaños reales medidos, que corrigen la intuición: **25 GB usados de 94**, y la
**base de datos son 25 MB**. Para AWS bastan **30 GB de EBS** (~$2.40/mes) — un
volumen se puede agrandar en caliente pero **nunca encoger**, así que empezar
chico es estrictamente mejor. En Vultr los 100 GB venían con el plan; aquí se
pagan.

Costo estimado de la máquina equivalente (`t4g.medium` + 30 GB): **~$27/mes**,
frente a los ~$24-30 de Vultr. Los créditos cubren unos dos años y medio.

### Orden acordado, y por qué

1. Alerta de presupuesto ✅
2. Bedrock ✅
3. Máquina en AWS con 30 GB
4. Postgres y la app, en un **dominio de prueba**
5. Los demás servicios: n8n, Uptime Kuma, Portainer
6. **Vaultwarden aparte y con calma** — es el gestor de contraseñas; ahí se
   verifica que se puede entrar ANTES de tocar nada más
7. **DNS al final**
8. Vultr encendido **un mes** como red de seguridad

Mientras el DNS no se toque, la tienda no se entera de nada. Ese es todo el
truco: el paso reversible va al último.

### DNS en Cloudflare

Token de API acotado a `Zona · DNS · Editar` sobre `adrianluna.mx`, con
caducidad de un mes. Vive en la variable de usuario de Windows
`CLOUDFLARE_API_TOKEN`. Ojo: no aparece en una terminal ya abierta; se lee con
`[Environment]::GetEnvironmentVariable("CLOUDFLARE_API_TOKEN","User")`.

⚠️ **El filtro de IP del token se dejó vacío a propósito.** Con IP dinámica, el
token deja de funcionar justo el día de la migración, sin avisar y sin razón
aparente. La protección es la caducidad corta.

Cinco registros A apuntan a `216.238.88.93`, **todos con proxy activo**:

| Registro | Qué es |
|---|---|
| `app` | Clarvex |
| `n8n` | webhook de fotos a Telegram |
| `vault` | Vaultwarden |
| `status` | Uptime Kuma |
| `docker` | Portainer |

Que estén *proxied* es la clave del día de la migración: el tráfico entra por
Cloudflare, así que el cambio de IP se propaga casi al instante **y la reversa
también**, sin esperar TTL. El paso más temido acaba siendo el más reversible.

### Qué NO montar

Los que se comen créditos sin que nadie lo note:

| Servicio | Costo | Por qué no |
|---|---|---|
| NAT Gateway | ~$32/mes | El clásico. Cuesta más que el servidor entero |
| Load Balancer | ~$16/mes | Con una sola máquina no balancea nada |
| EKS | ~$73/mes | Para una app en PM2 es artillería |
| RDS Multi-AZ | doble | La alta disponibilidad no sirve con una sola app |

Y **CloudWatch Logs** con retención larga: barato por GB, pero una app habladora
llena gigas sin avisar.

## Reglas que salieron de esto y no hay que romper

**La tienda sale de la IDENTIDAD, nunca del cliente.** Ni `/api/retool/embed-url`
ni las funciones de Retool aceptan `storeId` como parámetro. Si lo aceptaran, una
gerente podría capturar los horarios de otra tienda. En Retool lo aplica
`requireManagerIdentity` (`/backend/schedules/identity.ts`), que además corta si
el rol no es GERENTE o SUBGERENTE.

**Sin identidad no hay respaldo: se muestra un aviso y se para.** Nunca volver a
un selector de tienda como alternativa — ese era justo el agujero.

**Un guardado que miente es peor que uno que falla.** La app de Retool anunciaba
«Cambios guardados» sin haber escrito nada, porque un `as SaveResult` dejaba
pasar cualquier respuesta. Ahora solo declara éxito si llegan contadores
numéricos reales; cualquier otra cosa es error ruidoso con el JSON crudo a la
vista. **No reintroducir casteos a ciegas sobre respuestas de red.**

**La captura NO borra filas.** El importador de Excel sí puede, porque el archivo
es una foto completa de la semana. Una captura es una edición parcial: borrar lo
que no venga en el cuerpo vaciaría la semana al guardar una celda.

**El estado del día de asistencia no se captura, se deriva.** `classifyDay` y
`dayBalanceMinutes` lo calculan desde el horario, igual que el importador. Si la
pantalla pudiera mandar el estado, se podría marcar «a tiempo» un retardo.

## Trampas verificadas en producción

- **R2 debe usar IPv4 en el agente HTTP, no solo en DNS.** El 13 de agosto el
  kiosko dejó fotos, escaneos y PDFs indefinidamente en «Procesando»: no hubo
  filas nuevas de `ChecklistEntry`/`ChecklistScan`. Cloudflare publica A y AAAA,
  pero el VPS no tiene ruta IPv6 funcional. `setDefaultResultOrder("ipv4first")`
  redujo el problema, aunque llamadas del AWS SDK todavía tardaron 20–90+ s. La
  solución definitiva (`a20aff1`) es el `NodeHttpHandler` de `lib/r2.ts` con
  agente HTTPS `family: 4`, `keepAlive`, conexión de 5 s y socket de 30 s. No
  retirarlo mientras no exista IPv6 funcional. Producción quedó verificada con
  health profundo en 411 ms y escritura + lectura de metadatos en 553 ms; el
  objeto temporal se borró. Los intentos anteriores al despliegue no se
  guardaron y deben repetirse.
- **`Schedule.date` va a medianoche UTC.** Había 4 filas a mediodía que
  duplicaban días; ya se bloqueó la entrada de fechas fuera de medianoche.
- **Ningún horario real trae `startTime`.** La asistencia asume la hora estándar
  de tienda (10:30) para calcular retardos, y gerencia lo parchea a mano. Es una
  oportunidad de arreglarlo de raíz al montar la captura.
- **El usuario kiosko no es un asesor.** Filtrar por `role: "ASESOR"` a secas lo
  incluye. Usar `ADVISOR_WHERE` / `PERSON_WHERE`, y en Retool el filtro
  `"checklistOnly" = false` es obligatorio.

## Cosas del entorno que cuestan tiempo si no se saben

- **El agente de Retool se para sin avisar** y su estado sigue diciendo
  «activo»: unas veces esperando aprobación humana, otras dejando la rama **sin
  commit**. Antes de publicar, comprobar que hay `commitSha`; si no lo hay, el
  botón de publicar no responde y no es culpa de quien lo pulsa.
- **Aprobar funciones que escriben es un paso humano.** No se puede automatizar.
- **`rawRequest` de Retool no lanza excepción en un 401**: devuelve el cuerpo del
  error, así que un fallo de autenticación parece éxito si no se valida.
- **Verificar el build sin filtrar la salida.** Un `| tail -6` hace que el código
  de salida sea el de `tail`, no el del build. Ya pasó en esta sesión.

---

## Project Vision

CLARVEX Team is a premium retail operations platform focused on store managers, assistant managers and sales associates.

The application must feel like a modern SaaS product comparable to Linear, Stripe Dashboard, Notion, Apple Business Manager and modern retail platforms.

Every screen must be mobile-first.

---

## Design System

### Visual Style

* Premium enterprise SaaS
* Estética minimalista Apple/Linear
* Temas claro y oscuro
* Fondo claro `#FAFAFB`; fondo oscuro `#0B0C0F`
* Acento azul `#2563EB` en claro y `#6B9BFF` en oscuro
* Glass y blur solo en superficies flotantes
* High contrast typography
* Clean spacing
* Minimal borders
* Smooth animations

### UX Rules

* Never create ugly admin panels.
* Avoid generic Bootstrap appearance.
* Every screen must look production ready.
* Every card must have hierarchy.
* Use loading states.
* Use empty states.
* Use hover states.
* Use subtle animations.

### Mobile Rules

* Mobile-first design.
* Must work perfectly on Android.
* Bottom navigation required.
* Large touch targets.
* Sticky actions when appropriate.

---

## Component Standards

Create reusable components:

* Button
* Card
* KPI Card
* Progress Card
* Activity Feed
* Status Badge
* User Avatar
* Notification Card
* Task Card

Never duplicate UI logic.

---

## Dashboard Standards

Manager dashboard must include:

* Store performance
* Team performance
* Pending tasks
* Critical alerts
* Daily plans
* Rankings

Associate dashboard must include:

* Daily target
* Daily sales
* KPI progress
* Schedule
* Daily plan
* Notifications

---

## Data Visualization

Use modern charts.

Preferred:

* Recharts

KPI cards must include:

* Trend
* Delta
* Progress
* Visual indicator

---

## Notifications

Design a complete notification system:

* Push notifications
* Read status
* Priority levels
* Notification center

---

## Code Quality

* TypeScript strict mode.
* No any types.
* Reusable hooks.
* Reusable services.
* Clean architecture.
* Server actions when possible.
* Prisma ORM.
* PostgreSQL.

---

## Future Features

Design architecture ready for:

* AI assistant
* Multi-store support
* Regional managers
* Retail analytics
* Performance reviews
* Commission calculations
* Attendance tracking
* Task automation

Always build with scalability in mind.

---

## Cursor Cloud specific instructions

Single Next.js 15 (App Router) PWA backed by PostgreSQL via Prisma. `pnpm` is the package manager. The update script runs `pnpm install` + `pnpm exec prisma generate` on startup; everything below is not handled automatically and must be done by the agent when needed.

### PostgreSQL
* PostgreSQL 16 is installed locally (not Docker). Start it before running the app or DB-backed tests: `sudo pg_ctlcluster 16 main start` (idempotent; safe if already running).
* Role `clarvex` (password `CambiaEstaPasswordSegura123`), databases `clarvex_team` (dev) and `clarvex_test` (tests). The password value is intentional: `tests/security-protection.test.ts` hardcodes it as the expected prod URL.
* Data persists in the VM snapshot, so migrations/seed generally only need re-running after schema changes: dev = `pnpm exec prisma migrate deploy` + `pnpm exec tsx prisma/seed.ts`; test = same `migrate deploy` against `clarvex_test` then `NODE_ENV=test ALLOW_INTEGRATION_TEST_DATABASE=true pnpm exec tsx tests/seed-test-db.ts`.

### Env files (gitignored, pre-created in the VM)
* `.env` and `.env.local` hold the dev config; `.env.test` holds the test config (see `docs/testing/SAFE_TEST_ENVIRONMENT.md` and `.env.example`). If missing, recreate from those templates.
* Non-obvious: the test-safety check (`tests/helpers.ts`) reads the prod `DATABASE_URL` from `.env` (not `.env.local`). `.env` must point at `clarvex_team` and `.env.test` at a DB whose name contains `test`, or seeding/tests abort.

### Running the dev server
* `pnpm dev` (port 3000). Standard commands are in `README.md` / `package.json`.
* Critical caveat: never start the dev server (or any `next` process) with `NODE_ENV=test` or `ALLOW_INTEGRATION_TEST_DATABASE` set. `lib/prisma.ts` has a guard that throws (HTTP 500 on every route) unless those two are consistent, and `next dev` forces `NODE_ENV=development` internally, so a test-flavored env can never be satisfied. Watch for these leaking via an inherited/tmux environment; start with a clean env if in doubt.
* Login: seeded users `81893` (GERENTE), `102259` (SUBGERENTE), `95739` (ASESOR) were given PIN `1234` during setup. Brand-new users have no PIN and PIN setup requires an authenticated manager/subgerente (see `app/api/auth/employee-login/route.ts`); set a PIN directly with bcrypt (`hashPin`) if you need a fresh login.

### Lint / typecheck / test / build (matches `.github/workflows/ci.yml`)
* `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test` (687 tests al 13 de agosto de 2026; la integración usa `clarvex_test` migrada y sembrada), `pnpm audit --audit-level=high`. `pnpm test:security-protection` también pasa.
* Known-broken: `pnpm test:integration` fails because it spawns `next dev` with `NODE_ENV=test`, which Next forces back to `development`, tripping the `lib/prisma.ts` guard. It is not part of CI. The harness also SIGKILLs only the parent, leaving orphaned `next-server` processes on port 3101 — kill them by PID if you hit `EADDRINUSE`.

### Metas desde la Cuota Justa (17 de agosto de 2026)

Pegar la tabla de la hoja **CJ** del archivo de la tienda y sembrar las metas
diarias, en vez de teclearlas día a día. Retool `0.0.11`, bloque arriba de KPIs.

- `lib/cuota-justa.ts` — parser del pegado y emparejamiento de nombres, sin
  Prisma, 23 pruebas. `lib/goal-capture.ts` escribe. Endpoint
  `POST /api/admin/capture/goals`, con `preview: true` que no escribe nada.
- **Cada día ocupa DOS columnas** (% e importe) y la fila `FECHA` solo trae la
  fecha en la primera: el importe está en la columna SIGUIENTE. La fila `META`
  es la excepción —está combinada— y su importe cae en la MISMA columna.
- **WhatsApp se ignora** por decisión de Adrian: son ~$102 al día de tienda.
- **Nunca se pisan las ventas**: si el día ya tiene KPIs, solo se toca
  `dailyGoal`. Verificado contra base real.
- **Nunca se adivina una persona**: si un nombre encaja con varias, la carga se
  detiene entera. Sembrarle una semana a quien no es deja su alcance y su
  comisión mal sin que nadie lo note.
- Cuadra el reparto contra la meta de tienda de cada día y avisa si no suma: es
  la señal de que el pegado se quedó corto de filas.

Probado en producción con la semana 33 de TH SAN AGUSTIN: 5 personas, 7 días,
26 filas creadas y 9 actualizadas, los cinco nombres emparejados.

#### ✅ RESUELTO: la meta del mes venía congelada del RDV muerto

No era caché ni las filas nuevas. `lib/services/kpi-service.ts` prefería, en
vista **mes**, los **TTLS del RDV** que viajan dentro del último log de sync
`SUCCESS` del mes retail consultado (`pickTtlsForMonth`). El último de esos logs
es del **11 de agosto a las 23:00** — justo antes de que Axo cortara los enlaces.
Desde entonces la meta, los tickets y las piezas de tienda quedaron clavados en
la foto de ese día, sin importar lo que se capturara después.

Los números lo confirman al centavo. En `clarvex-demo-store`:

| | TTLS congelado | Suma real del periodo |
|---|---|---|
| Meta agosto | 222,874.94 | **355,837.02** |
| Tickets | 158 | **251** |
| Piezas | 321 | **518** |

Y 222,874.94 no era coincidencia: es la suma de las semanas 31 y 32
(106,260.68 + 116,614.26), lo único que el RDV alcanzó a escribir.

**El arreglo** suma las filas del periodo en vez de leer el TTLS. Es un **no-op
donde la fuente sigue viva**, comprobado contra producción antes de tocar nada:

- Julio de TH SAN AGUSTIN: TTLS 821,273.50 = suma 821,273.50; tx 499 = 499;
  piezas 899 = 899.
- Agosto de GUESS Galerías (su RDV sigue entrando por Power Automate):
  TTLS 570,480.43 = suma 570,480.43; tx 226 = 226; piezas 407 = 407.

**No se movió ni un número de comisión**, a propósito:

- `ttlsCommissionMinimum` se deja intacto: sigue siendo la única fuente del
  mínimo de tienda y es lo que alimenta el alcance.
- La meta **por persona** tampoco se toca (sigue saliendo de `monthlyGoal`), que
  es lo que habría cambiado el alcance en GUESS: su `commissionBasis` es `META`
  y **ninguna** de sus 51 filas de agosto trae `commissionMinimum`, así que ahí
  la comisión se mide contra la meta directamente.

Regresión cubierta en `tests/kpi-period.test.ts` («la meta de tienda del MES
suma el periodo, no el monthlyGoal de cada quien»).

#### ✅ RESUELTO: los acumulados del mes van por mes RETAIL

Aprobado explícitamente por Adrian el 17 de agosto de 2026: **todas las tiendas
trabajan por mes retail**. Los dos escritores de `monthlyGoal`/`monthlySales`
agrupaban por mes natural, así que el **1 de agosto** —que es julio retail—
caía en los dos meses a la vez: 27,246.33 duplicados en TH SAN AGUSTIN y
58,700.47 en GUESS.

- `recalculateMonths` (`lib/kpi-capture.ts`) usa `retailMonthBoundsFor`.
- `applyMonthlyTotals` (`lib/data-source-sync.ts`) agrupa por inicio de mes retail.

El **TTLS del empleado sigue mandando** sobre la meta cuando la hoja lo trae: ya
es el total del mes retail COMPLETO, incluidos los días que el RDV todavía no ha
cargado, y sustituirlo por la suma de lo que va llegando encogería la meta del
mes cada vez que se sincroniza. En GUESS eso deja la meta intacta; lo que se le
corrige es la venta acumulada.

**Backfill hecho solo en agosto** de `clarvex-demo-store` (86 filas), con los
valores previos respaldados en la tabla `_respaldo_kpi_mensual_20260817`.

⚠️ **Junio y julio se dejaron intactos a propósito**: son meses cerrados y ya
pagados. En junio la venta acumulada pasaría de 334,541 a 438,520, porque el
junio retail son cinco semanas (31 may – 4 jul), y eso movería recibos
históricos. Si algún día se decide reescribirlos, que sea una decisión hablada.

#### Por qué estuvo meses invisible

Mientras el RDV vivía, el mes natural era **código muerto**: `applyMonthlyTotals`
prefería el TTLS de la hoja —que ya es retail— y la suma agrupada por mes
natural era solo el camino de respaldo, que nunca se tomaba. El código estaba
mal y el número salía bien.

Solo pudo aflorar cuando la captura sustituyó al RDV, porque `recalculateMonths`
no tiene hoja que preferir: ahí la suma ES la definición. Y aun así lo tapaba el
otro bug —la meta de tienda congelada—, que enseñaba 222,874.94 en vez del
383,083.35 del mes natural. Dos fallos apilados, el de fuera escondiendo al de
dentro.

Es el mismo patrón que ya documenta `CLAUDE.md` con los domingos de asistencia:
«en julio los dos daban los mismos cuatro, por eso el fallo estuvo meses
invisible».

### Totales de tienda en la captura de KPIs (Retool `0.0.12`)

Fila **TOTAL TIENDA** al pie de la tabla de captura: meta, venta, tickets,
piezas, UPT, ticket promedio y alcance, sumados **en vivo** conforme se teclea.
Solo `frontend/components/kpis/KpiTable.tsx` y `frontend/utils/kpi.ts`; no se
tocó el guardado, ni `buildKpiEntries`, ni ninguna función de backend.

- **Suma a TODOS, gerente y subgerente incluidos.** No hay doble conteo: en la
  Cuota Justa cada persona lleva su propia porción y la suma de las cinco da la
  meta de tienda del día (3,269.56 + 0 + 9,808.68 × 3 = 32,695.60, que es
  exactamente la fila `META` del pegado). Ojo si algún día otra marca reparte
  distinto —con la meta de gerencia igual a la de tienda, sumar sí duplicaría.
- El total se calcula construyendo un `KpiDraft` sintético con las sumas
  (`sumDrafts`) y pasándolo por los helpers que ya usaba cada fila: `upt`,
  `avgTicket`, `alcance`, `alcanceColor`. Nada de fórmulas nuevas, así el «—» y
  el semáforo se comportan igual arriba que abajo.

### Recepción por manifiesto en PDF (Retool `0.0.13`)

Llenar la recepción caja por caja son ~22 renglones de tres campos. El PDF que
manda el CEDIS trae **texto de verdad**, no imagen, así que se lee exacto: nada
de OCR.

- `lib/manifest-pdf.ts` — lector puro, sin Prisma, 14 pruebas contra **dos
  manifiestos reales** guardados en `tests/fixtures/`. Endpoint
  `POST /api/admin/capture/inventory/manifest`, que **solo lee**.
- El guardado sigue siendo `POST /api/admin/capture/inventory`, el de siempre:
  leer y guardar son dos pasos a propósito, para poder revisar antes.

**⚠️ Cada página viene DUPLICADA dentro del archivo** (original y copia para
firmas). Sin quitarla, 22 cajas se leen como 44 y el inventario se infla al
doble en silencio. Cortado por dos lados: se descartan las páginas repetidas y
una caja repetida es error.

**Todo se contrasta contra el propio documento.** Si lo leído no da exactamente
el `Num.Cajas` y el `Cant.Total` que el manifiesto declara al pie, no devuelve
nada. Piezas fantasma en el inventario no se notarían hasta el conteo físico.

Reglas del formato, todas con prueba:

- `72.000` son **72 piezas**, no 72 mil: SAP siempre trae tres decimales.
- La entrega va **sin los ceros de la izquierda**: `0081871303` → `81871303`.
- El documento del kardex es el **MANIFIESTO DE CARGA**, no el transporte SAP.
  Lo confirma la hoja de recepción: `Fecha · Caja/Folio · Piezas · Entrega ·
  Manifiesto · Quién recibe · Sobrantes · Faltantes`.
- Una entrega puede venir en varias cajas; la **caja (HU)** es la que es única.
- La **fecha es la del registro de la entrada**, no la de salida del CEDIS que
  trae el PDF. La pone quien recibe.

**⚠️ En la pantalla, «Piezas que entran» se CALCULA**: manifiesto + sobrante −
faltante, y con 0 o menos se bloquea el guardado. Dejarlo manual era la forma
segura de inflar el teórico: anotar «faltan 2» y que entren las del manifiesto
de todos modos. Sobrantes y faltantes se guardan aparte y no tocan el teórico
—las piezas que entran ya son las que de verdad llegaron—, que es la regla que
`CLAUDE.md` fija para el kardex.

### Lectura del reporte diario del POS (18 de agosto de 2026)

Capturar venta, tickets y piezas asesor por asesor es lo más tedioso del día.
El reporte «Productividad del vendedor sin no mercancía» del POS los trae todos,
y de paso el bruto y el descuento con los que sale el margen.

- `lib/pos-productivity.ts` — núcleo puro, sin Prisma ni red: verifica,
  convierte y empareja. 18 pruebas.
- `lib/pos-vision.ts` — lee una **captura de pantalla** con Gemini.
- `POST /api/admin/capture/kpis/pos-report` — junta las dos cosas. **Solo lee.**
  El guardado sigue siendo `POST /api/admin/capture/kpis`, tras la vista previa.

#### Por qué se puede confiar en leer una captura

El reporte trae **cuatro cuentas que deben cuadrar** en cada fila: bruto −
descuento = neto tras descuentos; − devoluciones = neto; unidades ÷ tickets =
prom. unidades; neto ÷ tickets = prom. monto. Se comprueban las cuatro. Si un
dígito se leyó mal, alguna se rompe y la carga **se detiene entera**.

Sin esa red, esto sería teclear a ciegas con pasos extra.

#### Conversiones, verificadas contra la base

- **Venta = «Neto Ventas» ÷ 1.16.** El POS la da con IVA y Clarvex la guarda sin.
  El 8 de agosto: 17,697.16 del reporte = 15,256.17 capturados.
- **Bruto y descuento se guardan CON IVA**, tal cual. También verificado: bruto
  − descuento = neto × 1.16. Al margen el IVA no le afecta, es un cociente.
- Tickets = «Ticket conteo». Piezas = «Unidades Vendido» (brutas; las
  devoluciones vienen aparte, como las quiere el kardex).

#### Emparejar nombres: por apellido y por PREFIJO

El visor **corta** los nombres (`POPOCA, WAIRA ZITLAL`) y **estropea la Ñ**
(`TREVIÃO` por TREVIÑO), así que comparar por igualdad no sirve. Se comparan
cinco letras, o el apellido entero si es más corto. Ojo con Alonso: en el POS es
*Eduardo Alonso Treviño*.

⚠️ Si un apellido encaja con dos personas **no se elige**: colgarle la venta del
día a quien no es le mueve el alcance y la comisión a dos personas a la vez.

#### Lo aprendido peleando con el modelo

- **El esquema se MANDA a Gemini**, no solo se valida al volver. Sin él, y con
  el razonamiento apagado, devolvía JSON roto: se comía una llave de cierre y
  fundía dos vendedores en uno. Los números bien, la estructura no.
- **Sin razonamiento** (`thinkingBudget: 0`): es transcribir, no resolver.
  `gemini-2.5-flash` acierta pero se pasaba de los 45 s; `gemini-3.1-flash-lite`
  leyó las cuatro filas exactas en **11 s**. Configurable con `POS_VISION_MODEL`.
- **Gemini devuelve 503 cuando está saturado** — pasó dos veces en una tarde. Se
  reintenta una vez antes de mandar a teclear a mano.
- Groq **no tiene modelos de visión** en esta cuenta; por eso este módulo va por
  Gemini y aparte de `lib/ai/*`, que es el chat del copiloto.

#### Puerta PDF: el mismo lector, sin extractor propio

Gemini lee el PDF nativo y sale **más exacto y más rápido** que la captura
(7.6 s contra 11). Es el camino recomendado.

No se le escribió un lector propio como al manifiesto porque este reporte va
**rotado 90°** y su texto usa fuentes subconjunto, cada una con su tabla de
glifos: fusionarlas da 40 conflictos y los nombres salen destrozados
(«REBED,P.bZELPDC.DB» por REYES, ITZEL SAIDY). Sería un extractor de PDF entero
para empeorar lo que ya funciona.

#### Margen diario y el candado contra la doble captura

El reporte trae bruto y descuento por asesor, así que el margen se captura **día
a día** y la semana se arma sumando. `POST /api/admin/capture/kpis` los acepta;
van **juntos o no van**, y ausentes no tocan la fila.

⚠️ **Las dos formas de capturar el margen no se mezclan en una semana.** El
semanal vive en la **fila ancla** (el primer día lleva el total, el resto queda
`null`). Si a esa semana se le añaden los importes de cada día, la lectura suma
las dos cosas y el descuento sale inflado — y el margen es un TECHO, así que
pasarse se lee como que la tienda descontó de más.

La columna **`Kpi.discountDaily`** distingue una fila de la otra:

- `lib/kpi-capture.ts` se niega si la semana ya trae el margen semanal.
- `lib/discount-capture.ts` se niega si la semana ya viene por días.

Se arrancó limpio en la **semana 33**, que no tenía margen capturado.
