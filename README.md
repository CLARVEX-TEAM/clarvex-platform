<p align="center">
  <img src="docs/assets/cover.png" alt="Clarvex Team" width="100%">
</p>

<p align="center">
  <a href="https://github.com/CLARVEX-TEAM/clarvex-platform/actions/workflows/ci.yml">
    <img src="https://github.com/CLARVEX-TEAM/clarvex-platform/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
  <img src="https://img.shields.io/badge/Next.js-15.5-000000?logo=nextdotjs&logoColor=white" alt="Next.js 15.5">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript strict">
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL 16">
  <img src="https://img.shields.io/badge/tests-1190-16A34A" alt="1190 tests">
</p>

<p align="center">
  <b>La operación diaria de una tienda retail, en el teléfono del equipo.</b><br>
  KPIs, comisiones, horarios, plan del día, pendientes, chat y comunicados.
</p>

<p align="center">
  <a href="https://team.clarvex.tech">team.clarvex.tech</a>
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

La captura operativa vive en **Retool** (`captura-clarvex`) y escribe por la API
segura de Clarvex: horarios, asistencia, KPIs, tráfico, descuentos, ticket
electrónico y Cuota Justa.

⚠️ **Ya no se leen los Excel de SharePoint.** Axo deshabilitó los enlaces
anónimos el 11 de agosto de 2026 y cinco de las seis fuentes cayeron. La
estructura de columnas del RDV se conserva documentada en `CLAUDE.md` porque
define qué significa cada dato, no porque siga siendo la fuente.

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
pnpm test                                            # 1190 pruebas
pnpm run build
```

Y para lo que no es código de la app:

```bash
bash tests/deploy-release.sim.sh    # el despliegue por versiones, sin AWS
bash -n scripts/*.sh                # los guiones de operación se pueden leer
```

> ⚠️ **`NODE_ENV=test` solo para los tests, nunca antes del `build`.** Con esa
> variable puesta, la guarda de `lib/prisma.ts` lanza al importarse y el build
> falla al recolectar datos de página, con un error que no señala la causa.

## Integración y aislamiento entre tiendas

```bash
pnpm exec tsx --test tests/integracion/*.test.ts
```

⚠️ **Solo corren en CI.** Necesitan `TEST_DATABASE_URL` apuntando a un Postgres
local y desechable, ya sembrado. Sin esa variable **se saltan solas**, que es lo
correcto: `tests/seed-test-db.ts` hace `TRUNCATE ... CASCADE` sobre todas las
tablas, y en una máquina de desarrollo no hay garantía de que la base apuntada
sea de mentira.

El trabajo `integracion` de la CI levanta ese Postgres como servicio efímero,
con credenciales de mentira, y deja las variables de R2, Slack, Bedrock y Mercado
Pago **vacías a propósito** para que nada salga a la red.

⚠️ Antes de truncar se comprueba el CONTENIDO, no solo el nombre de la base: un
usuario sin prefijo `TEST-` o una tienda que no sea sintética abortan el
borrado. Que la URL contenga «test» no basta.

## Pantallas públicas (Playwright)

```bash
pnpm test:visual
```

Corre en navegador real, móvil, **claro y oscuro**, sobre `/login` y
`/mantenimiento` — las únicas que renderizan sin base de datos. Comprueba cosas
que ni el build, ni el lint, ni las pruebas de Node pueden ver:

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

## Despliegue

**Actions → Deploy → Run workflow**, escribiendo `DESPLEGAR`. No hace falta
entrar por `ssh`.

Sigue siendo **manual a propósito**: la app calcula la nómina de doce personas y
corre en una máquina de 3.7 GB donde `next build` tarda minutos apoyándose en
swap. Desplegar en cada commit encadenaría builds que no caben a la vez.

El workflow espera a que la **CI del mismo commit** termine verde, canjea un
token OIDC por credenciales de una hora y ejecuta `scripts/deploy-release.sh` en
el servidor mediante SSM. Sin llaves guardadas y sin abrir el puerto 22.

### Cada versión se construye APARTE

```
/home/ubuntu/clarvex/
├─ repo/                     el clon; solo se le hace fetch
├─ compartido/.env           uno solo, lo comparten todas las versiones
├─ releases/<fecha>-<sha>/   una carpeta por versión, con su .next
└─ estado/actual             qué versión se está sirviendo
```

⚠️ **No construir sobre la instalación viva.** Aquí vivía un `git pull && pnpm
run build` de una línea sobre el directorio que se estaba sirviendo, y es
exactamente lo que este esquema vino a retirar: `next build` reescribe `.next`
en el sitio, así que mientras compila la versión activa está desmontada y, si el
build falla, no queda nada a lo que volver sin recompilar. (La ruta que citaba,
`/root/clarvex-app`, era además la del servidor viejo, apagado desde el 27 de
agosto de 2026.)

⚠️ **Volver atrás no recompila.** La versión anterior conserva su `.next` y su
`node_modules`, así que recuperarse es apuntar PM2 a esa carpeta. El guion ya lo
hace solo si la nueva no arranca o no responde sana; a mano, desde el servidor
—`estado/anterior` solo existe a partir del segundo despliegue—:

```bash
ANTERIOR=$(cat /home/ubuntu/clarvex/estado/anterior)
pm2 delete clarvex-team && pm2 start "$ANTERIOR/ecosystem.config.cjs" --update-env && pm2 save
echo "$ANTERIOR" > /home/ubuntu/clarvex/estado/actual
```

⚠️ **Las migraciones NO vuelven atrás**: revertir el código no deshace un
`ALTER TABLE`. Por eso las migraciones de este proyecto son aditivas, y el guion
avisa cuando aplicó una.

Lo que decide el despliegue ante cada fallo está cubierto por
`tests/deploy-release.sim.sh`, que corre en CI con un `pnpm`, `pm2` y `curl` de
mentira y sin tocar nada real.

### Ventana de mantenimiento

Para cerrar la app al equipo mientras se hace algo delicado. El `.env` es **uno
solo y compartido** por todas las versiones:

```bash
echo "MAINTENANCE_MODE=1" >> /home/ubuntu/clarvex/compartido/.env && pm2 reload clarvex-team --update-env   # cerrar
sed -i '/^MAINTENANCE_MODE=/d' /home/ubuntu/clarvex/compartido/.env && pm2 reload clarvex-team --update-env # abrir
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

---

## Propiedad

**Copyright © 2026 Adrian Luna. Todos los derechos reservados.**

Software propietario. No es de código abierto. Queda prohibida su copia,
modificación, distribución o uso sin autorización previa y por escrito del
titular. Ver [`LICENSE`](LICENSE).

El acceso concedido para evaluación o auditoría es temporal, revocable, limitado
a la lectura y no transfiere derecho alguno sobre el software.
