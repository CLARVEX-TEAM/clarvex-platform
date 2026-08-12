# AGENTS.md

> El resto de este archivo son pautas de diseño y de arranque, y siguen
> vigentes. Esta primera sección es **el estado real del proyecto hoy** y va en
> español porque es el idioma de `CLAUDE.md`, que es la fuente operativa.

---

# 🔴 EN QUÉ ESTAMOS AHORA — 12 de agosto de 2026

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

## Arquitectura elegida

```
Gerente entra a Clarvex con su PIN de siempre
  → /escritorio/captura pide una URL firmada de un solo uso
  → POST /api/retool/embed-url  (identidad SACADA DE LA SESIÓN)
  → se incrusta la app de Retool «Captura Clarvex»
  → sus funciones POSTean a /api/admin/capture/*
  → validación + reglas de negocio + escritura en la base
```

Retool pinta la interfaz; **la lógica de negocio vive en este repo**. Se descartó
que Retool escribiera SQL directo: se saltaría el calendario retail, el
`weekNumber`, el patrón de fila ancla y el filtro del usuario kiosko, y eso
corrompe en silencio.

Los gerentes entran como **usuarios externos** de Retool: sin cuenta propia, sin
contraseña nueva y **gratis hasta 50 personas** en el plan Business. La
alternativa (una cuenta de Retool por persona) costaba $18/mes cada una y añadía
un login más a una tarea diaria.

## Dónde vamos

| Fuente | Endpoint | Pantalla Retool |
|---|---|---|
| HORARIOS | ✅ `/api/admin/capture/schedules` | ✅ publicada y **probada de extremo a extremo** |
| ASISTENCIA | ✅ `/api/admin/capture/attendance` | ✅ publicada, **sin probar aún** |
| KPIS | ✅ `/api/admin/capture/kpis` | ⏳ pendiente |
| DESCUENTOS_POS | ⏳ ya desbloqueado | ⏳ pendiente |

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

Pendiente en esta pieza: el **tráfico de tienda** (y con él la conversión), que
es un dato de tienda y no de persona, así que necesita su propia captura.

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
RETOOL_ORG_URL=         # ⚠️ https://clarvex.retool.com — hay que cambiarla al
                        #    dominio personalizado en cuanto esté activo
RETOOL_APP_UUID=        # ✅ b6ebeac8-95fd-11f1-a579-b33e5e6ede64
RETOOL_EMBED_GROUP_ID=  # ✅ 6998583  (grupo «captura tiendas»)
```

Si falta alguna, `/escritorio/captura` responde **503 nombrando cuál**. Es
deliberado: un 500 genérico obligaría a adivinar.

## Accesos: usuarios externos embebidos

Las gerentes **no tienen cuenta de Retool**. Entran a Clarvex con su PIN y la
pantalla se incrusta con una URL firmada de un solo uso. En Business, los
usuarios externos son **gratis hasta 50**; cuentas propias habrían costado
$18/mes cada una y añadido un login más a una tarea diaria.

### 🔴 Bloqueo activo (12 ago 2026)

`POST /api/embed-url/external-user` responde:

```json
{"error": true, "message": "You must call this endpoint from a custom domain"}
```

**La API de incrustación exige dominio personalizado.** No basta
`clarvex.retool.com`. En curso: `captura.adrianluna.mx`.

- DNS ✅ — `CNAME captura → custom-domain.retool.com`, resuelve a las IPs de
  Retool (35.92.202.168/169/170, un balanceador en AWS).
- Certificado ⏳ — Retool aún no lo emite; `curl` devuelve `http=000 tls=1`.

Cuando esté activo hay que **cambiar `RETOOL_ORG_URL` al dominio nuevo**: la
llamada tiene que salir desde ahí o vuelve el mismo error.

### Configuración en Retool, y las trampas de cada paso

- **Token**: Settings → API. Scope **solo `Retool Embed`**, nada más. Se muestra
  una única vez.
- **Grupo `captura tiendas`** (id `6998583`): acceso **Use, nunca Edit**, y solo
  a la app «Captura Clarvex» y a los dos recursos de Clarvex. *Use* es lo que
  impide ver el secreto o alterar el código que fija la tienda, y además es lo
  que hace que Retool facture como usuario interno y no como *builder* a $65.
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
* Modern glassmorphism
* Dark mode first
* Black background (#0A0A0A)
* Neon green accent (#00FF66)
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
