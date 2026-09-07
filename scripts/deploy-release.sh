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
# **de los que 1.9 GB son caché de webpack**, que sale de la versión antes de
# activar.
#
# O sea: durante el build hacen falta ~2 GB, y una vez fuera la caché la versión
# se queda en ~150 MB. Por eso conservar cuatro sí cabe, y por eso el umbral
# mira el pico y no el residuo.
#
# ⚠️ Desde que la caché se COMPARTE, esos 1.9 GB no desaparecen: se mudan a
# `compartido/cache-webpack` y viven ahí entre despliegues. Es **una** copia, no
# una por versión --que era el motivo real de borrarla-- y se descarta sola si
# el disco aprieta o si pasa del tope. Ver el bloque de la caché más abajo.
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

# ⚠️ **La caché es lo PRIMERO que se sacrifica, y por eso nunca bloquea.**
#
# Vive en `compartido` para acelerar el build, pero son ~1.7 GB en un disco al
# 87 %. Sin esto, la caché podría crecer hasta impedir el despliegue que la
# creó: la guarda de espacio corre antes, así que abortaría sin llegar siquiera
# al bloque que sabe descartarla. Un despliegue imposible por una optimización
# es peor que no tener la optimización.
if [ "${LIBRE_MB:-0}" -lt "$MB_NECESARIOS" ] && [ -d "$COMPARTIDO/cache-webpack" ]; then
  log "falta espacio; se descarta la caché compartida ($(du -sm "$COMPARTIDO/cache-webpack" 2>/dev/null | cut -f1) MB) y se vuelve a medir"
  rm -rf "$COMPARTIDO/cache-webpack"
  LIBRE_MB=$(df -Pm "$BASE" | tail -1 | awk '{print $4}')
  log "disco libre tras liberarla: ${LIBRE_MB} MB"
fi

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

# ── La caché de compilación se COMPARTE entre versiones ───────────────────
#
# ⚠️ **Antes se construía siempre en frío, y encima se pagaba dos veces.** Cada
# versión se extrae limpia de git, así que `.next/cache/webpack` nacía vacía; el
# build la llenaba --1.9 GB-- y al terminar el guion la borraba. O sea: se pagaba
# construirla y luego se tiraba, en cada despliegue. Medido en producción, el
# paso de construir tardaba **8 min 26 s**.
#
# El razonamiento que había aquí era correcto salvo en una cosa: decía que la
# caché «acelera el siguiente build en ese mismo directorio, y cada versión se
# construye en uno nuevo». Eso es consecuencia del diseño, no una ley. Con UNA
# caché en `compartido/`, sí se reutiliza — y sigue habiendo una sola copia, que
# era el motivo real de borrarla.
#
# ⚠️ **El disco manda sobre la velocidad.** Con el disco lleno Postgres deja de
# escribir y la tienda no puede capturar; un build lento solo hace esperar. Por
# eso la caché se usa únicamente si sobra margen, y se descarta si crece.
CACHE_COMPARTIDA="$COMPARTIDO/cache-webpack"
CACHE_EN_VERSION="$NUEVA/.next/cache/webpack"
MB_CACHE_MAX="${MB_CACHE_MAX:-2000}"
# ⚠️ **2500 y no 4000.** El primer valor que puse era MAYOR que el espacio libre
# real del servidor (3.7 GB), asi que la cache se habria descartado en cada
# despliegue y la mejora no se habria usado NUNCA -- funcionando en verde y sin
# decir nada. El umbral tiene que dejar sitio para construir DESPUES de soltar
# la cache, no exigir sitio como si la cache no ocupara el que ya ocupa.
MB_LIBRES_PARA_CACHE="${MB_LIBRES_PARA_CACHE:-2500}"

LIBRE_AHORA=$(df -Pm "$BASE" | tail -1 | awk '{print $4}')
if [ "${LIBRE_AHORA:-0}" -lt "$MB_LIBRES_PARA_CACHE" ]; then
  log "solo ${LIBRE_AHORA} MB libres: se descarta la caché compartida y se construye en frío"
  rm -rf "$CACHE_COMPARTIDA"
elif [ -d "$CACHE_COMPARTIDA" ]; then
  CACHE_MB=$(du -sm "$CACHE_COMPARTIDA" 2>/dev/null | cut -f1)
  if [ "${CACHE_MB:-0}" -gt "$MB_CACHE_MAX" ]; then
    log "caché compartida en ${CACHE_MB} MB (tope ${MB_CACHE_MAX}): se descarta y se rehace"
    rm -rf "$CACHE_COMPARTIDA"
  else
    log "caché compartida: ${CACHE_MB} MB"
  fi
fi

