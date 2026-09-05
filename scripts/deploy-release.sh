#!/bin/bash
# Despliegue por VERSIONES: cada una en su directorio, se activa al final.
#
# Sustituye a `scripts/deploy.sh`, que construía sobre la instalación viva.
#
# ⚠️ **EL PROBLEMA QUE RESUELVE.** `next build` limpia y reescribe `.next` en el
# sitio, así que la versión que se está sirviendo se desmonta mientras se
# construye la nueva. Si el build fallaba, `git reset --hard` devolvía el
# CÓDIGO, pero los artefactos anteriores ya no existían: no había nada a lo que
# volver sin recompilar. Y recompilar en una máquina de 3.7 GB tarda minutos,
# justo cuando la tienda está caída.
#
# Aquí cada versión se prepara entera y aparte. La activa no se toca hasta que
# la nueva está construida y comprobada, y la anterior se conserva **usable**:
# volver atrás es repuntar un enlace y recargar, sin compilar nada.
#
# ⚠️ **LAS MIGRACIONES NO VUELVEN ATRÁS.** Revertir el código no deshace un
# `ALTER TABLE`. Por eso las migraciones de este proyecto son aditivas: una
# columna nueva que el código viejo ignora no rompe nada, pero un `DROP COLUMN`
# deja la versión anterior sin un campo que sí usa. Este guion NO promete
# rollback de esquema y avisa cuando aplicó una migración.
#
#   bash scripts/deploy-release.sh <sha>
#
# Requiere la preparación de `scripts/preparar-releases.sh`, que se corre UNA
# vez y a mano. Ver AGENTS.md.

set -euo pipefail

BASE="${CLARVEX_BASE:-/home/ubuntu/clarvex}"
REPO="$BASE/repo"
VERSIONES="$BASE/releases"
# ⚠️ **El estado vive en un FICHERO, no en el enlace.**
#
# El enlace `actual` es una comodidad para quien entra al servidor
# (`cd .../actual`), pero no puede ser la fuente de verdad: hay entornos donde
# `ln -s` copia en vez de enlazar, y entonces `[ -L actual ]` da falso y el
# guion cree que es el primer despliegue. Ahi la vuelta atras deja de existir
# justo cuando hace falta.
ESTADO="$BASE/estado"
ACTUAL="$BASE/actual"
PUNTERO_ACTUAL="$ESTADO/actual"
PUNTERO_ANTERIOR="$ESTADO/anterior"
COMPARTIDO="$BASE/compartido"
CERROJO="$BASE/.deploy.lock"

SALUD="${CLARVEX_SALUD:-https://team.clarvex.tech/api/health}"
INTENTOS="${CLARVEX_INTENTOS:-12}"
ESPERA="${CLARVEX_ESPERA:-5}"
# Cuántas versiones se conservan. La actual, la anterior y un margen: si un
# fallo se descubre dos despliegues después, todavía hay a dónde volver.
CONSERVAR="${CLARVEX_CONSERVAR:-4}"

# ⚠️ **Lo que hace falta es el PICO, no lo que queda después.**
#
# Medido en el servidor: fuente 13 MB, `node_modules` casi gratis --pnpm los
# monta con enlaces duros a un almacén que ya está en disco-- y `.next` 2.0 GB
# **de los que 1.9 GB son caché de webpack**, que se retira antes de activar.
#
# O sea: durante el build hacen falta ~2 GB, y una vez retirada la caché la
# versión se queda en ~150 MB. Por eso conservar cuatro sí cabe, y por eso el
# umbral mira el pico y no el residuo.
MB_NECESARIOS="${CLARVEX_MB_NECESARIOS:-3072}"

OBJETIVO="${1:-}"

log() { echo "[deploy] $*"; }
fatal() { echo "[deploy] ⚠️ $*" >&2; exit 1; }

