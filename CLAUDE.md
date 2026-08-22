# Clarvex Team — CLAUDE.md

## Cuota Justa y cierre semanal nativos — 22 de agosto de 2026

La Cuota Justa y el RDS se administran en Retool desde `/cuota-justa`; el Excel
deja de ser la base y pasa a ser una exportacion.

**Son periodos independientes:** Retool tiene un selector para RDS y otro para
Cuota Justa. Por defecto abre RDS en la semana anterior y CJ en la semana
actual, que es el flujo real de los domingos. El API usa `reportWeekStart` y
`quotaWeekStart`; `weekStart` queda solo como compatibilidad heredada.

- `lib/fair-quota.ts`: minimo diario + 15 %, gerente 10 %, subgerente 15 % y
  remanente entre asesores presentes. `INVENTORY` cuenta como laborado. Cada dia
  suma 100 % y el dinero cierra al centavo.
- `WeeklyPerformanceClose`: un registro por tienda/semana. Borrador editable y
  cierre final congelado con snapshot; una semana finalizada no se reabre.
- API: `GET|POST /api/admin/capture/weekly-performance` y
  `GET /api/admin/capture/weekly-performance/export`, con
  `ADMIN_CAPTURE_SECRET`. Guardar actualiza solo metas diarias y el presupuesto
  semanal de WhatsApp; no toca ventas.
- La plantilla exacta esta en `templates/cuota-justa-rds.xlsx`. El exportador
  usa JSZip para conservar hojas, estilos y formato de impresion, limpia los
  `#REF!` de la hoja oculta `HORARIOS` y fuerza recalculo al abrir.
- El importador por pegado de CJ sigue disponible como respaldo en KPIs.
- Retool: `backend/weeklyPerformance/*`, `frontend/pages/WeeklyPerformance.tsx`
  y ruta `/cuota-justa`. Desplegar siempre Clarvex antes que Retool.

Desplegado el 22 de agosto de 2026: Clarvex `2c358cb`, migracion
`20260822183000_weekly_performance_close` y Retool `7fb6cbf` (commit posterior
al publish `d433df9`). Respaldo previo:
`/root/pre-weekly-performance-20260822.dump`. Produccion cargo TH San Agustin,
semana 33, 7 dias y 5 colaboradores, y genero
`CUOTA-JUSTA-RDS-SEMANA-33.xlsx` valido (51,098 bytes). PM2 quedo con dos
instancias online y `/api/health` en estado `ok`.

Correccion de periodos desplegada el mismo dia: Clarvex `17c1826` y Retool
`ce2b0f3` (commit posterior al publish `ae511d5`). Produccion devolvio RDS S33
con su meta historica de $132,962.06 y CJ S34 por separado; el export fue
`CUOTA-JUSTA-S34-RDS-S33.xlsx` (51,058 bytes). No requirio migracion.

Selectores independientes desplegados el mismo dia: Clarvex `ada8c46` y Retool
`afa34f8` (commit posterior al publish `e617f3f`). Produccion acepto RDS S33 con
CJ S35 en una prueba de solo lectura, demostrando que ya no fuerza semanas
consecutivas. Al guardar el primer borrador, la pareja elegida queda fija para
evitar mover metas ya aplicadas a otra semana.

Validacion: 899 pruebas, ESLint y build de produccion en verde; `retool check`
pasa las cuatro fases locales.

---

## Proyecto

**Nombre:** Clarvex Team  
**Propósito:** Aplicación web interna para gestión de asesores y gerencia en tienda retail.  
**Producción:** https://app.adrianluna.mx  
**Branch principal:** `main`

---

## Stack y versiones

Verificado contra el `package.json` y contra lo que realmente corre en el VPS
(28 de julio de 2026).

### Runtime

| Tecnología | Versión | Nota |
|---|---|---|
| Node.js | 22.23.1 | Misma versión en VPS y en local |
| pnpm | **10.12.1** | Fijado por `packageManager` en `package.json` |
| Ubuntu | 26.04 LTS | En el VPS |
| PostgreSQL | 16 | Imagen `postgres:16` en Docker |

⚠️ **Usar siempre pnpm vía `corepack`**, que respeta el `packageManager`. Un `pnpm`
global de otra versión instala un árbol de dependencias distinto al del servidor.

### Dependencias

| Paquete | Versión en `package.json` |
|---|---|
| next | 15.5.21 |
| react | ^18.3.1 |
| typescript | ^5.7.2 |
| prisma / @prisma/client | 5.22.0 (ambos fijos, sin `^`) |
| tailwindcss | ^3.4.16 |
| web-push | ^3.6.7 |
| @simplewebauthn/server | ^13.3.1 |
| @simplewebauthn/browser | ^13.3.0 |
| recharts | ^3.8.1 |
| zod | ^4.4.3 |
| framer-motion | ^12.40.0 |
| bcryptjs | ^2.4.3 |
| jose | ^6.2.3 |
| @aws-sdk/client-s3 | ^3.1086.0 (para R2) |
| @smithy/node-http-handler | 4.9.5 (transporte IPv4 de R2) |
| @sentry/nextjs | ^10.65.0 |
| exceljs | ^4.4.0 (parser del RDV) |

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
# Las llaves ${...} son obligatorias: sin ellas PowerShell interpreta
# "$env:USERNAME:F" como un nombre de variable e icacls falla con "Parametro no valido".
icacls "$env:USERPROFILE\.ssh\clarvex_vultr" /inheritance:r /grant:r "${env:USERDOMAIN}\${env:USERNAME}:F"
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
pnpm test                      # 687 tests; deben pasar todos

