# Clarvex Team — CLAUDE.md

## Proyecto

**Nombre:** Clarvex Team  
**Propósito:** Aplicación web interna para gestión de asesores y gerencia en tienda retail.  
**Producción:** https://app.adrianluna.mx  
**Branch principal:** `main`

---

## Stack y versiones

| Tecnología | Versión |
|---|---|
| Next.js | 15.5.21 |
| React | 18.3.x |
| TypeScript | 5.7.x |
| Prisma | 5.22.0 |
| @prisma/client | 5.22.0 |
| Node.js | 22.23.1 (en el VPS) |
| pnpm | 11.14.0 (en el VPS) |
| Tailwind CSS | 3.4.x |
| web-push | 3.6.7 |
| @simplewebauthn/server | 13.3.1 |
| @simplewebauthn/browser | 13.3.0 |
| recharts | 3.8.x |
| zod | 4.4.x |
| framer-motion | 12.x |
| bcryptjs | 2.4.3 |
| jose | 6.x |
| @aws-sdk/client-s3 | 3.x (para R2) |

---

## Infraestructura

- **VPS Ubuntu en Vultr** — `216.238.88.93` (no es AWS; la documentación anterior estaba desactualizada)
- PM2 — proceso: `clarvex-team`, modo **cluster con 2 instancias**
- Docker — contenedor PostgreSQL: `clarvex_postgres` (imagen `postgres:16`)
- PostgreSQL — base: `clarvex_team`, host: `localhost`, puerto: `5432`
- Nginx Proxy Manager (contenedor `npm`)
- Cloudflare R2 (fotos de perfil y evidencias)
- Cloudflare DNS

**Ruta de la app en el VPS:** `/root/clarvex-app`

### Contenedores Docker en el mismo servidor

| Contenedor | Imagen | Para qué |
|---|---|---|
| `clarvex_postgres` | postgres:16 | Base de datos de la app |
| `npm` | jc21/nginx-proxy-manager | Proxy inverso + TLS |
| `n8n` | n8nio/n8n | Webhook de fotos → Telegram |
| `uptime-kuma` | louislam/uptime-kuma:2 | Monitoreo de `/api/health` |
| `vaultwarden` | vaultwarden/server | Gestor de contraseñas |
| `portainer` | portainer/portainer-ce | Administración de Docker |

⚠️ El VPS aloja **más servicios que esta app**. Un `docker compose down` o un reinicio a la ligera tumba también el proxy, el monitoreo y el gestor de contraseñas.

---

## Acceso al servidor

> ⚠️ **Este archivo se commitea al repositorio.** Aquí van solo rutas y nombres de host —
> **nunca** llaves privadas, tokens ni contenido de `.env`.

| Dato | Valor |
|---|---|
| Host | `216.238.88.93` (Vultr) |
| Usuario | `root` |
| Llave privada | `~/.ssh/clarvex_vultr` (Windows: `C:\Users\<usuario>\.ssh\clarvex_vultr`) |
| Alias en `~/.ssh/config` | `clarvex` |

```bash
ssh -i ~/.ssh/clarvex_vultr root@216.238.88.93
```

**Nota para Windows:** si la ruta del perfil lleva espacios (`C:\Users\Adrian L\...`), **no** la pases
en `-o UserKnownHostsFile=`: esa opción admite varios archivos separados por espacios y ssh parte
la ruta en dos, fallando con `Host key verification failed`. Usa una ruta sin espacios o entrecomilla
el valor dentro de la propia opción.

**Permisos de la llave:** OpenSSH rechaza llaves privadas accesibles por otros usuarios
(`UNPROTECTED PRIVATE KEY FILE`). En Windows, la llave debe ser **propiedad de tu usuario** y tener
la herencia desactivada:

```powershell
icacls "$env:USERPROFILE\.ssh\clarvex_vultr" /inheritance:r /grant:r "$env:USERDOMAIN\$env:USERNAME:F"
```

Si el archivo pertenece a `BUILTIN\Administradores`, `icacls` falla con «Acceso denegado» sin
elevación. Atajo sin necesidad de administrador: **copiar** el archivo a tu perfil — la copia nace
siendo tuya y ya puedes cerrarle los permisos.

---

## Actualizar la app en producción

**Fuente de verdad: GitHub (`main`).** El VPS solo consume; nunca se edita código directamente ahí.

```bash
# 1. En local — verificaciones obligatorias ANTES de subir
pnpm install
pnpm exec prisma generate
pnpm run build
pnpm exec eslint . --max-warnings 0
git add . && git commit -m "descripcion" && git push origin main

# 2. En el VPS
ssh -i ~/.ssh/clarvex_vultr root@216.238.88.93
cd /root/clarvex-app
git pull
pnpm install
pnpm exec prisma generate
pnpm run build
pm2 restart clarvex-team --update-env

# 3. Verificar
pm2 list
curl -s https://app.adrianluna.mx/api/health
```

