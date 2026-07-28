<p align="center">
  <img src="docs/assets/cover.png" alt="Clarvex Team" width="100%">
</p>

<p align="center">
  <a href="https://github.com/jhernandezl2c-hash/app/actions/workflows/ci.yml">
    <img src="https://github.com/jhernandezl2c-hash/app/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
  <img src="https://img.shields.io/badge/Next.js-15.5-000000?logo=nextdotjs&logoColor=white" alt="Next.js 15.5">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript strict">
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL 16">
  <img src="https://img.shields.io/badge/tests-403-16A34A" alt="403 tests">
</p>

<p align="center">
  <b>La operación diaria de una tienda retail, en el teléfono del equipo.</b><br>
  KPIs, comisiones, horarios, plan del día, pendientes, chat y comunicados.
</p>

<p align="center">
  <a href="https://app.adrianluna.mx">app.adrianluna.mx</a>
</p>

---

Es **móvil primero** — los asesores la usan desde el piso de venta, entre cliente y cliente — y tiene además una interfaz de **escritorio** para gerencia en `/escritorio/*`.

<p align="center">
  <img src="docs/assets/app-claro.png" alt="Pantalla de acceso en tema claro" width="45%">
  &nbsp;&nbsp;
  <img src="docs/assets/app-oscuro.png" alt="Pantalla de acceso en tema oscuro" width="45%">
</p>

<p align="center">
  <sub>Tema claro y oscuro. Las dos capturas las genera el propio CI en cada ejecución: son las referencias contra las que se comparan las pruebas de regresión visual.</sub>
</p>

---

## Stack

| | |
|---|---|
| Framework | Next.js 15.5 (App Router) |
| Lenguaje | TypeScript (strict) |
| Estilos | Tailwind CSS 3.4 |
| Componentes | Base UI (headless) + componentes propios |
| Movimiento | framer-motion |
| Base de datos | PostgreSQL 16 + Prisma 5.22 |
| Sesión | JWT (HS256) con `jose` |
| Archivos | Cloudflare R2 (bucket privado) |
| Errores | Sentry |
| Runtime | Node 22.23 · **pnpm 10.12** |

---

## Cómo se alimenta de datos

La app **no captura ventas a mano**: las lee de dos archivos de Excel en SharePoint, a través de un Cloudflare Worker.

| Archivo | Alimenta | Tabla |
|---|---|---|
| **RDV** (Diario de ventas) | Ventas, metas, tráfico, comisiones | `Kpi` |
| **Horarios** | Quién trabaja cada día | `Schedule` |

> ⚠️ **Son archivos distintos y pueden contradecirse.** Para saber si alguien trabaja o descansa, la fuente de verdad es **`Schedule.status`** — nunca la meta diaria del RDV. Ver `lib/working-today.ts`.

Otros dos conceptos importantes:

- **Calendario retail**, no gregoriano. Semanas y meses se calculan con `lib/rdv-week.ts` y `lib/kpi-period.ts`.
- **Comisiones**: el alcance se mide contra el **mínimo**, no contra la meta. Asesor usa su mínimo individual; gerencia usa el de tienda. Ver `lib/commission.ts` (y sus tests antes de tocar nada).

---

## Puesta en marcha

```bash
pnpm install
pnpm exec prisma generate
pnpm run dev          # http://localhost:3000
```

Crea un `.env` (nunca lo subas al repo). Ver **`.env.example`** para la lista completa y comentada. Lo mínimo:

```env
DATABASE_URL="postgresql://USER:PASS@localhost:5432/clarvex_team?schema=public"
AUTH_SECRET="minimo-32-caracteres"        # openssl rand -base64 32
EXCEL_PROXY_WORKER_URL="https://tu-worker.workers.dev"
# + credenciales de R2, VAPID (push), WebAuthn y CRON_SECRET
```

---

## Seguridad

- **PIN** de 4 dígitos (bcrypt) + **biometría** (WebAuthn / Face ID / huella)
- **JWT** de 7 días con `sessionVersion`: el logout o un cambio de PIN invalidan los tokens anteriores al instante
- **Middleware** que exige sesión en todo `/api/*`, salvo una allowlist explícita (login, cron, webhooks)
- **Rate limiting** respaldado en Postgres (funciona entre procesos de PM2). Si la BD falla, cae a memoria local — *fail-closed*, nunca abre la puerta
- **Bucket R2 privado**: las fotos de perfil se sirven por un proxy autenticado (`/api/files/photo`) y el resto de archivos con **URLs firmadas** de 1 hora
- **Archivos separados por tienda** (`stores/<storeId>/…`): una tienda no puede leer los archivos de otra
- Headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options

> 🚨 **La cookie de sesión usa `sameSite=lax`. NO la subas a `strict`.**
> Con `strict`, Android **no adjunta la cookie** al abrir la PWA en frío desde el ícono, y el usuario acaba en `/login` cada vez que cierra la app. `lax` mantiene la protección CSRF que importa (no viaja en POST/PUT/DELETE cross-site). Ya se rompió una vez por "endurecerla".

