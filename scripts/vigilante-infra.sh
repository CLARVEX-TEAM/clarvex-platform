#!/usr/bin/env bash
#
# Vigilante de infraestructura: comprueba lo que falla en SILENCIO y avisa por
# Telegram al chat privado a traves de n8n.
#
# Los fallos que cubre son invisibles hasta que ya es tarde:
#   - un respaldo que dejo de correr se ve igual que uno que funciona
#   - un certificado caducado tumba el sitio sin previo aviso
#   - un disco lleno hace que Postgres deje de escribir
#   - un cron que deja de correr no avisa a nadie: solo deja de escribir su log
#
# MODO NORMAL (diario): calla si todo esta bien, avisa solo si algo falla.
# MODO RESUMEN (semanal): manda siempre un parte, aunque este todo bien.
#
#   ./vigilante-infra.sh              -> solo avisa si hay problemas
#   ./vigilante-infra.sh --resumen    -> manda el parte completo
#
# ⚠️ El modo resumen NO es decorativo: si este script muriera, su silencio se
# veria exactamente igual que "todo va bien". El parte semanal es lo que
# distingue las dos cosas.

set -uo pipefail

WEBHOOK="https://n8n.adrianluna.mx/webhook/alerta-infra"
LOGS="/home/ubuntu/logs"
APP="/home/ubuntu/clarvex-app"

# --- umbrales -----------------------------------------------------------------
DISCO_MAX=85          # % de uso a partir del cual avisa
CERT_MIN_DIAS=21      # dias restantes por debajo de los cuales avisa
RESPALDO_MAX_HORAS=26 # margen sobre las 24 h para que un retraso normal no avise

RESUMEN=0
[ "${1:-}" = "--resumen" ] && RESUMEN=1

problemas=()
parte=()

# --- 1) el respaldo de la base ------------------------------------------------
log_respaldo="$LOGS/backup.log"
if [ ! -f "$log_respaldo" ]; then
  problemas+=("No existe $log_respaldo: el respaldo diario nunca ha corrido aqui.")
else
  edad_min=$(( ( $(date +%s) - $(stat -c %Y "$log_respaldo") ) / 60 ))
  edad_h=$(( edad_min / 60 ))
  if [ "$edad_h" -ge "$RESPALDO_MAX_HORAS" ]; then
    problemas+=("El respaldo de la base no corre desde hace ${edad_h} h. Deberia ser diario.")
  elif ! tail -20 "$log_respaldo" | grep -q "subido a r2://"; then
    problemas+=("El respaldo corrio hace ${edad_h} h pero NO subio a R2. Revisa $log_respaldo.")
  else
    tam=$(tail -20 "$log_respaldo" | grep -oE "dump listo: [0-9.]+ MB" | tail -1)
    parte+=("Respaldo: hace ${edad_h} h, ${tam:-tamano desconocido}, en R2 y S3.")
  fi
fi

# --- 1b) el respaldo de los servicios de al lado -------------------------------
# Vaultwarden, n8n, el proxy y Kuma. Este respaldo es el unico que existe para
# esos cuatro: si deja de correr, no hay una segunda copia detras como si la hay
# para la base de la app.
log_servicios="$LOGS/servicios.log"
if [ ! -f "$log_servicios" ]; then
  problemas+=("No existe $log_servicios: el respaldo de Vaultwarden y n8n nunca ha corrido aqui.")
else
  edad_h=$(( ( $(date +%s) - $(stat -c %Y "$log_servicios") ) / 3600 ))
  if [ "$edad_h" -ge "$RESPALDO_MAX_HORAS" ]; then
    problemas+=("El respaldo de los servicios no corre desde hace ${edad_h} h. Vaultwarden lleva ese tiempo sin copia nueva.")
  elif ! tail -20 "$log_servicios" | grep -q "subido a r2://"; then
    problemas+=("El respaldo de los servicios corrio hace ${edad_h} h pero NO subio a R2. Revisa $log_servicios.")
  else
    tam=$(tail -20 "$log_servicios" | grep -oE "archivo listo: [0-9.]+ MB" | tail -1)
    parte+=("Respaldo de servicios: hace ${edad_h} h, ${tam:-tamano desconocido}.")
  fi
fi