Tras cambios en datos del RDV: ejecutar **«Sincronizar ahora»** desde el Centro de Datos en la app.

### Comandos útiles en el VPS

```bash
pm2 logs clarvex-team --lines 100   # logs de la app
pm2 restart clarvex-team --update-env
docker ps                            # estado de contenedores
ls /root/logs/                       # logs de los crons
df -h /                              # espacio en disco
```

### Crons

Están en el **crontab de `root`** (`crontab -l`), no en el repositorio. Casi todos son `curl` a
`/api/cron/*` con `Authorization: Bearer $CRON_SECRET`. Los dos que no son curl:

- `30 9 * * *` — `pnpm exec tsx scripts/backup-db.ts` (respaldo diario a R2)
- `/root/clarvex-app/cron-plan-reminder.sh` y `cron-pending-overdue-managers.sh`

⚠️ Los horarios del crontab están en **UTC**; los comentarios se refieren a hora de Monterrey.

---

## Variables de entorno requeridas

```env
DATABASE_URL=
EXCEL_PROXY_WORKER_URL=
AUTH_SECRET=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
WEBAUTHN_RP_ID=
WEBAUTHN_RP_NAME=
WEBAUTHN_ORIGIN=
CRON_SECRET=
```

### Opcionales

```env
# Sentry — monitoreo de errores. Sin DSN, Sentry queda desactivado (no-op).
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ORG=          # solo para subir source maps
SENTRY_PROJECT=      # solo para subir source maps
SENTRY_AUTH_TOKEN=   # solo para subir source maps

# Webhook de fotos → n8n → Telegram. Sin WEBHOOK_URL queda desactivado.
WEBHOOK_URL=
WEBHOOK_STORE_IDS=   # obligatorio para activarlo: lista de storeId separados por coma
WEBHOOK_SECRET=      # se manda como header X-Clarvex-Secret
```

## Fotos a Telegram (n8n)

Cuando un asesor sube una **evidencia** o un **faltante con foto**, la app avisa a un webhook de n8n, que reenvía la imagen a un canal de Telegram con un pie de foto identificable (quién, de qué, cuándo).

- El mensaje lo arma **la app** (`lib/webhook-caption.ts`), no n8n. El flujo de n8n es: Webhook → Telegram `sendPhoto` con `caption` + `imageUrl`.
- **Fire-and-forget** (`lib/webhooks.ts`): timeout de 5 s y nunca lanza. Si n8n está caído, la evidencia se guarda igual — no se rompe una subida por una notificación.
- **Filtro por tienda obligatorio:** sin `WEBHOOK_STORE_IDS` no se manda nada. Al ser multi-tienda, las fotos de una tienda no pueden acabar en el canal de otra.
- La `imageUrl` es una URL **firmada de 6 h** (el bucket R2 es privado); ese margen le permite a n8n reintentar.
- ⚠️ Las fotos salen de la infraestructura propia: quien esté en el canal las ve.

## Backups

- **Script:** `scripts/backup-db.ts` (pg_dump → R2 bajo `backups/`, retención 30 días). Corre por crontab diario en el VPS.
- **Bucket aislado:** los respaldos deben ir a un bucket R2 **propio**, con su **propio token** (`BACKUP_R2_*`). Si comparten bucket y credenciales con la app, la misma llave que sube las fotos puede borrar los backups — un VPS comprometido destruiría datos y copias de un tirón.
- **Restaurar:** `docker exec -i clarvex_postgres pg_restore -d "$DB" --clean --if-exists < archivo.dump`

## Monitoreo

- **Health-check:** `GET /api/health` (público, sin sesión) — verifica la BD. Devuelve `200 {status:"ok"}` o `503 {status:"degraded"}`. Consumido por Uptime Kuma en el VPS.
- **Chequeo profundo:** `GET /api/health?deep=1` con header `Authorization: Bearer <CRON_SECRET>` — además verifica R2 (HeadBucket).
- **Errores en producción:** Sentry (`@sentry/nextjs`). Session Replay desactivado a propósito (grabaría datos de ventas y empleados).

---

## Roles de usuario

### ASESOR / VENDEDOR
- Ve **solo** sus ventas, metas y KPIs personales.
- NO ve ventas ni metas de otros asesores.
- NO ve metas de tienda.
- Ve sus propios horarios.
- Ve sus propios pendientes asignados.
- NO tiene botón de eliminar en comunicados, planes ni pendientes.