# ⚠️ **Se MUEVE, no se enlaza.** La primera versión de esto ponía un enlace
# simbólico, y la simulación lo delató: en Git Bash sobre Windows `ln -s` no
# crea un enlace, **copia**. O sea que el guion se habría comportado de una
# forma en el servidor y de otra donde se prueba, y la simulación habría estado
# validando un camino que producción nunca recorre.
#
# `mv` dentro del mismo sistema de archivos es un renombrado: instantáneo, sin
# copiar los 1.9 GB, e igual en todas partes. `compartido` y `releases` cuelgan
# ambos de `$BASE`, así que siempre lo es.
#
# ⚠️ Si el despliegue se corta entre este `mv` y el de vuelta, la caché se queda
# dentro de una versión a medias y `limpiar_fallida` se la lleva. Lo peor que
# pasa entonces es un build en frío; no hay estado corrupto posible.
mkdir -p "$NUEVA/.next/cache"
if [ -d "$CACHE_COMPARTIDA" ]; then
  mv "$CACHE_COMPARTIDA" "$CACHE_EN_VERSION"
fi

# ── Construir ─────────────────────────────────────────────────────────────
#
# Construye en el `.next` de ESTA versión. La que se está sirviendo no se toca:
# ese era el fallo de fondo del guion anterior.
# ⚠️ **`CLARVEX_CI_VERIFICADA=1` salta lint y tipos, y solo es legítimo aquí.**
#
# Medido: son 19 s de cada 64 s de build --casi un tercio-- y son trabajo
# REPETIDO: el preflight de este despliegue exige CI verde del mismo SHA, y esa
# CI ya corrió `tsc --noEmit` y `eslint . --max-warnings 0` enteros. El servidor
# los rehacía, y es la máquina más lenta de las tres.
#
# La bandera se pone AQUÍ y no en `next.config.mjs` a propósito: un `pnpm build`
# en cualquier otro sitio tiene que seguir comprobando. Este guion es el único
# camino que trae la garantía consigo.
export CLARVEX_CI_VERIFICADA=1

if ! pnpm run build; then
  # ⚠️ **Una caché envenenada rompería TODOS los despliegues siguientes**, y el
  # error no señalaría hacia aquí: se vería como un build que falla sin motivo
  # aparente, commit tras commit. Ante un fallo se tira y el siguiente intento
  # arranca limpio.
  rm -rf "$CACHE_EN_VERSION" "$CACHE_COMPARTIDA"
  log "caché compartida descartada por si el fallo venía de ella"
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
# Se retira solo `webpack`, no `.next/cache` entero: `fetch-cache` e `images` sí
# los usa `next start` en marcha. Es la misma distinción que ya vive en
# `scripts/deploy.sh`.
#
# ⚠️ **Se quita el ENLACE, no la caché.** Es la diferencia entre conservar el
# trabajo para el siguiente despliegue y volver a tirarlo. `rm -f` sobre un
# enlace simbólico borra el enlace; escribir una barra al final del nombre
# borraría el contenido del destino.
if [ -d "$CACHE_EN_VERSION" ]; then
  # ⚠️ Se devuelve a `compartido` en vez de borrarla. Borrarla aquí --que es lo
  # que hacía antes-- dejaba el siguiente build otra vez en frío, y sin decirlo:
  # se vería como que la mejora no sirvió.
  rm -rf "$CACHE_COMPARTIDA"
  mv "$CACHE_EN_VERSION" "$CACHE_COMPARTIDA"
  log "caché devuelta a compartido ($(du -sm "$CACHE_COMPARTIDA" 2>/dev/null | cut -f1) MB) para el siguiente despliegue"
fi
log "tamaño de la versión: $(du -sm "$NUEVA/.next" 2>/dev/null | cut -f1) MB de .next"

