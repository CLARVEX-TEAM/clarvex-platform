# AGENTS.md

> El resto de este archivo son pautas de diseño y de arranque, y siguen
> vigentes. Esta primera sección es **el estado real del proyecto hoy** y va en
> español porque es el idioma de `CLAUDE.md`, que es la fuente operativa.

---

# 🔴 EN QUÉ ESTAMOS AHORA — 13 de agosto de 2026

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
se conservan las cuatro pantallas del nuevo App Builder y no hay que
reconstruirlas como Classic app ni como formularios nativos de Clarvex.

## Dónde vamos

| Fuente | Endpoint | Pantalla Retool nuevo builder |
|---|---|---|
| HORARIOS | ✅ `/api/admin/capture/schedules` | ✅ publicada y probada internamente; falta prueba con invitado |
| ASISTENCIA | ✅ `/api/admin/capture/attendance` | ✅ publicada; falta prueba con invitado |
| KPIS | ✅ `/api/admin/capture/kpis` | ✅ publicada; falta prueba con invitado |
| DESCUENTOS_POS | ✅ `/api/admin/capture/discounts` | ✅ publicada; falta prueba con invitado |

**El reemplazo del RDV está construido**: los cuatro endpoints, las cuatro
pantallas y el tráfico de tienda dentro de KPIs. Los atributos seguros de
usuario (`storeId`, `storeName` y `role`) ya están creados en Retool sin valor
predeterminado. Antes de reabrir Clarvex falta invitar una cuenta interna de
prueba, asignarle esos atributos y validar las cuatro capturas de extremo a
extremo mediante acceso directo.

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

## Estado de la app: CERRADA

`MAINTENANCE_MODE=1` en el `.env` del VPS desde el 12 de agosto. Se avisó por
push a 19 usuarios.

Atraviesan la ventana: `/api/health`, los `platformAdmin`, el **usuario kiosko**
(el checklist de tienda es operación diaria), `/login` + `/api/auth/*` (para que
nadie quede fuera de forma permanente) y las rutas de captura.

⚠️ **Solo un usuario tiene `platformAdmin`**: Adrian (102259). Salida de
emergencia por SSH:

```bash
ssh clarvex "cd /root/clarvex-app && sed -i 's/^MAINTENANCE_MODE=.*/MAINTENANCE_MODE=0/' .env && pm2 restart clarvex-team --update-env"
```

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
- ✅ `External Apps` permanece desactivado.

Lo pendiente es:

1. invitar una cuenta interna de prueba y añadirla a `captura tiendas`;
2. asignar sus tres atributos;
3. verificar que solo vea «Captura Clarvex» y su propia tienda;
4. probar guardado de Horarios, Asistencia, KPIs y Descuentos;
5. invitar al resto y reabrir Clarvex cuando todo esté validado.

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
* `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test` (158 unit tests, needs `clarvex_test` migrated+seeded), `pnpm audit --audit-level=high`. `pnpm test:security-protection` also passes.
* Known-broken: `pnpm test:integration` fails because it spawns `next dev` with `NODE_ENV=test`, which Next forces back to `development`, tripping the `lib/prisma.ts` guard. It is not part of CI. The harness also SIGKILLs only the parent, leaving orphaned `next-server` processes on port 3101 — kill them by PID if you hit `EADDRINUSE`.