### GERENTE / SUBGERENTE
- Ve KPIs de tienda completos.
- Ve KPIs por asesor individualmente.
- Ve horarios de todo el equipo.
- Crea y gestiona comunicados.
- Crea, reasigna y cierra pendientes.
- Accede a evidencias y comentarios de todos.
- Tiene botón eliminar en comunicados, planes del día y pendientes (con confirmación).

---

## Fuente de datos — RDV (SharePoint XLSX)

El Worker descarga el archivo como **XLSX** desde `EXCEL_PROXY_WORKER_URL` usando `exceljs`.

### Hojas del Excel

| Hoja | Filas | Uso |
|---|---|---|
| Diario de ventas | 55 | Datos diarios por empleado |
| Informe | 84 | — |
| KPIs Generales PDV | 30 | KPIs de tienda ya calculados |
| KPIs x Colaborador | 18 | KPIs individuales por asesor |
| COMISIONES | 18 | Cálculo de comisiones y bonos |

### Estructura hoja "Diario de ventas"

- Fila 1: Metadata (MARCA, CENTRO COMERCIAL, etc.)
- Fila 5: Roles (GERENTE, SUBGERENTE 1... TOTALES)
- Fila 6: Números de empleado
- Fila 7: Nombres completos
- Fila 9: Headers de columnas por empleado
- Filas 10+: Datos diarios
- Fila TTLS: Totales del mes

**Mapeo de columnas por empleado** (bloque de 11 cols):

| Offset | Campo |
|---|---|
| +0 | Meta diaria |
| +1 | VTAS Ttls SIN IVA (Venta) |
| +2 | TX Ttls (Tickets) |
| +3 | Unid Ttls (Piezas) |

| Empleado | Col inicio |
|---|---|
| GERENTE | 3 |
| SUBGERENTE 1 | 14 |
| SUBGERENTE 2 | 25 |
| VENDEDOR 1 | 36 |
| VENDEDOR 2 | 47 |
| VENDEDOR 3 | 58 |
| ... (cada 11 cols) | |
| TRÁFICO | 168 (col única) |
| TOTALES Meta | 169 |
| TOTALES Venta | 170 |
| TOTALES TX | 171 |
| TOTALES Unid | 172 |

---

## KPIs — Fórmulas

```
UPT        = piezas / tickets
AUR        = venta / piezas
EPT        = venta / tickets
Conversión = tickets / tráfico
Alcance    = venta / meta  (expresado en %)
```

Si algún divisor es 0, null o undefined → mostrar `—` en lugar de 0.

**Vista Mes:** suma de todos los días del mes retail.
**Vista Semana:** suma únicamente de los días de esa semana retail. Consultas completamente independientes — NO compartir datos entre semana y mes.

**Meta asesor:** suma de "Meta diaria" de su columna en el RDV para el período.
**Meta gerente/subgerente:** meta de tienda (TOTALES col 169).

**Tráfico:** col 168 del RDV — usarlo solo para Conversión de tienda.

**Importante:** Semana y mes usan **calendario retail**, NO calendario gregoriano.

---

## Comisiones — Brackets por rango de alcance

| Puesto | ≤ 99.99% | 100% – 114.99% | ≥ 115% |
|---|---|---|---|
| GERENTE | 1.25% | 1.56% | 1.87% |
| SUBGERENTE | 0.93% | 1.16% | 1.39% |
| VENDEDOR | 1.53% | 1.91% | 2.29% |

### Reglas críticas de comisión — YA IMPLEMENTADAS, NO CAMBIAR

**Alcance para comisión = Venta / MÍNIMO** (NO venta/meta)

**ASESOR/VENDEDOR:**
- Venta = su venta individual
- Mínimo = su mínimo individual de la hoja COMISIONES
- Alcance = venta individual / mínimo individual

**GERENTE/SUBGERENTE:**
- Venta = venta total de tienda (TOTALES)
- Mínimo = mínimo de tienda (TOTALES de la hoja COMISIONES)
- Alcance = venta tienda / mínimo tienda

El % de comisión difiere por puesto pero el mínimo de referencia es el mismo para gerente y subgerente.

---

## Estado actual del proyecto — Junio 2026

### ✅ Resuelto y funcionando

- Build limpio sin errores
- Prisma estable — enums y Client correctos
- GitHub Actions verde
- Login PIN funcional
- Login biométrico (Face ID / huella) funcional — WebAuthn implementado
- Dashboard asesor — KPIs personales correctos
- Dashboard gerente — KPIs tienda + por asesor
- Meta mensual correcta ($504,771 desde TOTALES RDV)
- UPT, AUR, EPT funcionando con datos reales
- Conversión con tráfico real del RDV
- Vista Semana y Mes independientes con filtro correcto
- Comisiones con mínimo correcto (asesor: mínimo individual, gerencia: mínimo tienda)
- Fotos de perfil visibles para todos los usuarios (Cloudflare R2)
- Push Notifications funcionando con app cerrada (Android + PWA)
- Botón eliminar para gerente/subgerente en comunicados, planes y pendientes
- Producción estable en app.adrianluna.mx