# --- 2) certificados ----------------------------------------------------------
for cert in npm-1 npm-2; do
  fin=$(docker exec npm sh -c "openssl x509 -in /etc/letsencrypt/live/$cert/fullchain.pem -noout -enddate 2>/dev/null" 2>/dev/null | cut -d= -f2)
  if [ -z "$fin" ]; then
    problemas+=("No pude leer el certificado $cert.")
    continue
  fi
  dias=$(( ( $(date -d "$fin" +%s) - $(date +%s) ) / 86400 ))
  if [ "$dias" -lt "$CERT_MIN_DIAS" ]; then
    problemas+=("El certificado $cert vence en $dias dias. La renovacion automatica no esta funcionando.")
  else
    parte+=("Certificado $cert: $dias dias restantes.")
  fi
done

# --- 3) disco -----------------------------------------------------------------
uso=$(df --output=pcent / | tail -1 | tr -dc '0-9')
libre=$(df -h --output=avail / | tail -1 | tr -d ' ')
if [ "$uso" -ge "$DISCO_MAX" ]; then
  problemas+=("El disco va al ${uso}% (quedan $libre). Con el disco lleno, Postgres deja de escribir.")
else
  parte+=("Disco: ${uso}% usado, $libre libres.")
fi

# --- 4) los crons que se callan -----------------------------------------------
# Solo se revisan los logs que YA EXISTEN. Un cron que nunca ha corrido puede
# ser simplemente que su horario no ha llegado todavia; el fallo que importa es
# el del cron que funcionaba y dejo de hacerlo.
#
# Los margenes van holgados a proposito: un cron diario con tope de 30 h tolera
# un retraso normal sin despertar a nadie.
declare -A MAX_HORAS=(
  [goal-celebration]=3          # cada hora
  [morning-summary]=30          # diario
  [daily-summary]=30
  [midday-alert]=30
  [celebrations]=30
  [low-performance]=30
  [pending-due]=30
  [plan-reminder]=30
  [pending-overdue-managers]=30
  [report-reminder]=30
  [capture-alert]=30
  [kardex-audit]=30
  [weekly-summary]=192          # semanal, con un dia de margen
  [weekly-close-report]=192
)

callados=()
vivos=0
for nombre in "${!MAX_HORAS[@]}"; do
  archivo="$LOGS/$nombre.log"
  [ -f "$archivo" ] || continue
  horas=$(( ( $(date +%s) - $(stat -c %Y "$archivo") ) / 3600 ))
  if [ "$horas" -ge "${MAX_HORAS[$nombre]}" ]; then
    callados+=("$nombre (${horas} h)")
  else
    vivos=$(( vivos + 1 ))
  fi
done

if [ "${#callados[@]}" -gt 0 ]; then
  problemas+=("Crons que dejaron de escribir: $(IFS=', '; echo "${callados[*]}")")
else
  parte+=("Crons: $vivos al dia, ninguno callado.")
fi

# --- 5) la app responde -------------------------------------------------------
salud=$(curl -s --max-time 20 https://team.clarvex.tech/api/health 2>/dev/null)
if ! echo "$salud" | grep -q '"status":"ok"'; then
  problemas+=("La app no responde sana: ${salud:-sin respuesta}")
else
  parte+=("La app: sana.")
fi

# --- envio --------------------------------------------------------------------
avisar() {
  curl -s -o /dev/null --max-time 25 -X POST "$WEBHOOK" \
    -H "Content-Type: application/json" \
    --data "$(printf '{"title":%s,"text":%s}' \
      "$(printf '%s' "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" \
      "$(printf '%s' "$2" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")"
}

if [ "${#problemas[@]}" -gt 0 ]; then
  cuerpo=$(printf '%s\n\n' "${problemas[@]}")
  avisar "Algo necesita tu atencion" "$cuerpo"
  echo "$(date '+%F %T') avisado: ${#problemas[@]} problema(s)"
  exit 1
fi

if [ "$RESUMEN" -eq 1 ]; then
  cuerpo=$(printf '%s\n' "${parte[@]}")
  avisar "Parte semanal: todo en orden" "$cuerpo"
  echo "$(date '+%F %T') parte semanal enviado"
  exit 0
fi

echo "$(date '+%F %T') todo bien, sin avisar"
