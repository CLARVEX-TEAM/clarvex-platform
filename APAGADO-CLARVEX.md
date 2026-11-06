# Apagado de Clarvex

Inventario comprobado contra la cuenta `775711761052` el 12 de octubre de 2026,
no contra lo que dice la documentación. Plan revisado el 16 de octubre de 2026.

---

## 🚦 La puerta: nada se destruye hasta que AWS resuelva los créditos

El 15 de octubre de 2026 se pidieron **$10K de AWS Activate** (Portfolio, vía
NVIDIA Inception, Org ID `aqn1V`). Se rechazó el 16 porque iba con `contacto@` y
NVIDIA tiene `adrian@`; **se reenvió ese mismo día con `adrian@`** y está
PENDING. AWS tarda 7-10 días hábiles: la respuesta cae hacia el **30 de
octubre**, y puede pasarse.

Quien revisa ve cuatro cosas, y ninguna se toca hasta tener respuesta:

| Lo que revisa AWS | Dónde vive |
|---|---|
| Correo `contacto@clarvex.adrianluna.mx` | Zoho (MX de `clarvex.adrianluna.mx`) |
| Sitio `https://clarvex.adrianluna.mx` | Worker `espejo-clarvex-tech` en Cloudflare → Framer |
| `clarvex.tech` | Framer |
| La cuenta de AWS en sí | `775711761052`, al corriente y sin incidencias |

⚠️ **Por eso la fecha deja de ser «el 30» y pasa a ser «cuando llegue la
respuesta».** Clarvex encendido unos días más cuesta ~$1/día de crédito. Un
cambio en el dominio, el correo o la cuenta a mitad de revisión puede costar
$10K.

| Fase | Cuándo | ¿Reversible? |
|---|---|---|
| 0 — Respaldar todo | **ya**, sin esperar | sí, no toca nada |
| 1 — Preparar la salida | ya | sí |
| 2 — Apagar la app | **después** de la respuesta de AWS | sí, durante 30 días |
| 3 — Reducir la máquina y limpiar | 30 días después de la fase 2 | parcialmente |

---

## Qué se queda, qué se va

### ✅ Se queda — no se toca nunca

| Pieza | Por qué |
|---|---|
| **Cuenta de AWS** | el crédito Activate muere con ella (~$937 + los $10K si llegan) |
| **Instancia `i-06fd0869766482dc1`** | se REDUCE, no se termina: lleva lo personal |
| `vaultwarden` | gestor de contraseñas |
| `syncthing`, `webdav` (buzón) | nube personal |
| `uptime-kuma`, `portainer` | monitoreo y administración de lo que queda |
| `npm` (Nginx Proxy Manager) | también sirve `n8n.adrianluna.mx` |
| Tailscale | es la única entrada al servidor |
| `clarvex.tech` en Framer | sitio de la empresa; lo ve AWS |
| Worker `espejo-clarvex-tech` | es el sitio declarado en la solicitud |
| Correo Zoho de `clarvex.adrianluna.mx` | correo de la solicitud y de la licencia de H3 |
| Bucket `clarvex-backups-775711761052` (S3) y respaldos en R2 | los datos no se borran nunca |
| Bucket R2 de fotos y evidencias | ídem; cuesta centavos |
| Snapshot `snap-07504aa4da0e9aa0e` | el seguro de todo |
| Repositorios de GitHub | se **archivan** (solo lectura), no se borran |

### ❌ Se va

| Pieza | Cuándo |
|---|---|
| App Next.js en PM2 (`clarvex-team`) | fase 2 |
| Los 16 crons del crontab de `ubuntu` | fase 2, **antes** que la app |
| `team.clarvex.tech` | fase 2 → redirigir a `clarvex.tech` con una regla de Cloudflare |
| Contenedor `clarvex_postgres` | fase 3, solo después de restaurar un volcado de verdad |
| `adminer`, `otel-collector` | fase 2 |
| Distribución de la APK (`compartido/apk/`) | fase 2, tras bajarla |
| Tokens externos de Clarvex (lista abajo) | fase 2 |
| Usuarios IAM `clarvex-bedrock`, `clarvex-backup`, `BedrockAPIKey-xj0b` | fase 3 |
| App «Captura Clarvex» de Retool y sus usuarios | fase 2 |
| Monitores de Uptime Kuma que miran `team.clarvex.tech` | fase 2, o avisarán sin parar |