# Preferir SIEMPRE archivos explicitos sobre `git add .`:
git status --short              # revisar que no haya .env, respaldos ni volcados
git add <archivo> [<archivo>...]
git commit -m "descripcion"
git push origin main

# 2. En el VPS
ssh -i ~/.ssh/clarvex_vultr root@216.238.88.93
cd /root/clarvex-app
git pull
pnpm install
pnpm exec prisma generate
pnpm exec prisma migrate deploy   # SOLO si el cambio trae migración nueva
pnpm run build
pm2 restart clarvex-team --update-env

# 3. Verificar
pm2 list
curl -s https://app.adrianluna.mx/api/health
```

La operación ya no usa «Sincronizar ahora» ni Centro de Datos. Horarios,
Asistencia, KPIs, Descuentos y Ticket electrónico se capturan en Retool; no
reactivar los crons heredados de Excel.

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

## Variables de entorno

Inventario real del `.env` del VPS (28 de julio de 2026): **37 variables**. La lista
anterior de este documento solo cubría 14 — faltaban Mercado Pago, Power BI, los
proveedores de IA, Zendesk y el bucket de respaldos.

### Núcleo — sin esto la app no arranca

```env
DATABASE_URL=
AUTH_SECRET=            # >= 32 caracteres; en produccion se valida y lanza si es corto
CRON_SECRET=            # Bearer de todas las rutas /api/cron/*
EXCEL_PROXY_WORKER_URL= # Worker que sirve el XLSX del RDV
```

### Cloudflare R2 — fotos y evidencias

```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=
CLOUDFLARE_ACCOUNT_ID=
```

#### Incidente de subidas del kiosko — resuelto el 13 de agosto de 2026

Fotos, escaneos y PDFs del checklist se quedaban en «Procesando» y no creaban
filas en `ChecklistEntry`/`ChecklistScan`. No era la cámara ni el parser: el
endpoint de Cloudflare R2 publica A y AAAA, pero el VPS no tiene una ruta IPv6
funcional. El transporte del AWS SDK intentaba IPv6 y podía tardar entre 20 y
más de 90 segundos.

La corrección definitiva está en `a20aff1`: `lib/r2.ts` usa un
`NodeHttpHandler` con agente HTTPS `family: 4`, `keepAlive`, límite de conexión
de 5 s y límite de socket de 30 s. `setDefaultResultOrder("ipv4first")` se
conserva como primera defensa, pero **no basta por sí solo**; no retirar el
handler IPv4 mientras el VPS siga sin salida IPv6.

Verificación de producción tras desplegar: health profundo (DB + R2) en 411 ms
y escritura + `HeadObject` en 553 ms; el objeto temporal se eliminó. Pasaron
lint, TypeScript, build y las 687 pruebas. Los intentos fallidos anteriores al
despliegue no llegaron a la base ni al bucket y deben capturarse otra vez.

### Respaldos — bucket y token SEPARADOS de los de la app

```env
BACKUP_R2_ACCESS_KEY_ID=
BACKUP_R2_SECRET_ACCESS_KEY=
BACKUP_R2_BUCKET_NAME=
```

### Notificaciones push (VAPID)

```env
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
```

### Correo transaccional (Resend) — restablecer el PIN

```env
RESEND_API_KEY=
RESEND_FROM=          # Ej. "Clarvex Team <no-reply@adrianluna.mx>"
APP_URL=              # Opcional: si falta, se usa WEBAUTHN_ORIGIN
```

⚠️ **El dominio de `RESEND_FROM` tiene que estar verificado en Resend.** Sin
verificar, la API responde 403 y el correo no sale. El fallo se registra en los
logs (`[pin-reset]`) pero **al usuario NO se le dice**: contárselo revelaría que
ese número de empleado existe.

Sin estas variables la app sigue funcionando: el restablecimiento por correo
simplemente no manda nada (y lo registra en el log). El login no se rompe.

⚠️ **La mayoría de los usuarios NO tiene correo real.** La app inventa
`<numero>@clarvex.local` al dar de alta a alguien, y a ese dominio no llega
nada. Hay que capturar los correos reales desde el perfil de cada quien o desde
`/equipo`. `hasRealEmail()` en `lib/email.ts` es quien distingue uno del otro.

### Biometría (WebAuthn)

```env
WEBAUTHN_RP_ID=
WEBAUTHN_RP_NAME=
WEBAUTHN_ORIGIN=
```

⚠️ `lib/webauthn.ts` **lanza al importarse** si faltan `WEBAUTHN_RP_ID` u
`WEBAUTHN_ORIGIN` con `NODE_ENV=production` — y `next build` lo es. Sin ellas el
**build falla** en «Collecting page data», aunque el código esté bien. Para compilar
en local basta con ponerlas en `.env.local` con valores de `localhost`.

### Mercado Pago — suscripciones

```env
MP_ACCESS_TOKEN=
MERCADOPAGO_WEBHOOK_SECRET=   # ⚠️ FALTA EN EL VPS — ver aviso abajo
```

> 🔴 **`MERCADOPAGO_WEBHOOK_SECRET` no está configurada en producción.**
> `lib/mercadopago-webhook.ts` es *fail-closed*: si el secreto falta y
> `NODE_ENV=production`, la verificación de firma devuelve `false` y
> `app/api/webhooks/mercadopago/route.ts` responde **401 a todo webhook entrante**.
> Es decir: los pagos de suscripción no se procesan solos. Hay que darla de alta
> desde el panel de Mercado Pago y añadirla al `.env`.

### Inteligencia artificial

```env
AI_PROVIDER=            # selecciona el proveedor activo
GEMINI_API_KEY=
GROQ_API_KEY=
CLOUDFLARE_AI_TOKEN=
```

#### Lectura del reporte del POS — Bedrock, con Gemini de respaldo

```env
BEDROCK_ACCESS_KEY_ID=
BEDROCK_SECRET_ACCESS_KEY=
BEDROCK_POS_MODEL=      # opcional; por omisión us.anthropic.claude-haiku-4-5-20251001-v1:0
BEDROCK_REGION=         # opcional; por omisión us-east-1
```

Desde el 21 de agosto de 2026 `lib/pos-vision.ts` intenta **Bedrock primero** y
deja **Gemini de red**. Medido con una captura real: 12 de 12 campos correctos
en 3.7 s, contra los 10-15 s de Gemini. Sin estas variables no se activa y todo
sigue como antes.

⚠️ **Nombre propio, no `AWS_*`.** El cliente de R2 también es del SDK de AWS;
unas variables genéricas sueltas en el entorno podrían acabar mandando las fotos
a otra parte.

⚠️ **El ID del modelo lleva prefijo `us.`** — es el perfil de inferencia. El ID
que aparece en el catálogo de Bedrock **no se puede invocar directo**.

⚠️ **Bedrock envuelve el JSON en ` ```json `.** `stripCodeFence` lo quita; sin
eso el parseo falla siempre, y falla al final con el trabajo ya hecho.