---

## Monitoreo

- **`GET /api/health`** — público, verifica la BD. Devuelve `200 {status:"ok"}` o `503 {status:"degraded"}`. Lo consume **Uptime Kuma** (con alerta a Telegram).
- **`GET /api/health?deep=1`** con `Authorization: Bearer <CRON_SECRET>` — verifica además R2.
- **Sentry** para errores en producción. Session Replay está **desactivado a propósito**: grabaría datos de ventas y de empleados.

## Backups

`scripts/backup-db.ts` hace `pg_dump` y lo sube a R2 (retención 30 días). Corre por crontab diario en el VPS.

> Los respaldos van a un **bucket aislado** con su **propio token** (`BACKUP_R2_*`). Si compartieran credenciales con la app, la misma llave que sube las fotos podría borrar los backups — y un servidor comprometido destruiría los datos *y* las copias de seguridad de un tirón.

Restaurar:
```bash
docker exec -i clarvex_postgres pg_restore -d "$DB" --clean --if-exists < archivo.dump
```

---

## Antes de cada commit

```bash
pnpm exec tsc --noEmit
pnpm exec eslint . --max-warnings 0
NODE_ENV=test pnpm exec tsx --test tests/*.test.ts   # 403 tests
pnpm run build
```

> ⚠️ **`NODE_ENV=test` solo para los tests, nunca antes del `build`.** Con esa
> variable puesta, la guarda de `lib/prisma.ts` lanza al importarse y el build
> falla al recolectar datos de página, con un error que no señala la causa.

## Pantallas públicas (Playwright)

```bash
pnpm test:visual
```

Corre en navegador real, móvil, **claro y oscuro**, sobre `/login` y
`/mantenimiento` — las únicas que renderizan sin base de datos. Comprueba cosas
que ni el build, ni el lint, ni los 403 tests pueden ver:

- Que los tokens de color produzcan **colores válidos** y no canales sueltos
- Que los `@keyframes` de los efectos **lleguen al CSS servido**
- Que el fondo animado **no capture toques**
- Que las pantallas **rendericen sin excepciones**

> **Sobre comparar capturas de pantalla:** se intentó y se retiró. La app tiene
> demasiada actividad en el cliente (service worker, avisos de PWA,
> framer-motion, intro de apertura) y Playwright nunca conseguía dos capturas
> consecutivas idénticas: fallaba una de cada dos sin que nada hubiera cambiado.
> Hacerlo bien requiere un **modo de pruebas** en el build que apague todo eso.
> Está documentado en `tests/visual/public-pages.spec.ts` con los ocho enfoques
> que se probaron, por si alguien lo retoma.

## Despliegue (VPS)

```bash
cd /root/clarvex-app && git pull && pnpm install && pnpm exec prisma generate && pnpm run build && pm2 reload clarvex-team --update-env
```

`pm2 reload` en vez de `restart`: recarga rodante entre las dos instancias del
cluster, sin caída. Si el pull toca `prisma/`, añade `pnpm exec prisma migrate
deploy` antes del build.

### Ventana de mantenimiento

Para cerrar la app al equipo mientras se despliega algo delicado:

```bash
echo "MAINTENANCE_MODE=1" >> .env && pm2 reload clarvex-team --update-env   # cerrar
sed -i '/^MAINTENANCE_MODE=/d' .env && pm2 reload clarvex-team --update-env # abrir
```

`/api/health` sigue respondiendo 200 (para que Uptime Kuma no alerte) y los
`platformAdmin` entran igual, para poder verificar con la app cerrada al resto.

---

## Roles

| | Ve |
|---|---|
| **ASESOR** | Solo *sus* KPIs, metas, comisiones, horarios y pendientes |
| **GERENTE / SUBGERENTE** | KPIs de tienda y de cada asesor, horarios del equipo, todo lo demás. Puede crear y eliminar |
| **REGIONAL** | Varias tiendas |
| **platformAdmin** | Administración de la plataforma (`/admin`): alta de tiendas y facturación |

## Secciones

`/login` · `/manager` · `/advisor` · `/kpis` · `/horarios` · `/plan` · `/pendientes` · `/bitacora` · `/comunicados` · `/chat` · `/conteos` · `/faltantes` · `/capacitacion` · `/encuestas` · `/kudos` · `/checklist` · `/equipo` · `/solicitudes` · `/datos` · `/perfil` · `/suscripcion` · `/admin` · `/escritorio/*` (gerencia)

---

## Reglas que NO se rompen

```
❌ prisma migrate reset  ·  borrar tablas, usuarios o KPIs  ·  recrear la BD
❌ Meter datos demo
❌ Usar producción como entorno de pruebas
❌ Arreglar errores de tipos con `any`
❌ Cambiar la lógica de comisiones o las columnas del RDV sin aprobación
```

Más contexto para trabajar en el repo: **`CLAUDE.md`**.