# ── Un despliegue a la vez ────────────────────────────────────────────────
#
# ⚠️ Dos a la vez sobre la misma máquina se pisan: uno construye mientras el
# otro repunta el enlace, y la versión activa acaba siendo la que ganó la
# carrera.
#
# ⚠️ **Con `mkdir` y NO con `flock`.** `flock` viene de util-linux y no está en
# todas partes: en Git Bash sobre Windows no existe, y el guion moría en la
# primera línea con «command not found». Peor todavía, la simulación lo tomaba
# por «ya hay un despliegue en marcha» y todos los escenarios pasaban por el
# motivo equivocado. `mkdir` es atómico en POSIX y no depende de nada.
#
# Un cerrojo huérfano —el proceso murió sin soltarlo— no bloquea para siempre:
# se guarda el PID y, si ya no vive, se toma.
tomar_cerrojo() {
  if mkdir "$CERROJO" 2>/dev/null; then
    echo $$ > "$CERROJO/pid"
    return 0
  fi

  local dueno
  dueno=$(cat "$CERROJO/pid" 2>/dev/null || echo "")
  if [ -n "$dueno" ] && kill -0 "$dueno" 2>/dev/null; then
    return 1
  fi

  log "cerrojo huérfano de un despliegue que murió (pid ${dueno:-desconocido}); se toma"
  echo $$ > "$CERROJO/pid"
  return 0
}

if ! tomar_cerrojo; then
  fatal "Ya hay un despliegue en marcha ($CERROJO). No se lanzan dos a la vez."
fi
trap 'rm -rf "$CERROJO"' EXIT

[ -n "$OBJETIVO" ] || fatal "Falta el SHA a desplegar: bash $0 <sha>"
[ -d "$REPO/.git" ] || fatal "No existe $REPO. Corre antes scripts/preparar-releases.sh."
[ -f "$COMPARTIDO/.env" ] || fatal "No existe $COMPARTIDO/.env. Es el único .env y lo comparten todas las versiones."

# ── Espacio ───────────────────────────────────────────────────────────────
#
# Antes de nada: preparar una versión copia el árbol, instala dependencias y
# construye. Quedarse sin disco a mitad deja una versión rota y, peor, puede
# dejar a Postgres sin poder escribir.
LIBRE_MB=$(df -Pm "$BASE" | tail -1 | awk '{print $4}')
log "disco libre: ${LIBRE_MB} MB (se necesitan ${MB_NECESARIOS})"
if [ "${LIBRE_MB:-0}" -lt "$MB_NECESARIOS" ]; then
  fatal "Sin espacio para preparar una versión. No se toca nada."
fi

# ── Qué se está sirviendo ahora ───────────────────────────────────────────
mkdir -p "$ESTADO"
VERSION_ACTIVA=""
if [ -s "$PUNTERO_ACTUAL" ]; then
  VERSION_ACTIVA=$(cat "$PUNTERO_ACTUAL")
  if [ ! -d "$VERSION_ACTIVA" ]; then
    log "⚠️ el puntero apunta a $VERSION_ACTIVA, que ya no existe. Se ignora."
    VERSION_ACTIVA=""
  else
    log "versión activa: $VERSION_ACTIVA"
  fi
else
  log "no hay versión activa todavía (primer despliegue)"
fi

# ── Traer el código y comprobar que es el commit aprobado ─────────────────
log "trayendo cambios…"
git -C "$REPO" fetch --quiet origin main

RESUELTO=$(git -C "$REPO" rev-parse "origin/main")
if [ "$RESUELTO" != "$OBJETIVO" ]; then
  fatal "El SHA aprobado ($OBJETIVO) ya no es origin/main ($RESUELTO). Lanza otro despliegue."
fi

CORTO="${OBJETIVO:0:7}"
NUEVA="$VERSIONES/$(date +%Y%m%d-%H%M%S)-$CORTO"

if [ "$VERSION_ACTIVA" != "" ] && [ "$(cat "$VERSION_ACTIVA/.sha" 2>/dev/null)" = "$OBJETIVO" ]; then
  log "la versión activa ya es $CORTO. Nada que hacer."
  exit 0
fi

# ── Preparar la versión nueva, aparte ─────────────────────────────────────
log "preparando $NUEVA"
mkdir -p "$NUEVA"

# `git archive` da un árbol limpio del commit exacto, sin `.git` ni restos de
# otra versión. Es más barato que clonar y no arrastra el historial.
git -C "$REPO" archive "$OBJETIVO" | tar -x -C "$NUEVA"
echo "$OBJETIVO" > "$NUEVA/.sha"

# El `.env` es UNO y lo comparten todas las versiones: copiarlo por versión
# multiplicaría los sitios donde vive un secreto.
ln -s "$COMPARTIDO/.env" "$NUEVA/.env"

limpiar_fallida() {
  log "limpiando la versión a medias $NUEVA"
  rm -rf "$NUEVA"
}