Las credenciales salen del usuario IAM **`clarvex-bedrock`**, acotado a invocar
modelos de Anthropic y nada más. **Es temporal: sobra el día que la app corra en
EC2** — ver `AGENTS.md`, sección AWS.

#### Cómo se prepara la imagen antes de mandarla (`frontend/utils/shrinkImage.ts` en Retool)

Tres hallazgos del 21 de agosto de 2026, todos medidos contra el mismo reporte
real. Van juntos porque tirar de uno rompe otro:

1. ⚠️ **Una captura PEQUEÑA se AGRANDA.** Contra toda intuición. La ventana del
   visor del POS mide 1024 px y ahí cada dígito queda de ocho o nueve píxeles:
   el modelo leía `4,498` como `4499` y «JAZMIN» como «JASMIN». Al doble, la
   misma imagen y el mismo modelo la leen perfecta. Lo confirmó el caso opuesto:
   una **foto del monitor** de 4080 px se leía BIEN pese a estar peor tomada.
   **Manda cuántos píxeles tiene cada dígito, no lo nítida que se ve.**
2. ⚠️ **No recomprimir lo que ya cabe.** Una versión anterior pasaba a JPEG
   cualquier imagen de más de 400 KB aunque no hiciera falta reducirla. Una
   captura es texto nítido: al 85 % los dígitos finos se emborronan y empieza a
   leer mal.
3. ⚠️ **Al agrandar, JPEG al 95 %, no PNG.** El PNG conserva todo pero pesaba
   788 KB en base64 contra 418 en JPEG. Ese archivo **sube dos veces** —al panel
   y de ahí al servidor—, así que el peso se paga doble: con PNG la captura
   tardaba **hasta un minuto** aunque el servidor respondiera en 3.4 s.

Medido para separar culpas: `readPosReport` en el servidor tarda **3.4 s** con
la lectura correcta. Todo lo que exceda eso es subida, no modelo.

**El PDF exportado sigue siendo lo más exacto y lo más ligero** (~32 KB): el
modelo lee su texto embebido en vez de descifrar píxeles.

### Power BI

```env
POWER_BI_APP_TENANT_ID=
POWER_BI_CLIENT_ID=
POWER_BI_CLIENT_SECRET=
POWER_BI_REDIRECT_URI=
POWER_BI_TOKEN_ENCRYPTION_KEY=
```

### Zendesk — soporte

```env
ZENDESK_SUBDOMAIN=
ZENDESK_EMAIL=
ZENDESK_API_TOKEN=
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

# Otras presentes en el VPS
FOOTBALL_API_KEY=
```

⚠️ **Nunca respaldar el `.env` dentro del repositorio.** `.gitignore` ya cubre
`.env.bak*`, pero antes no lo hacía: un `git add .` habría subido todos estos
secretos a GitHub.

## Fotos a Telegram (n8n)

Cuando un asesor sube una **evidencia** o un **faltante con foto**, la app avisa a un webhook de n8n, que reenvía la imagen a un canal de Telegram con un pie de foto identificable (quién, de qué, cuándo).

- El mensaje lo arma **la app** (`lib/webhook-caption.ts`), no n8n. El flujo de n8n es: Webhook → Telegram `sendPhoto` con `caption` + `imageUrl`.
- **Fire-and-forget** (`lib/webhooks.ts`): timeout de 5 s y nunca lanza. Si n8n está caído, la evidencia se guarda igual — no se rompe una subida por una notificación.
- **Filtro por tienda obligatorio:** sin `WEBHOOK_STORE_IDS` no se manda nada. Al ser multi-tienda, las fotos de una tienda no pueden acabar en el canal de otra.
- La `imageUrl` es una URL **firmada de 6 h** (el bucket R2 es privado); ese margen le permite a n8n reintentar.
- ⚠️ Las fotos salen de la infraestructura propia: quien esté en el canal las ve.

### Alertas de operación por el mismo webhook — 22 de agosto de 2026

El workflow activo `Clarvex — Fotos y PDF a Telegram`
(`l8q88gnWzcwYDpvp`) ahora bifurca el payload antes de tocar archivos:

```text
Webhook → Es alerta?
              true  → Telegram - Alerta (sendMessage)
              false → Es PDF?
                           true  → Telegram - Documento (PDF)
                           false → Telegram - Foto
```

- El contrato es `body.format`: `alert`, `document` o `photo`.
- Una alerta usa `body.title` y `body.text`; no intenta leer `imageUrl`.
- El cambio se conserva de forma reproducible en
  `scripts/n8n-add-alert-routing.jq`.
