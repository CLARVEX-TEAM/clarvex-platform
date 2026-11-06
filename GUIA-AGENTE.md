# Guía para el agente (Kimi) — trabajar en Clarvex

Escrita el 4 de noviembre de 2026. Es la puerta de entrada corta; el detalle vive
en `CLAUDE.md` (≈4,600 líneas) y `AGENTS.md`. **No los leas enteros**: busca
dentro con `buscar_texto` la palabra del tema (p. ej. «Kardex», «Cuota Justa»,
«APK 1.8») y lee solo esa sección.

## Estado actual

- **Clarvex SIGUE.** El apagado de octubre se canceló el 4 nov 2026 (llegaron
  los créditos de AWS). `APAGADO-CLARVEX.md` es historia: no ejecutes sus fases.
- Producción: `https://team.clarvex.tech`, servidor `ssh clarvex-aws`
  (EC2 en AWS, usuario `ubuntu`), PM2 `clarvex-team` en 2 instancias.
- Versión servida: `main` en `f2a39d2` (27 oct 2026, Next 15.5.28).
  Releases en `/home/ubuntu/clarvex/releases/`, puntero `current`.
- APK publicada: **1.9 / código 11** (`compartido/apk/clarvex-11.apk`).
  La app Android es la web dentro de Capacitor (`D:\Documents\clarvex-movil`).
- Base: Postgres 16 en el contenedor `clarvex_postgres`, base `clarvex_team`,
  **rol `clarvex`** (el rol `postgres` no existe). 118 migraciones.
- Respaldo diario 09:30 UTC a R2 y S3; estado en `/home/ubuntu/logs/backup-estado.json`.
- Crons: en el crontab de `ubuntu` (no de root). `vigilar-crons` revisa los demás
  cada día y su log dice «con problema N».

## Lo que de verdad se usa (dato de sept. 2026)

Conteos (inventario y marbetes), captura en **Retool** (KPIs, asistencia,
horarios, descuentos, Cuota Justa, kardex) y los crons. Casi nadie usa
capacitación, encuestas, soporte, kudos ni el chat. **Antes de proponer una
función nueva para la app del teléfono, pregúntale a Adrián si alguien la va a
usar.**

## Repositorios

| Qué | Dónde |
|---|---|
| Plataforma (Next.js + Prisma) | `D:\Documents\New project` → `CLARVEX-TEAM/clarvex-platform` |
| App Android (Capacitor) | `D:\Documents\clarvex-movil` |
| Retool «Captura Clarvex» | `D:\Documents\captura-clarvex` (CLI `retool`) |

## Cómo se trabaja una función nueva

1. Rama nueva desde `main` actualizado: `git switch main; git pull; git switch -c feat/<nombre>`.
   Nunca trabajes directo en `main`.
2. Lee la sección de `CLAUDE.md` del módulo que tocas y las pruebas que ya existen en `tests/`.
3. Cambios pequeños y en los archivos justos. Escribe la prueba del comportamiento nuevo.
4. Puertas obligatorias, en este orden, **todas en verde** antes de commitear:
   ```
   corepack pnpm install
   corepack pnpm exec prisma generate
   corepack pnpm exec tsc --noEmit --incremental false
   corepack pnpm exec eslint . --max-warnings 0
   corepack pnpm test
   corepack pnpm run build
   ```
   Mira el **final completo** de la salida del build (las últimas líneas), no
   filtres con grep: «Compiled successfully» aparece aunque el export falle después.
5. `git status --short` y añade **archivos por nombre** (nunca `git add .`: hay
   un VS Code instalado dentro de la carpeta y archivos `.env`).
6. Commit + push de la rama + PR. **Merge y despliegue solo con el «va» de Adrián.**

## Desplegar (solo con autorización de Adrián)

GitHub Actions **no corre** (cuota agotada, no se paga). Se despliega por ssh con
el SHA COMPLETO de `origin/main`:

```
ssh clarvex-aws "cd /home/ubuntu/clarvex/repo && git fetch origin --quiet && git show <sha>:scripts/deploy-release.sh > /tmp/deploy.sh && nohup bash /tmp/deploy.sh <sha> > /tmp/despliegue.log 2>&1 &"
```

Tarda 5-10 min (el build va con swap). Revisa `/tmp/despliegue.log` con
`tail -n 30` (nunca `tail -f`) cada minuto; para saber si sigue corriendo usa
`pgrep -f '[d]eploy.sh'` (sin los corchetes `pgrep` se encuentra a sí mismo y
parece que nunca termina — así se colgó el 4 nov). Al terminar comprueba:
`pm2 list` (dos `online` con el cwd de la release nueva) y
`curl -s https://team.clarvex.tech/api/health` → `"status":"ok"`.

## Reglas que NO se rompen

- ❌ `prisma migrate reset`, borrar tablas/datos/usuarios, recrear la base, datos demo en producción.
- ✅ Migraciones **solo aditivas** (revertir código no deshace una migración).
- ❌ Tocar la lógica de **comisiones** o las columnas del RDV sin aprobación explícita.
- ❌ `rm -rf .next` en producción (tumba el sitio).
- ❌ Arreglar tipos con `any`/`unknown` en bloque.
- ❌ Leer o mostrar el contenido de un `.env` real, llaves o tokens.
- Filtrar personas con `ADVISOR_WHERE` / `PERSON_WHERE` (`lib/store-people.ts`):
  el kiosko tiene rol `ASESOR` y se cuela si filtras por rol a secas.
- Endpoint nuevo que escribe o gasta IA → `denyDemo(session)` (los usuarios demo son compartidos).
- Ruta nueva → revisa `middleware.ts` (matcher y listas permitidas) y que
  pasen `tests/middleware-matcher.test.ts` y `tests/accesos-telefono.test.ts`.
- Venta del día puede ser negativa; **piezas no**.
- Semana/mes son de **calendario retail**, no gregoriano. `Kpi.weekStart` NO es
  el inicio de semana: agrupa por `weekNumber`.

## Lo haces TÚ (no lo delegues)

Puertas de calidad, commit, push, PR, `gh pr merge` y el despliegue con el guion
de arriba (estos dos últimos con el «va» de Adrián), health check y comprobación
de PM2. El build tarda: pásale «minutos» 20 a `ejecutar_comando`.

## Pásale a claude_code SOLO esto

- Cambios en **Retool** (`retool check`, `push`, `publish`) y en la **APK**
  (compilar, firmar, publicar en `compartido/apk/` con su circuito de hash).
- Migraciones con datos reales, cambios de infraestructura (crontab, AWS, Cloudflare, n8n, Slack).
- Algo que te falló DOS veces seguidas o que solo pasa en el teléfono.
- Dudar no es motivo para delegar: pregúntale a Adrián en una línea.

Al pasárselo, dale: repositorio y rama, archivos, qué debe quedar funcionando,
qué puertas correr y si puede o no fusionar/desplegar.

## Honestidad

«Listo» solo con la prueba a la vista (salida de las puertas, health 200, captura).
Si algo falló o no lo pudiste comprobar, dilo así.
