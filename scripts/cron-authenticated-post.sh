#!/bin/bash
set -euo pipefail

# Llama a un endpoint de cron con el secreto, sin que el secreto viva en el
# crontab.
#
# Copia versionada de /home/ubuntu/clarvex/compartido/bin/cron-authenticated-post.sh.
# Hasta el 29 de septiembre de 2026 este archivo solo existia en el servidor.
#
# ⚠️ **La lista blanca es lo que impide que esto sea un oráculo genérico.** Con
# el secreto a mano y sin lista, cualquier línea del crontab --o cualquiera que
# pueda escribir una-- podría llamar a lo que quisiera con autorización.
#
# ⚠️ **Y olvidar una entrada aquí no da un error visible donde se mira.** El 18
# de septiembre `shift-reminder` se agregó al crontab sin agregarse a esta lista:
# cada ejecución salía en 2 con «endpoint no permitido», escrito en un archivo
# que nadie abre, y el recordatorio de turno que anuncia la APK 1.6 no entregó
# un solo aviso. Al agregar un cron, se agrega AQUÍ en la misma operación.
#
# ⚠️ **El método va por endpoint, no por omisión.** `demo-refresh` solo exporta
# GET: mandarle POST devuelve 405 y falla callado. Un método equivocado se ve
# exactamente igual que un cron que corre bien.

# ---------------------------------------------------------------------------
# ⚠️ CADA EJECUCIÓN ESCRIBE UNA LÍNEA, CON HORA Y EN JSON.
#
# Antes esto terminaba en `exec curl`, así que al log iba el cuerpo crudo de la
# respuesta: sin salto de línea y sin fecha. El resultado era un muro de JSON
# pegado --`shift-reminder.log` acumuló cientos de «endpoint no permitido» así--
# donde no se puede ver cuándo pasó nada, ni separar una ejecución de la
# siguiente, ni alertar sobre un fallo. Tres crons estuvieron rotos 24 días
# escribiendo el error correcto en un archivo ilegible.
#
# Una línea por ejecución, con `ts`, `cron`, `http` y `ms`, la puede leer una
# persona y la puede parsear SigNoz. Es el requisito para que vigilar esto sirva
# de algo.
# ---------------------------------------------------------------------------

endpoint="${1:-}"

# El nombre corto, para agrupar en el panel: `/api/cron/shift-reminder` -> `shift-reminder`.
nombre="${endpoint##*/}"
nombre="${nombre%%\?*}"
[ -n "$nombre" ] || nombre="sin-endpoint"

# Escribe la línea del log. El cuerpo se escapa con python porque una respuesta
# con comillas dentro rompería el JSON, y un log que no se puede parsear es
# exactamente lo que vinimos a arreglar.
registrar() {
  local codigo="$1" ms="$2" cuerpo="$3"
  python3 - "$nombre" "$endpoint" "$codigo" "$ms" "$cuerpo" <<'PY'
import json, sys, time
nombre, endpoint, codigo, ms, cuerpo = sys.argv[1:6]
# Tope al cuerpo: una respuesta enorme no puede inundar el log ni la cuota de
# ingesta. Lo que importa para diagnosticar cabe de sobra en 2 KB.
if len(cuerpo) > 2000:
    cuerpo = cuerpo[:2000] + "...(recortado)"
print(json.dumps({
    "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "cron": nombre,
    "endpoint": endpoint,
    "http": int(codigo) if codigo.isdigit() else 0,
    "ms": int(ms),
    "ok": codigo.isdigit() and 200 <= int(codigo) < 400,
    "respuesta": cuerpo
}, ensure_ascii=False))
PY
}

case "$endpoint" in
  '/api/cron/attendance-axo-reminder?stage=1030'|\
  '/api/cron/attendance-axo-reminder?stage=1050'|\
  '/api/cron/energy-checklist-reminder'|\
  '/api/cron/shift-reminder'|\
  '/api/cron/morning-summary'|\
  '/api/cron/daily-summary'|\
  '/api/cron/weekly-summary'|\
  '/api/cron/midday-alert'|\
  '/api/cron/goal-celebration'|\
  '/api/cron/celebrations'|\
  '/api/cron/low-performance'|\
  '/api/cron/pending-due'|\
  '/api/cron/weekly-close-report'|\
  '/api/cron/report-reminder'|\
  '/api/cron/capture-alert')
    metodo=POST ;;
  '/api/cron/demo-refresh')
    metodo=GET ;;
  *)
    # ⚠️ También en JSON y en stdout. Antes iba a stderr como texto suelto, así
    # que en el log quedaba «endpoint no permitido» pegado al resto sin fecha:
    # el fallo de `shift-reminder` estuvo ahí, a la vista y sin poder verse.
    registrar 0 0 "endpoint no permitido en la lista blanca"
    exit 2 ;;
esac

env_file=/home/ubuntu/clarvex/compartido/.env
raw=$(grep -m1 '^CRON_SECRET=' "$env_file")
secret=${raw#CRON_SECRET=}
secret=$(printf '%s' "$secret" | sed 's/^["'"'"']//; s/["'"'"']$//')
test -n "$secret"

inicio=$(date +%s%3N)
tmp=$(mktemp)
# ⚠️ Sin `--fail`: hace falta LEER el cuerpo del error para saber qué pasó, y
# `--fail` lo descarta. El código de salida se decide abajo, a mano.
# ⚠️ Y `|| true` porque `set -e` mataría el guion antes de escribir la línea:
# un cron que falla sin dejar registro es justo el fallo que esto arregla.
codigo=$(curl --silent --show-error --output "$tmp" --write-out '%{http_code}' \
  --max-time 120 \
  --request "$metodo" \
  --header "Authorization: Bearer $secret" \
  "https://team.clarvex.tech${endpoint}" 2>>"$tmp" || true)
fin=$(date +%s%3N)
[ -n "$codigo" ] || codigo=0

registrar "$codigo" "$((fin - inicio))" "$(cat "$tmp")"
rm -f "$tmp"

# ⚠️ El código de salida se CONSERVA. Antes lo ponía `curl --fail`; si esto
# saliera siempre en 0, un cron roto pasaría a verse igual que uno sano, que es
# peor que el problema original.
if [ "$codigo" -ge 200 ] && [ "$codigo" -lt 400 ]; then
  exit 0
fi
exit 1