### ❓ Se decide antes de la fase 2

| Pieza | La pregunta |
|---|---|
| ~~`n8n`~~ | **Resuelto: se queda.** Lleva «Buzón personal»; solo se apagan los flujos de Clarvex |
| Bot `@AdrianAssitBot` (Telegram) | lo usan el visual y las promociones; ¿se reutiliza? |
| Espacio de Slack `clarvexespacio` | ¿se conserva como espacio de la empresa? |
| Suscripciones de pago: Retool, Zendesk, Sentry, Resend | cancelar las que cobren; mirar cada panel |
| Proyecto de Firebase (FCM) | sin la APK no sirve; borrar o dejar dormido |
| Mercado Pago | desactivar el webhook; la cuenta es personal |
| Tamaño de la máquina | con $10K aprobados, bajar a `t4g.small` ahorra poco; sin ellos, ahorra ~$275 |

---

## Fase 0 — respaldar todo (ya; no toca nada)

✅ **Hecha el 16 de octubre de 2026**, salvo Vaultwarden y el `.env`, que
hace Adrián a mano. Archivo en tres sitios, con huellas comprobadas:

- PC: `D:\Documents\clarvex-archivo\apagado-20261016\`
- S3: `s3://clarvex-backups-775711761052/apagado-20261016/`
- Servidor: `/home/ubuntu/archivo-apagado-20261016/` (se va con la fase 3)

⚠️ **En ese bucket, `backups/` CADUCA a los 90 días** (regla
`retencion-90-dias`). Con Clarvex apagado ya no entran respaldos nuevos, así que
en tres meses no quedaría ninguno. Por eso el archivo va en `apagado-*/`, fuera
de la regla. **El volcado de la fase 3 va ahí también, nunca en `backups/`.**

⚠️ **n8n NO se va con Clarvex**: el flujo «Buzón personal» está activo y no es
de Clarvex. Se apagan solo los cuatro flujos «Clarvex — …».

- [x] **Snapshot del volumen** — `snap-07504aa4da0e9aa0e`, 13 oct 2026, 50 GB.
- [ ] **Exportar Vaultwarden** (`Tools → Export vault`, cifrado con contraseña).
      ⚠️ Un export en claro es un JSON con **todas** las contraseñas: no dejarlo
      en Descargas ni en el repositorio.
- [ ] **El `.env` de 37 variables → a Vaultwarden**, como nota segura.
- [x] **Volcado de `clarvex_team`** (1.1 MB) **restaurado de verdad** en un
      Postgres aislado: 83 tablas, 18 usuarios, 4 tiendas, 728 KPIs y 117
      migraciones, idénticos a producción.
      ⚠️ La primera restauración falló por un fallo del GUION, no del volcado:
      `pg_isready` por socket contestaba ante el servidor temporal de la imagen,
      antes de que existiera la base. Corregido para preguntar por TCP; la
      simulación sigue en 23/23.
- [x] **Flujos de n8n** — 6, en `n8n-flujos.json`. Sin tokens dentro.
- [x] **`compartido/apk/`** en `apk.tgz` — incluye `clarvex-11.apk` (1.9).
- [x] **`/home/ubuntu/visual/referencias/`** en `visual-referencias.tgz`.
- [x] **Crontab de `ubuntu`** (69 líneas) y los tres guiones `cron-*.sh`. Sin
      secretos: los crons leen el suyo del `.env` a través del wrapper.

## Fase 1 — preparar la salida (ya; reversible)

- [ ] **Framer: quitar o cambiar «Iniciar sesión» y los dos demos**, que llevan a
      `team.clarvex.tech`. Y el aviso «Clarvex Team ya está en tiendas
      reales». Si AWS revisa después del apagado, vería botones rotos.
- [ ] **Avisar a los usuarios con una semana de margen.** Comunicado dentro de
      la app y mensaje directo a gerencia de TH San Agustín, que es la única
      tienda activa. Decir qué pasa con sus datos: se conservan.