- Respaldo anterior en el VPS:
  `/root/n8n-workflow-backups/20260822-before-alert-routing-v6.json`.
- Prueba completa de las tres ramas sobre la versión publicada
  `e06417f4-2bd6-41a5-82fa-15394849e78d`: ejecución `140` → alerta,
  `141` → foto y `142` → documento PDF. Las tres terminaron en `success` y
  cada una ejecutó únicamente su nodo final correspondiente de Telegram.

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

> ⚠️ **Desde el 11 de agosto de 2026 esta vía está caída para cinco de las seis
> fuentes**: Axo deshabilitó los enlaces anónimos. Se está sustituyendo por
> captura propia — ver `AGENTS.md`. La estructura de columnas de abajo sigue
> siendo la referencia de qué significa cada dato y qué tiene que producir la
> captura nueva, así que **no se borra**.

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

## Estado actual del proyecto — 14 de agosto de 2026

> 📌 **Lee primero el bloque «EN QUÉ ESTAMOS AHORA» al inicio de `AGENTS.md`.**
> Ahí está el contexto completo de la migración en curso: qué se rompió, qué se
> quiere lograr, hasta dónde vamos y qué reglas nuevas no hay que romper.

### 🔴 Abierto — requiere acción

- **AWS está en marcha desde el 21 de agosto de 2026** — $1,000 anuales de
  créditos por AWS Activate. Cuenta `775711761052`, acceso por SSO con el perfil
  `clarvex`, alerta de presupuesto de $20/mes **midiendo antes de los créditos**.
  Bedrock ya lee el reporte del POS en producción y los respaldos se copian
  también a S3, con una llave que **solo puede escribir**.
- **La migración del VPS está EN CURSO, con los dos entornos vivos.** Vultr
  sigue siendo producción en `app.adrianluna.mx`; en AWS corre una copia en
  `https://team.clarvex.tech` (Ubuntu ARM, Postgres 16, PM2 en cluster, TLS).
  Los datos se restauraron de un respaldo real de S3 y **se verificaron tabla
  por tabla** — primera vez que se comprueba que los respaldos sirven.
  ⚠️ **Mientras convivan: ningún cron en AWS y ninguna captura real ahí.** Dos
  servidores con los mismos crons mandan cada notificación por duplicado, y lo
  que se capture en AWS se pierde al restaurar el volcado del corte. El plan
  completo, el orden y las trampas, en la sección **AWS** de `AGENTS.md`.
  Pendiente ligado: **borrar el usuario IAM `clarvex-bedrock`** cuando la app
  corra en EC2.
- **El aviso de cambio de dominio ya está implementado.** En
  `app.adrianluna.mx` aparece una banda global con Marquee y Animated Beam que
  anuncia `team.clarvex.tech` y explica que la huella se registrará otra vez.
  No aparece ni enlaza al servidor AWS mientras las bases conviven, para evitar
  capturas que se perderían con el volcado final. Se desplegó en Vultr como
  `c48d95e`; respaldo previo
  `/root/pre-domain-banner-c48d95e-20260821.dump`, migración WebAuthn aplicada,
  dos procesos PM2 `online` y health correcto. AWS no se tocó.
- **La app está ABIERTA** desde el 13 de agosto de 2026. El VPS tiene
  `MAINTENANCE_MODE=0`; ambas instancias PM2 están `online`, `/api/health`
  responde correctamente y el acceso normal llega a `/login` sin mostrar la
  ventana de mantenimiento. La difusión de reapertura se envió a 19 usuarios
  activos después de completar esas verificaciones.
- **La comunicación de reapertura ya está desplegada.** El
  anuncio global de agosto explica por qué se dejó de depender de los Excel,
  presenta la integración de Retool y reconoce la doble captura temporal. Solo
  `GERENTE`/`SUBGERENTE` reciben el botón **Conocer la nueva captura**, enlazado
  a `https://captura.adrianluna.mx/rr/app/captura-clarvex`; asesores continúan
  dentro de Clarvex y el kiosko no ve el aviso. El push se envió con el título
  `Clarvex vuelve a estar disponible`. Adrian continúa reuniendo los correos
  restantes para invitarlos a Retool y comprobar su aislamiento por tienda.
- **Cinco de las seis fuentes de datos están caídas desde el 11 de agosto**:
  Axo deshabilitó los enlaces anónimos de SharePoint. Lo que sigue en esta
  página sobre el RDV describe un mecanismo que **ya no funciona** para esas
  fuentes; solo sobrevive `GUESS / KPIS`, que pasa por Power Automate.