cd "$NUEVA"

# ── Dependencias ──────────────────────────────────────────────────────────
#
# `--frozen-lockfile` a propósito: si el lockfile no cuadra con package.json se
# para, en vez de resolver por su cuenta un árbol distinto al que se probó.
if ! pnpm install --frozen-lockfile; then
  limpiar_fallida
  fatal "Falló la instalación de dependencias. La versión activa sigue intacta."
fi

if ! pnpm exec prisma generate; then
  limpiar_fallida
  fatal "Falló la generación del cliente de Prisma. La versión activa sigue intacta."
fi

# ── Migraciones ───────────────────────────────────────────────────────────
#
# ⚠️ Van ANTES de cambiar la versión activa y DESPUÉS de que la instalación haya
# ido bien: una migración aplicada con la versión vieja sirviendo solo es segura
# si es aditiva, que es la regla de este proyecto.
log "aplicando migraciones pendientes, si las hay…"
if ! SALIDA_MIGRACION=$(pnpm exec prisma migrate deploy 2>&1); then
  echo "$SALIDA_MIGRACION"
  limpiar_fallida
  fatal "Falló la migración. No se construye ni se cambia la versión activa."
fi
echo "$SALIDA_MIGRACION"

MIGRO=1
if echo "$SALIDA_MIGRACION" | grep -q "No pending migrations"; then MIGRO=0; fi

# ── Construir ─────────────────────────────────────────────────────────────
#
# Construye en el `.next` de ESTA versión. La que se está sirviendo no se toca:
# ese era el fallo de fondo del guion anterior.
if ! pnpm run build; then
  limpiar_fallida
  fatal "Falló el build. La versión activa sigue sirviendo y no se reinició nada."
fi

# El build puede «terminar» dejando un `.next` incompleto: se comprueba que
# existan las dos piezas que `next start` necesita de verdad.
if [ ! -d "$NUEVA/.next/server" ] || [ ! -f "$NUEVA/.next/BUILD_ID" ]; then
  limpiar_fallida
  fatal "El build terminó pero .next está incompleto. No se activa."
fi
log "versión preparada: $(cat "$NUEVA/.next/BUILD_ID")"

# ── La caché de compilación NO viaja con la versión ───────────────────────
#
# ⚠️ **Sin esto, guardar versiones es inviable en esta máquina.** Medido en el
# servidor: de los 2.0 GB que ocupa un `.next`, **1.9 GB son
# `.next/cache/webpack`**. Guardar cuatro versiones serían ~8 GB en un disco con
# 4.9 GB libres.
#
# ⚠️ Y no hace falta: la caché acelera el SIGUIENTE build **en ese mismo
# directorio**, y cada versión se construye en uno nuevo. Nunca se reutiliza.
#
# Se borra solo `webpack`, no `.next/cache` entero: `fetch-cache` e `images` sí
# los usa `next start` en marcha. Es la misma distinción que ya vive en
# `scripts/deploy.sh`.
if [ -d "$NUEVA/.next/cache/webpack" ]; then
  ANTES_MB=$(du -sm "$NUEVA/.next" | cut -f1)
  rm -rf "$NUEVA/.next/cache/webpack"
  log "caché de webpack retirada de la versión: ${ANTES_MB} MB → $(du -sm "$NUEVA/.next" | cut -f1) MB"
fi