- [ ] **Conteos**: es lo único que usan de verdad (452 en 30 días). Darles una
      salida —la hoja de Excel de siempre— antes de quitárselo.
- [ ] Decidir la tabla «❓» de arriba.

## Fase 2 — apagar la app (cuando AWS responda)

Orden estricto: cada paso evita un problema del siguiente.

1. [ ] **Crons primero.** Comentar las líneas del crontab de `ubuntu` (no
       borrarlas). Si se para la app antes, siguen golpeando algo muerto.
2. [ ] **Monitores de Uptime Kuma** de Clarvex en pausa, o alertarán a Slack y
       Telegram cada minuto.
3. [ ] `pm2 stop clarvex-team && pm2 save` — **stop, no delete**: vuelve con
       `pm2 start`.
4. [ ] `docker stop adminer otel-collector`. **n8n NO**: en su panel se
       desactivan solo los flujos «Clarvex — …»; «Buzón personal» sigue.
       `clarvex_postgres` se queda **parado, no borrado**.
5. [ ] **`team.clarvex.tech` → `clarvex.tech`** con una regla de redirección en
       Cloudflare, igual que se hizo con `clarvex.adrianluna.mx`.
6. [ ] **Revocar tokens externos**. Siguen siendo válidos aunque la app muera,
       y cualquiera con una copia del `.env` entra:
       Slack (bot y firma), Telegram, Zendesk, Mercado Pago, FCM, Resend,
       R2 de la app, Gemini/Groq/Cloudflare AI, Power BI, Sentry,
       `ADMIN_CAPTURE_SECRET` / `CRON_SECRET` dejan de importar con la app parada.
7. [ ] **Retool**: despublicar «Captura Clarvex», quitar a los usuarios
       invitados y cerrar el túnel SSH (sus tres rangos en el puerto 22 del
       grupo `sg-0c695d897d47788f7`).
8. [ ] Comprobar: `team.clarvex.tech` redirige, Vaultwarden y Syncthing siguen
       respondiendo por Tailscale, el correo de Zoho recibe.

⚠️ Durante **30 días** todo esto se deshace con `pm2 start` y quitando la regla
de Cloudflare. Es el margen por si alguien de la tienda necesita un dato.

## Fase 3 — reducir y limpiar (30 días después)

- [ ] Último volcado de `clarvex_team` y **otra restauración de prueba**.
- [ ] `docker rm clarvex_postgres` y borrar `/home/ubuntu/stack/postgres` y
      `/home/ubuntu/clarvex/releases/`. Los datos ya viven en S3 y R2.
- [ ] **Reducir la instancia** (si se decidió): parar → `t4g.small` → arrancar.
      Comprobar Vaultwarden, Syncthing, el buzón y Tailscale.
- [ ] **IAM**: desactivar las llaves de `clarvex-bedrock` (`AKIA…3NXC`),
      `clarvex-backup` (`AKIA…AMJP`) y `BedrockAPIKey-xj0b`; esperar unos días,
      `get-access-key-last-used`, borrar.
      ⚠️ `clarvex-backup` escribe los respaldos: retirarlo **después** del último.
- [x] **Budgets borrados el 16 oct 2026** (`clarvex-mensual` $45 y
      `clarvex-aws-activate-guardrail` $120), a petición de Adrián: avisaban de
      más. Configuración guardada en `.respaldos-aws/` (fuera de git). Quedan
      las alertas de **anomalías de costo**, que son las que avisan de una GPU
      olvidada. Vigilar el **crédito restante** a mano.
- [ ] Archivar los repositorios de GitHub (`clarvex-platform`, `clarvex-movil`).
- [ ] Actualizar CLAUDE.md y AGENTS.md: Clarvex apagado, dónde están los datos.

---

## ❌ Lo que NO hay que hacer

- **Cerrar la cuenta de AWS.** El crédito está atado a ella.
- **Terminar la instancia.** `DeleteOnTermination = true`: se lleva Vaultwarden.
- **Tocar el correo de Zoho, el Worker espejo o Framer** mientras AWS revisa,
  ni después: son la identidad de la empresa en la solicitud.
- **Borrar respaldos o buckets de datos.** Se retira el código, no la historia.
- **`docker compose down`** en `/home/ubuntu/stack/`: tumba también lo personal.