- **Se descartó la incrustación, no Retool.** «Captura Clarvex» usa el nuevo App
  Builder, que todavía no admite iframe externo. La decisión vigente es invitar
  a gerentes/subgerentes como usuarios internos de la organización y que entren
  directamente a `captura.adrianluna.mx`. Los atributos `storeId`, `storeName`
  y `role` ya están creados sin valor predeterminado; el grupo `captura tiendas`
  ya fue verificado con acceso **Use** únicamente a «Captura Clarvex» y sus dos
  recursos necesarios. `All Users` no concede acceso a apps ni recursos y sus
  permisos globales para Assist y para construir apps con IA quedaron
  desactivados; `External Apps` permanece desactivado. Las capturas originales
  y Ticket electrónico ya se validaron de extremo a extremo con la cuenta
  operativa. El branding ya usa
  nombre **CLARVEX TEAM**, acento `#2563EB`, cabecera `#0B0C0F` y referencias adicionales a
  Retool ocultas. Logo `public/icon-512.png` y favicon `public/favicon.ico` ya
  están cargados, y el logo está habilitado en los encabezados de las apps.
  El logo cuadrado se ve demasiado grande en el login; existe un candidato
  horizontal 1200 × 300 en `public/branding/retool-logo-horizontal.png`, con su
  fuente SVG. Adrian lo aprobó y **ya está cargado en Retool**; se verificó en
  la vista previa del login y en el encabezado. El favicon no cambió.
  La cuenta administrativa de Adrian no se usará para operación. Se acordó
  crear otra cuenta interna, limitada a `captura tiendas`, con atributos
  `SUBGERENTE`, `clarvex-demo-store` y `TH SAN AGUSTIN`. El correo será
  `jhernandezl2c@gmail.com`; la invitación ya fue aceptada y la cuenta está
  activa, con `All Users` y `captura tiendas`, sin grupos elevados. Los tres
  atributos ya están guardados y verificados. Ojo: en User attributes hay que
  pulsar Enter en cada campo para persistirlo. «Captura Clarvex» ya fue
  republicada como parche `0.0.2` con **Always publish latest changes**: el
  enlace limpio del dominio personalizado abre Horarios y reconoce
  `TH SAN AGUSTIN` sin mostrar el aviso de republicación. En el grupo `captura
  tiendas` → **Additional**, la **Landing page** quedó fijada en «Captura
  Clarvex», por lo que el siguiente inicio de sesión de la cuenta operativa debe
  enviarla directo a la app; la raíz del dominio conserva la página general de
  Retool si alguien navega a ella manualmente. La primera prueba real de
  Asistencia ya pasó de extremo a extremo: el 13 de agosto a las 09:39 se creó
  en producción la fila de Itzel (`81893`) para `TH SAN AGUSTIN`, con llegada
  `12:00`, `source=MANUAL` y 90 minutos tarde. Esa prueba aclaró la regla real:
  hasta +14 min es `ON_TIME`; de +15 a +29 min es `LATE` sin tocar el banco;
  desde +30 min es `EXCUSED` (permiso de entrada tarde) y se descuenta la
  diferencia completa del banco; solo la falta de marca o el texto `FALTA`
  produce `ABSENT`. Las bandas son relativas al horario individual. KPIs ya se
  guardó correctamente desde la cuenta operativa. El contador que mostró `4`
  «meses recalculados» correspondía en realidad a cuatro acumulados persona-mes
  (uno por colaborador); el parche Retool `0.0.3` lo renombró a «Acumulados
  mensuales» sin cambiar el cálculo. La primera prueba de Horarios detectó horas
  faltantes y una salida recortada: `0.0.3` ahora muestra Entrada/Salida apiladas
  y completa `10:30`/`21:00` solo cuando falten en `LABORANDO` o `INVENTARIO`.
  El servidor aplica la misma defensa. El guardado de Horarios ya fue repetido
  y confirmado desde la cuenta operativa. En Descuentos se corrigió con el
  parche Retool `0.0.4` el rango visual de la semana retail: es domingo-sábado,
  por lo que la semana 32 de 2026 corresponde al 9–15 de agosto, no al 3–9. El
  número enviado al endpoint no cambió. El guardado de Descuentos ya fue
  confirmado y las cuatro pantallas quedaron funcionales desde la cuenta
  operativa. El margen de tienda es ponderado: suma descuento y venta bruta del
  periodo y después divide; nunca promedia porcentajes individuales. La regla
  de asistencia quedó desplegada en `e69f52e` y
  la fila de Itzel fue reprocesada por el endpoint de captura: producción
  confirmó `EXCUSED`, 90 minutos tarde y `minutesBalance=-90`.
  Ya comenzó el despliegue al resto del equipo: `esoriamontes@gmail.com` fue
  invitada como SUBGERENTE de GUESS Galerías Monterrey, con solo `All Users` y
  `captura tiendas`; sus tres atributos de identidad quedaron verificados y la
  invitación está pendiente de aceptación.
  La migración gradual del escritorio gerencial ya comenzó. Clarvex tiene en
  producción el endpoint de solo lectura
  `GET /api/admin/retool/dashboard?storeId=...` (`5dfad9f` + corrección de
  middleware `644c694`), cubierto por `ADMIN_CAPTURE_SECRET`. El build y las
  686 pruebas pasaron, PM2 quedó con dos instancias `online` y el health check
  respondió correctamente. Retool guardó el borrador `ccf83f9` con un nuevo
  **Inicio** gerencial, resumen diario/mensual, operación, ranking y atención,
  sin tocar Horarios, Asistencia, KPIs ni Descuentos. La función fue probada
  contra producción y devolvió `ok: true` con el contrato completo. **Aún no se
  ha publicado:** la versión pública sigue siendo la captura estable; primero
  debe revisarse la vista previa y después validarse con la cuenta operativa.
  La iteración visual actual añade una barra superior liquid-glass restringida
  únicamente a la navegación y fotos reales en ranking/incidencias. Clarvex
  firma temporalmente las fotos privadas de R2 desde `b500065`; el preview
  confirmó cuatro imágenes cargadas (`complete=true`, `naturalWidth>0`) y el
  fallback de iniciales para quien no tiene foto. Retool guardó `5ada430` para
  los avatares y `d7d2e22` para que, por debajo de ~1100 px, el título y la
  navegación ocupen dos filas sin recortar «Descuentos». La fase 1 se publicó
  el 13 de agosto como parche Retool `0.0.5`. La URL pública abre Inicio y se
  validaron las cinco rutas; las cuatro imágenes firmadas cargaron con
  `complete=true` y `naturalWidth>0`, mientras Itzel conserva el fallback por
  no tener foto.
  Después de `0.0.5` se publicó el parche Retool **`0.0.6`** para corregir la
  cabecera en modo claro y añadir selector de tema. La causa era
  `bg-[#0B0C0F]/72`: Retool no generó esa opacidad y el contenedor quedó
  transparente con texto blanco. `frontend/components/AppNav.tsx` ahora usa
  RGBA explícito para claro/oscuro y un botón sol/luna accesible;
  `frontend/theme/themeToggle.ts` persiste la elección bajo
  `clarvex-capture-theme`; `frontend/App.tsx` la aplica antes del primer
  pintado. Se probaron Inicio, Horarios, Asistencia, KPIs y Descuentos en ambos
  temas, además de la persistencia tras recargar la vista previa. No se tocaron
  rutas, datos ni funciones de captura. Retool confirmó funciones aprobadas y
  ausencia de conflictos. La comprobación posterior en la URL pública confirmó
  las cinco rutas, el botón de tema y fondos no transparentes: oscuro
  `rgba(11, 12, 15, 0.86)` y claro `rgba(255, 255, 255, 0.84)`.
  El 14 de agosto se retiró Centro de Datos y se publicó Ticket electrónico en
  Retool **`0.0.7`** (commit Retool `3efa632`, ruta `/ticket-electronico`).
  Clarvex aporta `GET|POST /api/admin/capture/electronic-tickets` y conserva la
  fila ancla semanal, la identidad segura y todas las reglas de negocio. La
  escritura real se probó con contador `1` y el valor usado se restauró al
  original. Las rutas antiguas `/datos` y `/escritorio/datos` redirigen a la
  pantalla nueva. Los crons `sync-all`, `sync-alert` y `attendance-sync` fueron
  retirados del crontab; sus endpoints son no-op autenticados, y los resúmenes
  diario/mediodía ya no sincronizan Excel. Se limpiaron cuatro alertas antiguas.
  Commit Clarvex `a531f46`, desplegado; lint, TypeScript, build y 687 pruebas
  correctos. La pantalla pública y ambos temas fueron verificados.
  Falta definir el remitente de correo. Detalle completo en `AGENTS.md`.