# ── Activar ───────────────────────────────────────────────────────────────
#
# El enlace se cambia con `ln -sfn` sobre un temporal y `mv`, que en el mismo
# sistema de ficheros es atómico: no hay un instante en que `actual` no apunte
# a ninguna parte.
activar() {
  local destino="$1"

  # El puntero se escribe con `mv`, que en el mismo sistema de ficheros es
  # atomico: no hay un instante en que el estado quede a medias.
  echo "$destino" > "$ESTADO/.actual.nuevo"
  mv -f "$ESTADO/.actual.nuevo" "$PUNTERO_ACTUAL"

  # Comodidad para quien entra al servidor. Que falle no cambia nada: el estado
  # ya esta escrito.
  ln -sfn "$destino" "$BASE/.actual.enlace" 2>/dev/null && mv -Tf "$BASE/.actual.enlace" "$ACTUAL" 2>/dev/null || true

  pm2 reload "$destino/ecosystem.config.cjs" --update-env

  # ⚠️ **COMPROBAR que PM2 se movió de verdad.**
  #
  # `pm2 reload <fichero>` recarga la app por nombre, pero PM2 guarda la ruta
  # que resolvió al arrancar. Si no adopta el `cwd` nuevo, el despliegue PARECE
  # funcionar --sale verde, la salud responde-- y sigue sirviendo la versión
  # vieja. Es el peor fallo posible: se anuncia como acierto.
  #
  # Si el reload no bastó, se recrea la app. Eso sí tiene un instante de corte,
  # pero es preferible a creer que se desplegó algo que no se desplegó.
  local actual_pm2
  actual_pm2=$(pm2 jlist 2>/dev/null | node -e "
    let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
      try { const a=JSON.parse(d).find(p=>p.name==='clarvex-team');
            console.log(a ? a.pm2_env.pm_cwd : ''); } catch { console.log(''); }
    })" 2>/dev/null || echo "")

  if [ "$actual_pm2" != "$destino" ]; then
    log "⚠️ PM2 seguía en '${actual_pm2:-desconocido}'. Recreando la app para que adopte $destino"
    pm2 delete clarvex-team >/dev/null 2>&1 || true
    pm2 start "$destino/ecosystem.config.cjs" --update-env
  fi

  # ⚠️ Sin `pm2 save`, un reinicio del servidor restauraría la definición
  # guardada, que apunta a la instalación vieja. El despliegue se desharía solo
  # el día que la máquina se reinicie, y nadie relacionaría las dos cosas.
  pm2 save >/dev/null 2>&1 || log "⚠️ 'pm2 save' falló: un reinicio del servidor volvería a la versión anterior."
}

comprobar_salud() {
  for intento in $(seq 1 "$INTENTOS"); do
    if curl -sf --max-time 10 "$SALUD" | grep -q '"status":"ok"'; then
      log "salud OK (intento $intento)"
      return 0
    fi
    sleep "$ESPERA"
  done
  return 1
}

log "activando la versión nueva"
if [ -n "$VERSION_ACTIVA" ]; then
  echo "$VERSION_ACTIVA" > "$PUNTERO_ANTERIOR"
fi
activar "$NUEVA"

if ! comprobar_salud; then
  log "la versión nueva no responde sana"

  if [ -z "$VERSION_ACTIVA" ]; then
    fatal "Era el primer despliegue: no hay versión anterior a la que volver."
  fi

  # ⚠️ Aquí está la diferencia: se vuelve SIN COMPILAR. La versión anterior
  # conserva su `.next` y su `node_modules`, así que recuperarse es repuntar el
  # enlace y recargar.
  log "volviendo a $VERSION_ACTIVA (sin recompilar)"
  activar "$VERSION_ACTIVA"

  if comprobar_salud; then
    log "revertido y sano."
    [ "$MIGRO" = "1" ] && log "⚠️ se aplicó una migración: volver el código NO la deshizo."
    exit 1
  fi

  log "⚠️ LA VERSIÓN ANTERIOR TAMPOCO RESPONDE."
  log "Mira 'pm2 logs clarvex-team' y el estado de Postgres."
  exit 2
fi

# ── Limpieza ──────────────────────────────────────────────────────────────
#
# Se conservan varias versiones, no solo la anterior: si un fallo se descubre
# dos despliegues después, todavía hay a dónde volver. Nunca se borra la activa
# ni la marcada como anterior.
log "conservando las últimas $CONSERVAR versiones"
CONSERVADA_ACTUAL=$(cat "$PUNTERO_ACTUAL" 2>/dev/null || echo "")
CONSERVADA_ANTERIOR=$(cat "$PUNTERO_ANTERIOR" 2>/dev/null || echo "")
# shellcheck disable=SC2012
ls -1dt "$VERSIONES"/*/ 2>/dev/null | tail -n "+$((CONSERVAR + 1))" | while IFS= read -r vieja; do
  RUTA=$(readlink -f "$vieja")
  [ "$RUTA" = "$CONSERVADA_ACTUAL" ] && continue
  [ "$RUTA" = "$CONSERVADA_ANTERIOR" ] && continue
  log "  borrando $RUTA"
  rm -rf "$RUTA"
done

log "✅ desplegado $CORTO en $NUEVA"
[ "$MIGRO" = "1" ] && log "⚠️ se aplicó una migración: una vuelta atrás del código NO la deshace."
pm2 list | grep clarvex || true
exit 0
