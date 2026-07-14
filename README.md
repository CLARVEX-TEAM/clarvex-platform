# CLARVEX Team

Aplicación web (PWA) para la operación diaria de una tienda retail: KPIs, comisiones, horarios, plan del día, pendientes, chat, comunicados y más.

**Producción:** https://app.adrianluna.mx

Es **mobile-first** (los asesores la usan desde el piso de venta) y tiene además una interfaz de **escritorio** para gerencia en `/escritorio/*`.

---

## Stack

| | |
|---|---|
| Framework | Next.js 15.5 (App Router) |
| Lenguaje | TypeScript (strict) |
| Estilos | Tailwind CSS |
| Base de datos | PostgreSQL + Prisma 5.22 |
| Sesión | JWT (HS256) con `jose` |
| Archivos | Cloudflare R2 (bucket privado) |
| Errores | Sentry |
| Node | 22.x · **pnpm** |

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
NODE_ENV=test pnpm exec tsx --test tests/*.test.ts   # 243 tests
pnpm run build
```

## Despliegue (VPS)

```bash
cd /home/ubuntu/clarvex-app && git pull && pnpm install && pnpm exec prisma generate && pnpm run build && pm2 restart clarvex-team --update-env
```

Si el pull toca `prisma/`, añade `pnpm exec prisma migrate deploy` antes del build.

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