### ⚠️ Áreas a no tocar sin revisión previa

- Lógica de comisiones (cálculo con mínimo) — ya correcta
- Fuente de datos KPIs (columnas del RDV) — ya correcta
- Vista Mes de KPIs — ya correcta
- Push Notifications — ya funcional

---

## Flujo de trabajo obligatorio

**Fuente de verdad: GitHub (`main`). Nunca usar VPS como fuente principal.**

El procedimiento completo (local → GitHub → VPS) está en
[Actualizar la app en producción](#actualizar-la-app-en-producción).

Regla que no se salta: **build y lint en verde ANTES de commitear**. Desplegar código que no
compiló localmente deja la producción a merced de un error de tipado que se descubre recién al
reiniciar PM2.

---

## Reglas críticas — NUNCA hacer

```
❌ prisma migrate reset
❌ Borrar tablas, datos, usuarios, comunicados o KPIs
❌ Recrear la base de datos
❌ Introducir datos demo
❌ Usar producción como entorno de pruebas
❌ Solucionar errores de tipado reemplazando todo con: any / string / unknown
❌ Cambiar la lógica de comisiones sin aprobación explícita
❌ Cambiar las columnas del RDV que ya funcionan
```

---

## Base de datos — Notas conocidas

- Volumen PostgreSQL: `/root/stack/postgres`
- Error previo resuelto: `could not open file global/pg_filenode.map Permission denied` — no repetir cambios destructivos.
- Se ejecutó `UPDATE "Kpi" SET conversion = 0 WHERE conversion IS NULL` — 22 registros corregidos.

---

## Comandos obligatorios antes de cerrar cualquier sesión

```bash
pnpm install
pnpm exec prisma generate
pnpm run build
pnpm exec eslint . --max-warnings 0
git status   # debe quedar limpio
```

---

## Checklist de producción

- [x] Build exitoso sin errores
- [x] Prisma estable con tipado correcto
- [x] GitHub Actions verde
- [x] Login PIN funcional
- [x] Login biométrico funcional (Face ID / huella)
- [x] Dashboard asesor — KPIs personales correctos
- [x] Dashboard gerente — KPIs tienda + por asesor
- [x] Comisiones correctas con mínimo
- [x] Fotos de perfil visibles para todos
- [x] Cloudflare R2 funcional (fotos + evidencias)
- [x] Pendientes funcionales con notificaciones
- [x] Comunicados funcionales con push
- [x] Notificaciones internas funcionales
- [x] Push Notifications funcionales (Android + PWA)
- [x] Botón eliminar para gerente/subgerente
- [x] PWA instalable en móvil
- [x] Producción estable en app.adrianluna.mx

---

## Margen DTO (Descuentos POS)

Fuente: archivo XLSX separado vinculado en Centro de Datos (SharePoint).

### Estructura hoja "MARGEN DTO"

- Datos empiezan en **fila 6**
- Col 1: vacía
- Col 2: header de semana (`SEMANA 22`, `SEMANA 23`...)
- Col 3: número de empleado (int) o `TIENDA TOTAL`
- Col 4: nombre del empleado
- Col 5: venta bruta (número)
- Col 6: descuento (número)
- **NO hay columna de margen %** — se calcula: `margen = descuento / venta_bruta`

### Reglas del parser

- Detectar bloque: `row.values[2]` empieza con `"SEMANA"`
- Fila empleado: `typeof row.values[3] === 'number'`
- Fila tienda: `row.values[3] === 'TIENDA TOTAL'`
- Solo guardar donde `venta_bruta > 0`
- Si semana actual sin datos → mostrar semana más reciente con datos
- Mostrar `—` si no hay datos — NUNCA "Sin datos POS" cuando el archivo está vinculado

---

## ⚠️ Bug conocido excelJS — Arrays Sparse

`row.values` en excelJS es un **array sparse**. NUNCA usar `.map()` directo — preserva huecos y causa crashes.

```typescript
// ❌ MAL — undefined.includes() → crash
const cols = row.values.map(v => v)
cols.findIndex(v => v.includes('texto'))

// ✅ BIEN — densificar primero
const cols = Array.from(row.values, v => v ?? null)
cols.findIndex(v => v && String(v).includes('texto'))
```

Aplicar `Array.from()` en TODOS los parsers que usen `row.values`.
