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
# ⚠️ Las DEGRADACIONES van aparte de los problemas. Perder la copia cruzada en
# otra nube es serio, pero no es quedarse sin respaldo: si se mezclan, se leen
# igual y el dia que de verdad no haya copia deja de destacar.
degradaciones=()

# --- 1) el respaldo de la base ------------------------------------------------
#
# ⚠️ **Se lee el ESTADO, no el registro.**
#
# Antes se buscaba «subido a r2://» en las ultimas veinte lineas de backup.log y
# de ahi se anunciaba «en R2 y S3». Dos fallos en uno:
#
#   - S3 podia haber fallado --falla sin tumbar el respaldo, y eso es
#     deliberado-- y el aviso decia que la copia estaba hecha.
#   - Un fallo de HOY quedaba tapado por un exito de AYER mientras su linea
#     siguiera dentro de las ultimas veinte.
#
# `scripts/backup-db.ts` escribe ahora un resultado por destino y lo sobrescribe
# entero en cada corrida, asi que lo que se lee es siempre la ultima.
estado_respaldo="${BACKUP_ESTADO_PATH:-$LOGS/backup-estado.json}"
if [ ! -f "$estado_respaldo" ]; then
  problemas+=("No existe $estado_respaldo: el respaldo diario nunca ha corrido aqui, o no pudo escribir su estado.")
else
  leer_estado() { python3 -c "
import json,sys,datetime
with open('$estado_respaldo', encoding='utf-8') as f:
    e = json.load(f)
t = datetime.datetime.fromisoformat(e['terminadoEn'].replace('Z','+00:00'))
horas = int((datetime.datetime.now(datetime.timezone.utc) - t).total_seconds() // 3600)
r2, s3 = e.get('r2', {}), e.get('s3', {})
mb = round(r2.get('bytes', 0) / 1048576, 1)
print(f\"{horas}|{r2.get('estado','?')}|{s3.get('estado','?')}|{mb}|{r2.get('objeto','')}|{r2.get('error', s3.get('error',''))}\")
" 2>/dev/null; }

  if ! datos=$(leer_estado); then
    problemas+=("No se pudo leer $estado_respaldo. El respaldo puede estar bien, pero el monitor esta ciego.")
  else
    IFS='|' read -r edad_h estado_r2 estado_s3 tam_mb objeto detalle <<< "$datos"

    if [ "${edad_h:-999}" -ge "$RESPALDO_MAX_HORAS" ]; then
      problemas+=("El respaldo de la base no corre desde hace ${edad_h} h. Deberia ser diario.")
    fi

    # R2 es el respaldo de verdad: si falla, es un problema.
    case "$estado_r2" in
      ok) ;;
      fallo)  problemas+=("El respaldo a R2 FALLO hace ${edad_h} h: ${detalle:-sin detalle}.") ;;
      *)      problemas+=("R2 no esta configurado: no hay respaldo principal.") ;;
    esac

    # ⚠️ S3 va aparte y NO como problema: perder la segunda nube es serio, pero
    # no es quedarse sin respaldo. Mezclarlos hace que se lean igual, y el dia
    # que de verdad no haya copia tiene que destacar.
    case "$estado_s3" in
      ok) ;;
      fallo) degradaciones+=("La copia cruzada en S3 fallo. El respaldo de R2 SI se hizo: ${detalle:-sin detalle}.") ;;
      *)     degradaciones+=("Sin copia cruzada en S3: todo depende de un solo proveedor.") ;;
    esac

    if [ "$estado_r2" = "ok" ]; then
      destinos="solo en R2"
      [ "$estado_s3" = "ok" ] && destinos="en R2 y S3"
      parte+=("Respaldo: hace ${edad_h} h, ${tam_mb} MB, ${destinos} (${objeto}).")
    fi
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
  # Las degradaciones viajan CON los problemas, debajo y separadas: quien lee el
  # aviso tiene que ver las dos cosas sin que se confundan.
  if [ "${#degradaciones[@]}" -gt 0 ]; then
    cuerpo="$cuerpo"$'\n'"Ademas, funcionando a medias:"$'\n'"$(printf '%s\n' "${degradaciones[@]}")"
  fi
  avisar "Algo necesita tu atencion" "$cuerpo"
  echo "$(date '+%F %T') avisado: ${#problemas[@]} problema(s), ${#degradaciones[@]} degradacion(es)"
  exit 1
fi

# ⚠️ **Una degradacion avisa igual, aunque no haya ningun problema.**
#
# Sin esto, quedarse sin la copia cruzada en S3 se callaba hasta el parte
# semanal, y el parte decia «todo en orden». Un respaldo que depende de un solo
# proveedor no es «todo en orden»: es lo que se descubre el dia que hace falta.
if [ "${#degradaciones[@]}" -gt 0 ]; then
  cuerpo=$(printf '%s\n\n' "${degradaciones[@]}")
  cuerpo="$cuerpo"$'\n'"Lo demas esta bien:"$'\n'"$(printf '%s\n' "${parte[@]}")"
  avisar "Funcionando a medias" "$cuerpo"
  echo "$(date '+%F %T') avisado: ${#degradaciones[@]} degradacion(es)"
  exit 1
fi

if [ "$RESUMEN" -eq 1 ]; then
  cuerpo=$(printf '%s\n' "${parte[@]}")
  avisar "Parte semanal: todo en orden" "$cuerpo"
  echo "$(date '+%F %T') parte semanal enviado"
  exit 0
fi

echo "$(date '+%F %T') todo bien, sin avisar"