# ── Activar ───────────────────────────────────────────────────────────────
#
# El enlace se cambia con `ln -sfn` sobre un temporal y `mv`, que en el mismo
# sistema de ficheros es atómico: no hay un instante en que `actual` no apunte
# a ninguna parte.
#
# ⚠️ **DEVUELVE un código; no mata el guion.** Con `set -e`, un `pm2 reload` o un
# `pm2 start` fallidos abortaban aquí mismo, y para entonces el puntero YA
# apuntaba a la versión nueva: quedaba anunciada como activa una versión que PM2
# nunca llegó a servir, y **la vuelta atrás no se ejecutaba**. El rollback solo
# cubría el caso «arrancó pero no responde sana», que es el menos grave de los
# dos. Ahora todo fallo de activación sale por la misma puerta que el de salud.
# Comprueba TODOS los workers, su ejecutable, estado y número configurado.
pm2_correcto() {
  local destino="$1" instancias="$2"
  local actual_pm2
  actual_pm2=$(pm2 jlist | CLARVEX_PM2_INSTANCES="$instancias" node -e '
    let d="";
    process.stdin.on("data", c => d += c).on("end", () => {
      try {

        const expected = Number(process.env.CLARVEX_PM2_INSTANCES);
        const workers = JSON.parse(d).filter(p => p.name === "clarvex-team");
        const cwd = workers[0]?.pm2_env?.pm_cwd;
        const ok = Number.isInteger(expected) && expected > 0 && workers.length === expected &&
          workers.every(p => p.pm2_env.pm_cwd === cwd && p.pm2_env.status === "online" &&
            p.pm2_env.pm_exec_path === cwd + "/node_modules/next/dist/bin/next");
        if (ok) console.log(cwd);
        process.exitCode = ok ? 0 : 1;
      } catch { process.exitCode = 1; }
    });') || return 1
  [ "$actual_pm2" = "$destino" ]
}

esperar_pm2() {
  local destino="$1" instancias="$2"
  for intento in $(seq 1 "$INTENTOS"); do
    if pm2_correcto "$destino" "$instancias"; then return 0; fi
    sleep "$ESPERA"
  done
  return 1
}

activar() {
  local destino="$1" instancias
  instancias=$(node -e 'const c=require(process.argv[1]); const a=c.apps.find(a=>a.name==="clarvex-team");
    if (!a || !Number.isInteger(a.instances) || a.instances < 1) process.exit(1);
    console.log(a.instances);' "$destino/ecosystem.config.cjs") || return 1

  if ! pm2 reload "$destino/ecosystem.config.cjs" --update-env || ! esperar_pm2 "$destino" "$instancias"; then
    log "PM2 no tiene todos los workers en la versión esperada. Recreando la app."
    pm2 delete clarvex-team >/dev/null 2>&1 || true
    pm2 start "$destino/ecosystem.config.cjs" --update-env || return 1
    esperar_pm2 "$destino" "$instancias" || return 1
  fi

  # Las funciones invocadas desde if no heredan errexit: comprobar cada escritura.
  echo "$destino" > "$ESTADO/.actual.nuevo" || return 1
  mv -f "$ESTADO/.actual.nuevo" "$PUNTERO_ACTUAL" || return 1
  ln -sfn "$destino" "$BASE/.actual.enlace" 2>/dev/null && mv -Tf "$BASE/.actual.enlace" "$ACTUAL" 2>/dev/null || true

  # ⚠️ **`pm2 save` avisa, NO revierte.** Es la única línea de `activar` que no
  # decide si la versión está sirviendo: para cuando se ejecuta, PM2 ya tiene
  # todos los workers en la versión nueva y el puntero ya lo dice. Lo que falla
  # aquí es la persistencia de la definición, y su consecuencia llega el día que
  # la máquina se reinicie, no hoy.
  #
  # Devolver 1 mandaba ese fallo por la puerta de la vuelta atrás, y entonces un
  # fichero de volcado que no se pudo escribir **deshacía un despliegue sano**:
  # el primer despliegue salía en 1 en vez de 0, y con versión anterior salía en
  # 2 con el mensaje «LA VERSIÓN ANTERIOR TAMPOCO RESPONDE», que es falso —
  # responde perfectamente—. Se cambia una molestia por una caída.
  if ! pm2 save >/dev/null 2>&1; then
    log "⚠️ 'pm2 save' falló: la versión está sirviendo, pero un REINICIO del servidor volvería a la anterior. Ejecútalo a mano."
  fi
  return 0
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

# ── Una sola puerta de vuelta atrás ───────────────────────────────────────
#
# ⚠️ **Los dos fallos terminan aquí, y antes solo lo hacía uno.** «PM2 no pudo
# arrancar la versión» y «la versión arrancó pero no responde sana» dejan a la
# tienda igual de caída, así que se recuperan igual. Tener rollback solo para el
# segundo era peor que no tenerlo: el primero salía del guion en silencio, con el
# puntero ya movido, y quien mirara el estado leería que la versión nueva está
# activa.
volver_atras() {
  log "$1"

  if [ -z "$VERSION_ACTIVA" ]; then
    fatal "Era el primer despliegue: no hay versión anterior a la que volver."
  fi

  # ⚠️ Aquí está la diferencia: se vuelve SIN COMPILAR. La versión anterior
  # conserva su `.next` y su `node_modules`, así que recuperarse es repuntar el
  # enlace y recargar.
  log "volviendo a $VERSION_ACTIVA (sin recompilar)"
  if activar "$VERSION_ACTIVA" && comprobar_salud; then
    log "revertido y sano."
    if [ "$MIGRO" = "1" ]; then
      log "⚠️ se aplicó una migración: volver el código NO la deshizo."
    fi
    exit 1
  fi

  log "⚠️ LA VERSIÓN ANTERIOR TAMPOCO RESPONDE."
  log "Mira 'pm2 logs clarvex-team' y el estado de Postgres."
  exit 2
}

log "activando la versión nueva"
if [ -n "$VERSION_ACTIVA" ]; then
  echo "$VERSION_ACTIVA" > "$PUNTERO_ANTERIOR"
fi

if ! activar "$NUEVA"; then
  volver_atras "PM2 no pudo servir la versión nueva"
fi

if ! comprobar_salud; then
  volver_atras "la versión nueva no responde sana"
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
if [ "$MIGRO" = "1" ]; then
  log "⚠️ se aplicó una migración: una vuelta atrás del código NO la deshace."
fi
pm2 list | grep clarvex || true
exit 0