- **`MERCADOPAGO_WEBHOOK_SECRET` sin configurar en el VPS.** El webhook de Mercado
  Pago responde 401 a todo: las suscripciones no se procesan automáticamente.
  Ver [Variables de entorno](#variables-de-entorno).
- **Respaldo de `.env` suelto en el servidor:** `/root/clarvex-app/.env.bak-1784486367`.
  Ya está cubierto por `.gitignore`, pero conviene sacarlo del directorio del repo.

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
- Modo demo público de solo lectura (`/api/demo/manager`, `/api/demo/advisor`),
  con el candado cerrado también en los GET que escriben y en los que gastan IA

### ⚠️ Áreas a no tocar sin revisión previa

- Lógica de comisiones (cálculo con mínimo) — ya correcta
- Fuente de datos KPIs (columnas del RDV) — ya correcta
- Vista Mes de KPIs — ya correcta
- Push Notifications — ya funcional

---

## Modo demo público

Entrada sin PIN para enseñar la app: `GET /api/demo/manager` o `/api/demo/advisor`
crean una sesión sobre la tienda ficticia `demo-showcase` (`lib/demo.ts`).

**Los usuarios demo son COMPARTIDOS** (`DEMO-100` y `DEMO-201`): todos los visitantes
entran con la misma cuenta. De ahí salen dos reglas que no son evidentes:

1. **El logout demo no debe subir `sessionVersion`.** Si lo sube, expulsa a todos los
   visitantes conectados a la vez — cualquiera podría tumbar la demo cerrando sesión
   (`app/api/auth/session/route.ts`).
2. **El middleware NO alcanza.** Solo filtra por método HTTP, y eso deja fuera:
   - GET que escriben (presencia del chat, recibos, challenges de WebAuthn)
   - GET que cuestan dinero (`/api/ai/*`)
   - Todo `/api/auth/*`, exceptuado para permitir el logout

Para esos casos existe **`denyDemo(session)`** en `lib/api.ts`. Al añadir un endpoint
nuevo que escriba o gaste IA, aplicarlo explícitamente.

En el chat se optó por **desactivar las escrituras en vez de bloquear el GET**: cortarlo
entero dejaría roto justo lo que la demo pretende enseñar.

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

Fuente histórica: archivo XLSX de SharePoint. Desde el 14 de agosto de 2026 la
captura operativa vive en Retool y escribe por la API segura de Clarvex; este
bloque solo documenta el parser heredado.

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

## ⚠️ `Kpi.weekStart` NO es el inicio de la semana

En la tabla `Kpi`, los campos `weekStart` y `weekEnd` valen **lo mismo que `date`**
en cada fila. No son los límites de la semana, pese al nombre.

```
date       | weekStart  | weekEnd    | weekNumber
2026-08-01 | 2026-08-01 | 2026-08-01 | 30
2026-07-31 | 2026-07-31 | 2026-07-31 | 30
```

**Agrupar por `weekStart` produce una "semana" por día.** Para agrupar por semana
se usa **`weekNumber`**, que sí es constante — es lo que ya hace la sincronización
del margen DTO. Los límites reales se derivan del mínimo y máximo `date` del grupo.

## Datos SEMANALES en la tabla Kpi — patrón de fila ancla

`Kpi` es diaria. Un dato semanal (margen DTO, ticket electrónico) se guarda en la
**primera fila de la semana** y en el resto queda `null`. Si se repitiera en los
siete días, sumar la semana multiplicaría por siete.

Ver `lib/data-source-sync.ts:597` y `app/api/electronic-tickets/route.ts`.

## Conteo diario de sección (dama) — agosto de 2026

En el inventario de agosto faltó producto de dama y el supervisor pidió contarla
a diario. Vive en `/conteos/dama` y `/escritorio/conteos/dama`, sobre las mismas
tablas del conteo físico (`CycleCount` con `kind = "DIARIO"`).

**Es una cosa APARTE del conteo físico y APARTE del kardex.** No lleva teórico,
no cierra ronda y **contar no mueve existencias**. El candado de «un solo conteo
abierto» está acotado a `kind = "FISICO"`: sin eso, el conteo diario impediría
abrir el inventario quincenal.

Cuatro reglas que no hay que cambiar sin hablarlo:

1. **El juego de marbetes se arma escaneando.** Nadie tenía la lista de qué
   marbetes son de dama. El primer conteo enrola cada uno que se pasa.
2. ⚠️ **La posición de export (1, 2, 3…) se asigna una vez y NO se recicla.** Un
   marbete nuevo va al final aunque su número interno sea más bajo; el de uno
   retirado queda vacío. Si las posiciones se recorrieran, el «marbete 3» de un
   reporte ya entregado pasaría a apuntar a otro rack. Corregir o recompactar
   **solo se permite mientras la sección va en su PRIMER conteo**; después el
   servidor lo rechaza y explica por qué.
3. **El conteo es ciego.** El campo de piezas nace vacío, nunca con lo ya
   contado: enseñarle a la segunda persona lo que puso la primera convierte el
   recuento en una confirmación. El 3er conteo solo se ofrece si el 2º no cuadró.
4. **Un marbete que baja NO es una pérdida.** Puede haberse vendido, agotado o
   movido. Solo cuenta lo que queda sin explicar, y el motivo es **lista
   cerrada**: con texto libre, a las dos semanas todo dice «se vendió».
   «Se movió al marbete N» **se verifica** contra ese marbete — es la única
   causa que no se puede inventar.

Al copiar el conteo para pegarlo en Excel, un marbete sin contar deja su renglón
**en blanco**. Saltárselo recorrería la columna entera y pegaría las piezas en el
marbete equivocado.

## La venta del día SÍ puede ser negativa

Una devolución de cliente que no se compensa con otra venta deja el día en rojo,
y así se registra: se resta del acumulado de la persona y del total de la tienda.

⚠️ **Las PIEZAS no.** Las de `Kpi` son brutas — el POS reporta las devoluciones
aparte y el kardex las toma como su propio movimiento. Una pieza negativa aquí
devolvería la mercancía al inventario **dos veces**, y el descuadre aparecería
hasta el conteo físico sin rastro de dónde salió. Meta y tickets tampoco.

El tope de captura mide el **valor absoluto**: un cero de más en rojo es tan
error como en verde.

## Manifiesto del CEDIS: las cajas `S` son empaque, no inventario

Los manifiestos traen bolsas de la marca junto con la mercancía. **`K` es
mercancía, `S` es empaque.** El empaque se lee y se cuenta —los totales que
declara el CEDIS lo incluyen y son la única verificación de que el PDF se leyó
completo— pero **no baja al borrador** de recepción.

⚠️ Un prefijo desconocido se toma como **mercancía** y se avisa. Conviene
equivocarse contando de más: una caja de más aparece en el conteo físico, una que
nunca entró al kardex no deja rastro de que faltó.

Detalle que costó una recepción entera: el patrón de caja exigía letra + dígitos,
y las bolsas llevan letras dentro (`S00004A1Y452`). No se reconocían, el total no
cuadraba y **se rechazaba el manifiesto completo**.

## Kardex de inventario — la existencia se CALCULA, no se guarda

```
teórico = inventario inicial + entradas − salidas − ventas ± ajustes
```

Guardar la existencia y sumarle/restarle es como se corrompe un inventario: el
error queda incrustado y ya no se sabe cuál fue. `summarizeKardex()` en
`lib/inventory-kardex-entry.ts` la recalcula entera en cada lectura.

El kardex va por **rondas**: cada inventario físico cierra la ronda en curso y
abre la siguiente con las piezas recién contadas. Es como se lleva a mano (el
archivo de la tienda se llama «1RA RONDA 2026»).

Cinco reglas que NO hay que cambiar sin hablarlo:

1. **Dentro de una ronda, `basePieces` no se toca jamás.** Corregirla a media
   ronda reescribe la existencia teórica de todos los días de golpe. Solo puede
   haber **una ronda abierta por tienda**, garantizado por un índice único
   parcial (`closedAt IS NULL`) — el chequeo en código no basta con dos
   instancias de PM2.
2. **La venta del día NO se captura**: sale de `Kpi.pieces`, agregada con
   `PERSON_WHERE`. Capturarla otra vez la contaría dos veces.
3. **La devolución de cliente SÍ se captura**: las piezas de `Kpi` son brutas y
   el POS reporta las devoluciones aparte, a nivel tienda.
4. **`quantity` siempre positivo**; el signo lo pone el tipo de movimiento.
5. **Sobrantes y faltantes NO entran al teórico**: `quantity` ya son las piezas
   que se quedan en la tienda. Se guardan porque son la primera pista cuando el
   conteo de cierre no cuadra.

   ⚠️ **Las piezas de MÁS no son inventario de la tienda.** Cuando llegan más
   de las que dice el manifiesto, la tienda las **aparta y las devuelve al
   CEDIS**: nunca fueron suyas. Con `contadas` y lo que declara el manifiesto:

   ```
   quantity = min(contadas, manifiesto)
   missing  = max(0, manifiesto − contadas)
   surplus  = max(0, contadas − manifiesto)
   ```

   Manifiesto 5 y llegan 4 → entran **4**. Manifiesto 5 y llegan 7 → entran
   **5**, y las 2 de más se apartan. Meterlas al teórico infla el inventario con
   mercancía que se va a ir de vuelta, y el descuadre aparecería hasta el
   siguiente conteo físico sin rastro de dónde salió.

   Corolario: al devolver ese sobrante al CEDIS **no se captura un traspaso de
   salida**. Nunca entró, así que restarlo lo contaría dos veces.

Tipos de movimiento: recepción, traspaso de entrada, devolución de cliente,
traspaso de salida, **SFS** (Ship From Store) y ajuste ±. El corte de la ronda
⚠️ **El día del inventario SÍ entra en la ronda**: movimientos y ventas usan
`date >= startDate`. RGIS cuenta antes de que la tienda abra, así que lo de ese
día ocurre después del conteo. Lo confirma el kardex real de la tienda: su
«Último Inventario» es el 18 de febrero y la primera fila de la hoja Ventas es
de ese mismo día. Los dos cortes tienen que moverse juntos: si uno acepta el día
del conteo y el otro no, ese día se cuenta dos veces o se pierde entero.

Un `AJUSTE` exige motivo: sin él, una merma desaparece sin explicación, que es
justo lo que el kardex existe para evitar.

### El libro de la ronda incluye la VENTA

La pantalla de movimientos enseñaba todo lo que entró al inventario y casi nada
de lo que salió: la venta no es un movimiento capturado, sale de los KPIs del
día. Sin ella no había forma de seguir a mano cómo se llegó al teórico.

`buildLedger` (`lib/inventory-kardex-entry.ts`) mezcla lo capturado con la venta
de cada día y le pone signo: **positivo entra, negativo sale**. La suma del libro
es exactamente lo que el teórico le agrega a la base de la ronda.

⚠️ Las filas de venta son **derivadas**: van sin `id` a propósito, para que no se
puedan borrar como un movimiento. Corregir una venta se hace en KPIs, que es
donde vive el dato.

El **export del kardex no usa esto**: sigue leyendo `state.movements` y arma sus
ventas con su propia consulta. Son dos caminos separados y los números no
cambiaron.

## Avisos globales y la paleta del escritorio

Los componentes montados en `app/layout.tsx` (`EmailBanner`, `WhatsNewModal`…)
viven **fuera** del subárbol `[data-surface="desk"]`, así que no heredan los
tokens del escritorio y se pintarían con la paleta del móvil sobre el lienzo
oscuro. Solución: la clase **`desk-adopt`**, definida en `app/escritorio/desktop.css`.

Mismo motivo por el que los Meteors se ocultan con `body:has([data-surface="desk"])`.

## ⚠️ La huella vale SOLO en el dominio donde se registró

Es una garantía del estándar WebAuthn, no un detalle: impide que un sitio falso
reutilice una huella. `WebAuthnCredential.rpId` guarda ese dominio, y la app
solo ofrece las credenciales del dominio actual.

**La bandera se lee en TRES sitios y los tres tienen que coincidir:**

| Ruta | Qué controla |
|---|---|
| `/api/auth/employee-login` | el botón de huella en el login |
| `/api/auth/session` | **el perfil**, que es donde se registra |
| `/api/app-data` | la lista de usuarios |

⚠️ **Arreglar solo uno deja al usuario peor que antes.** Pasó el 21 de agosto:
el login ya no ofrecía la huella (correcto) pero el perfil seguía diciendo «Face
ID activo» y por eso no ofrecía registrarla — sin ninguna de las dos formas de
usarla. Si aparece un cuarto sitio que lea `biometricEnabled`, va con la misma
regla: la pregunta no es «¿tiene biometría?» sino «¿tiene credencial AQUÍ?».

## ⚠️ El usuario kiosko NO es un asesor

El celular de la tienda (`checklistOnly: true`) está dado de alta con rol
`ASESOR`. Filtrar por `role: "ASESOR"` a secas lo incluye, y se coló en DOCE
consultas: salía en la plantilla de Asistencia, contaba como un asesor con cero
venta en el resumen de cierre («Abajo: 1 asesores» una noche en que la única
persona que trabajó SÍ llegó a su meta), y hasta recibía plan del día.

Usar siempre **`ADVISOR_WHERE` / `PERSON_WHERE`** de `lib/store-people.ts`.

## ⚠️ Asistencia: mes retail vs mes natural

No son lo mismo y la diferencia **se paga**:

- **FALTAS** → por quincena de CALENDARIO (1–15, 16–fin). La nómina va así.
- **RETARDOS, DOMINGOS y FESTIVOS** → por **mes RETAIL**.

Agosto 2026 natural trae CINCO domingos (2, 9, 16, 23 y 30) y el retail solo
CUATRO: el 30 ya es septiembre retail. Por natural se pagaría una prima
dominical de más por persona. En julio los dos daban los mismos cuatro, por eso
el fallo estuvo meses invisible.

`retailMonthBoundsFor()` en `lib/report-deadlines.ts` da los límites.

## ⚠️ Margen DTO es un TECHO, no una meta

Su «meta» es el descuento máximo permitido: pasarse es MALO. Con el semáforo
genérico (verde si valor ≥ meta) se pintaba verde justo al excederlo.
`isCeiling()` en `lib/kpi-view.ts` lo distingue.

## ⚠️ Verificar el build SIN filtrar la salida

`pnpm run build | grep -E "Compiled|Failed"` **miente**: casa con el
«✓ Compiled successfully» del paso de compilación e ignora el error del export,
que ocurre después. Un `useSearchParams()` sin límite de `<Suspense>` compiló
«bien», dejó el `.next` incompleto y **tumbó producción con 502**.

Mirar siempre las últimas líneas completas (`| tail -4`).

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
