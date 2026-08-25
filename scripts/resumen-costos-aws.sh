#!/usr/bin/env bash
#
# Resumen semanal del gasto de AWS, al chat privado de Telegram via n8n.
#
# POR QUE EXISTE: la alerta de presupuesto solo salta al pasar un umbral y llega
# por correo. Un numero semanal construye intuicion y, sobre todo, **caza un
# servicio de costo fijo la semana que aparece** en vez de en 2028, cuando se
# acabe el credito y la factura deje de ser cero.
#
# ⚠️ Mide el gasto BRUTO, antes de creditos. El neto es cero y seguira siendolo
# hasta agosto de 2028: mirarlo no dice nada util.
#
# No guarda ninguna llave: usa el rol de instancia `clarvex-instancia`, acotado
# a `ce:GetCostAndUsage` y nada mas.

set -uo pipefail

AWS=/snap/bin/aws
WEBHOOK="https://n8n.adrianluna.mx/webhook/alerta-infra"
REGION=us-east-1

DESDE=$(date -d "7 days ago" +%F)
HASTA=$(date +%F)

# Servicios que cobran POR EXISTIR. Si alguno aparece, hay que saberlo ya.
VIGILADOS="NatGateway|Elastic Load Balancing|Relational Database|CloudWatch Synthetics|Transit Gateway|VPN"

# --- gasto bruto de la semana -------------------------------------------------
bruto=$($AWS ce get-cost-and-usage \
  --time-period Start=$DESDE,End=$HASTA \
  --granularity MONTHLY --metrics UnblendedCost \
  --filter '{"Dimensions":{"Key":"RECORD_TYPE","Values":["Usage"]}}' \
  --region $REGION \
  --query 'ResultsByTime[0].Total.UnblendedCost.Amount' --output text 2>/dev/null)

if [ -z "$bruto" ] || [ "$bruto" = "None" ]; then
  echo "$(date '+%F %T') no pude leer el gasto"
  exit 1
fi

# 7 dias -> mes de 30. `bc` no esta en la imagen minima; se usa awk.
semana=$(printf '%.2f' "$bruto")
mensual=$(awk -v b="$bruto" 'BEGIN { printf "%.2f", b / 7 * 30 }')

# --- por servicio -------------------------------------------------------------
detalle=$($AWS ce get-cost-and-usage \
  --time-period Start=$DESDE,End=$HASTA \
  --granularity MONTHLY --metrics UnblendedCost \
  --filter '{"Dimensions":{"Key":"RECORD_TYPE","Values":["Usage"]}}' \
  --group-by Type=DIMENSION,Key=SERVICE \
  --region $REGION \
  --query 'ResultsByTime[0].Groups[].[Keys[0],Metrics.UnblendedCost.Amount]' \
  --output text 2>/dev/null)

top=$(echo "$detalle" | awk -F'\t' '$2 > 0.01 { printf "%.2f\t%s\n", $2, $1 }' \
  | sort -rn | head -5 \
  | awk -F'\t' '{ printf "  %s  $%s\n", $2, $1 }')

# --- lo que cobra por existir -------------------------------------------------
fijos=$(echo "$detalle" | grep -iE "$VIGILADOS" | awk -F'\t' '$2 > 0 { printf "%s ($%.2f)\n", $1, $2 }')

# --- mensaje ------------------------------------------------------------------
cuerpo="Ultimos 7 dias: \$${semana} brutos, antes de creditos.
A ese ritmo el mes cerraria en \$${mensual}.

Por servicio:
${top}"

titulo="Gasto de AWS: \$${mensual}/mes al ritmo actual"

if [ -n "$fijos" ]; then
  cuerpo="${cuerpo}

⚠️ APARECIO UN SERVICIO DE COSTO FIJO:
${fijos}

Estos cobran por existir, uses o no, y siguen ahi cuando se acabe el credito."
  titulo="Ojo: gasto fijo nuevo en AWS"
fi

curl -s -o /dev/null --max-time 25 -X POST "$WEBHOOK" \
  -H "Content-Type: application/json" \
  --data "$(printf '{"title":%s,"text":%s}' \
    "$(printf '%s' "$titulo" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" \
    "$(printf '%s' "$cuerpo"  | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")"

echo "$(date '+%F %T') resumen enviado: \$${semana} en 7 dias, proyeccion \$${mensual}"
