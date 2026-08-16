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
- **El corte es el DÍA del inventario, no el instante.** Movimientos y ventas
  usan el mismo criterio (`date > baseline`): todo lo del día del conteo ya está
  dentro de las piezas contadas. Si se aceptara en un lado y no en el otro, un
  traspaso de ese día contaría dos veces.
  ⚠️ **Supuesto pendiente de confirmar con la tienda:** que el conteo se hace al
  cierre. Si contaran ANTES de abrir, las ventas de ese día se perderían.
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

**Falta:** desplegar (`prisma migrate deploy` en el VPS), la pantalla de Retool,
la vista en Clarvex y enganchar el cierre de ronda a un `CycleCount`. El
inventario del **martes 18 de agosto** cierra la 1ª ronda y abre la 2ª.

⚠️ **Supuesto sin confirmar:** que el conteo se hace al cierre del día. Si
contaran ANTES de abrir, las ventas de ese día se perderían del kardex.

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
