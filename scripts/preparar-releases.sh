#!/bin/bash
# Prepara el árbol de versiones SIN tocar lo que está sirviendo.
#
# Se corre UNA vez, a mano, en el servidor. Es idempotente: repetirlo no rompe
# nada ni pierde la instalación actual.
#
# ⚠️ **NO cambia la versión activa ni reinicia PM2.** Deja el árbol nuevo listo
# y la instalación de siempre intacta. El corte es una decisión aparte y va al
# final de este archivo, en pasos que se leen antes de ejecutarlos.
#
#   bash scripts/preparar-releases.sh            # solo comprueba y prepara
#   CLARVEX_BASE=/tmp/prueba bash ...            # para ensayarlo fuera de sitio

set -euo pipefail

BASE="${CLARVEX_BASE:-/home/ubuntu/clarvex}"
INSTALACION_ACTUAL="${CLARVEX_ACTUAL:-/home/ubuntu/clarvex-app}"
ORIGEN="${CLARVEX_ORIGEN:-git@github.com:CLARVEX-TEAM/clarvex-platform.git}"

log() { echo "[preparar] $*"; }

log "base:        $BASE"
log "instalación: $INSTALACION_ACTUAL"

mkdir -p "$BASE/releases" "$BASE/compartido"

# ── El clon de trabajo ────────────────────────────────────────────────────
#
# Solo sirve para `fetch` y `git archive`. No se construye aquí ni se sirve
# desde aquí: cada versión sale de un `git archive` de su commit exacto.
if [ -d "$BASE/repo/.git" ]; then
  log "el clon ya existía"
else
  log "clonando en $BASE/repo"
  git clone --quiet "$ORIGEN" "$BASE/repo"
fi

# ── El .env, uno solo ─────────────────────────────────────────────────────
#
# ⚠️ **NO se copia el contenido ni se imprime.** Se enlaza el que ya existe, que
# es el único sitio donde vive. Copiarlo por versión multiplicaría los lugares
# donde hay secretos y habría que acordarse de borrarlos al podar.
if [ -e "$BASE/compartido/.env" ]; then
  log "el .env compartido ya estaba"
elif [ -f "$INSTALACION_ACTUAL/.env" ]; then
  log "enlazando el .env de la instalación actual"
  ln -s "$INSTALACION_ACTUAL/.env" "$BASE/compartido/.env"
else
  log "⚠️ No hay .env en $INSTALACION_ACTUAL."
  log "   Colócalo en $BASE/compartido/.env antes del primer despliegue."
fi

log ""
log "Preparado. La instalación actual NO se ha tocado y sigue sirviendo."
log ""
log "El corte, cuando se decida, en este orden:"
log ""
log "  1. Desplegar una versión nueva sin activarla todavía:"
log "       bash $INSTALACION_ACTUAL/scripts/deploy-release.sh \$(git -C $BASE/repo rev-parse origin/main)"
log "     La primera vez SÍ la activa: no hay versión anterior con la que comparar."
log ""
log "  2. Comprobar que PM2 quedó apuntando a la versión, no a la ruta vieja:"
log "       pm2 describe clarvex-team | grep -i 'exec cwd'"
log "     Tiene que decir $BASE/releases/<fecha>-<sha>."
log ""
log "  3. Comprobar la salud desde fuera, no solo desde el servidor:"
log "       curl -s https://team.clarvex.tech/api/health"
log ""
log "  4. Cambiar el workflow de despliegue para que llame a deploy-release.sh."
log ""
log "  5. Conservar $INSTALACION_ACTUAL sin borrar durante unos días: es el"
log "     camino de vuelta si algo del árbol nuevo no cuadra."
log ""
log "⚠️ El paso 2 es el que hay que mirar de verdad. PM2 guarda la ruta que"
log "   resolvió al arrancar; si quedó apuntando a la instalación vieja, los"
log "   despliegues parecerán funcionar y no cambiarán lo que se sirve."
