#!/usr/bin/env bash
# Aviso a gerencia de pendientes vencidos. Lo dispara el crontab de ubuntu.
set -uo pipefail

ENV_FILE=/home/ubuntu/clarvex/compartido/.env
ENDPOINT=https://team.clarvex.tech/api/cron/pending-overdue-managers
TAG=pending-overdue-managers

log() { echo "[$(date -Is)] [$TAG] $*"; }

# Un .env movido de sitio dejaba SECRET vacio y la API respondia 401 en
# silencio durante meses. Cortar aqui es preferible a llamar sin credencial.
SECRET=$(grep -m1 '^CRON_SECRET=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"')

if [ -z "$SECRET" ]; then
  log "ERROR: CRON_SECRET vacio o ilegible en $ENV_FILE; no se llama a $ENDPOINT" >&2
  exit 1
fi

RESPONSE=$(curl -s -w $'\n%{http_code}' -X POST "$ENDPOINT" -H "Authorization: Bearer $SECRET")
STATUS=${RESPONSE##*$'\n'}
BODY=${RESPONSE%$'\n'*}

if [ "$STATUS" = "000" ]; then
  # 000 es el codigo de curl cuando no hubo respuesta (red caida, TLS, DNS).
  log "ERROR: sin respuesta de $ENDPOINT" >&2
  exit 1
fi

if [ "$STATUS" != "200" ]; then
  log "ERROR: HTTP $STATUS — $BODY" >&2
  exit 1
fi

log "OK — $BODY"
