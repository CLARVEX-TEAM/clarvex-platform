#!/bin/bash
# Simulacion local de `scripts/deploy-release.sh`, sin AWS y sin base de datos.
#
# ⚠️ **NO toca produccion ni la red.** Monta un arbol falso en un directorio
# temporal y pone en el PATH unos `pnpm`, `pm2`, `curl` y `flock` de mentira que
# se pueden hacer fallar a voluntad. Lo que se comprueba es lo que el guion
# DECIDE ante cada fallo, que es donde estaba el problema.
#
#   bash tests/deploy-release.sim.sh

set -uo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
# ⚠️ Se puede apuntar a OTRA copia del guion con `SIM_GUION`. No es un adorno:
# es como se comprueba que esta simulacion sabe ponerse en rojo — se corre
# contra la version anterior del guion y tiene que fallar. Una prueba que nunca
# se ha visto fallar no demuestra nada, que es la leccion de las tres pasadas
# falsas que dio esta misma simulacion.
GUION="${SIM_GUION:-$RAIZ/scripts/deploy-release.sh}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASADAS=0
FALLIDAS=0

comprobar() {
  local nombre="$1" esperado="$2" real="$3"
  if [ "$esperado" = "$real" ]; then
    printf "  ok   %-52s (%s)\n" "$nombre" "$real"
    PASADAS=$((PASADAS + 1))
  else
    printf "  FALLA %-52s esperado=%s real=%s\n" "$nombre" "$esperado" "$real"
    FALLIDAS=$((FALLIDAS + 1))
  fi
}

contar_en() {
  # `grep -c` imprime 0 y sale 1 cuando no hay coincidencias.
  [ -f "$1" ] || { echo 0; return; }
  grep -c "$2" "$1" 2>/dev/null || true
}

contar_reload() {
  # `grep -c` imprime 0 y sale 1 cuando no hay coincidencias: sin esto, el
  # `|| echo 0` de fuera anadia un segundo cero y la comparacion nunca cuadraba.
  [ -f "$1" ] || { echo 0; return; }
  grep -c "pm2 reload" "$1" 2>/dev/null || true
}

# ── Dobles de los mandatos externos ───────────────────────────────────────
#
# Cada uno mira una variable de entorno para decidir si falla. Asi el mismo
# arbol sirve para todos los escenarios.
montar_dobles() {
  local bin="$1"
  mkdir -p "$bin"

  cat > "$bin/pnpm" <<'EOF'
#!/bin/bash
case "$1 ${2:-}" in
  "install --frozen-lockfile")
    [ "${SIM_FALLA_INSTALL:-0}" = "1" ] && { echo "install: falla simulada" >&2; exit 1; }
    echo "install ok"; mkdir -p node_modules; exit 0 ;;
  "exec prisma")
    if [ "${3:-}" = "generate" ]; then
      [ "${SIM_FALLA_GENERATE:-0}" = "1" ] && { echo "generate: falla simulada" >&2; exit 1; }
      echo "generate ok"; exit 0
    fi
    if [ "${3:-}" = "migrate" ]; then
      [ "${SIM_FALLA_MIGRACION:-0}" = "1" ] && { echo "migrate: falla simulada" >&2; exit 1; }
      if [ "${SIM_HAY_MIGRACION:-0}" = "1" ]; then echo "Applying migration 20260101_x"; else echo "No pending migrations to apply"; fi
      exit 0
    fi
    exit 0 ;;
  "run build")
    [ "${SIM_FALLA_BUILD:-0}" = "1" ] && { echo "build: falla simulada" >&2; exit 1; }
    mkdir -p .next/server
    # ⚠️ El build deja rastro DENTRO de la cache, para poder comprobar despues
    # si se conservo o se tiro. Sin el rastro, "la carpeta existe" no distingue
    # una cache reutilizada de una recien creada y vacia.
    if [ "${SIM_BUILD_REEMPLAZA_CACHE:-0}" = "1" ]; then
      # Simula que `next build` sustituye el enlace por un directorio real, que
      # es el caso en el que la cache quedaria DENTRO de la version.
      rm -rf .next/cache/webpack
      mkdir -p .next/cache/webpack
    fi
    mkdir -p .next/cache/webpack
    echo "rastro-del-build" >> .next/cache/webpack/marca.txt
    # Un build "que termina" pero deja el .next a medias.
    [ "${SIM_BUILD_INCOMPLETO:-0}" = "1" ] || echo "sim-build-id" > .next/BUILD_ID
    echo "build ok"; exit 0 ;;
esac
exit 0
EOF

  cat > "$bin/pm2" <<'EOF'
#!/bin/bash
case "$1" in
  reload)
    echo "pm2 reload $2" >> "$SIM_REGISTRO_PM2"
    # ⚠️ Falla SOLO para la version que diga SIM_PM2_FALLA_EN. Un pm2 que falle
    # siempre no permite ver la vuelta atras: la anterior tampoco arrancaria.
    case "$2" in
      *"${SIM_PM2_FALLA_EN:-__ninguna__}"*) echo "pm2: no pude recargar" >&2; exit 1 ;;
    esac
    # Por omision el reload SI adopta la ruta nueva. Con SIM_PM2_NO_SE_MUEVE=1
    # se finge lo contrario, que es el fallo peligroso.
    if [ "${SIM_PM2_NO_SE_MUEVE:-0}" != "1" ]; then
      dirname "$2" > "$SIM_BASE/pm2-cwd"
    fi
    ;;
  start)
    echo "pm2 start $2" >> "$SIM_REGISTRO_PM2"
    case "$2" in
      *"${SIM_PM2_FALLA_EN:-__ninguna__}"*) echo "pm2: no pude arrancar" >&2; exit 1 ;;
    esac
    dirname "$2" > "$SIM_BASE/pm2-cwd"
    ;;
  delete) echo "pm2 delete" >> "$SIM_REGISTRO_PM2" ;;
  # ⚠️ `save` puede fallar sin que la version deje de servir: es lo unico de
  # `activar` que no decide si PM2 esta en la version nueva.
  save)   echo "pm2 save" >> "$SIM_REGISTRO_PM2"; exit "${SIM_SAVE_CODIGO:-0}" ;;
  jlist)
    CWD=$(cat "$SIM_BASE/pm2-cwd" 2>/dev/null || echo "")
    OTRA="$CWD"
    ESTADO=online
    CUANTAS=2
    EJECUTABLE_MALO=0
    case "$CWD" in
      *"${SIM_PM2_DEFECTO_EN:-__ninguna__}"*)
        case "${SIM_PM2_DEFECTO:-}" in
          mezclado) OTRA=/version-vieja ;;
          caido) ESTADO=errored ;;
          faltante) CUANTAS=1 ;;
          duplicado) CUANTAS=3 ;;
          ejecutable) EJECUTABLE_MALO=1 ;;
        esac ;;
    esac
    printf '['
    for i in $(seq 1 "$CUANTAS"); do
      [ "$i" = 1 ] || printf ','
      RUTA="$CWD"; [ "$i" = 1 ] || RUTA="$OTRA"
      RUTA_BIN="$RUTA"
      if [ "$i" = 2 ] && [ "$EJECUTABLE_MALO" = 1 ]; then RUTA_BIN="$RUTA/otro"; fi
      printf '{"name":"clarvex-team","pm2_env":{"pm_cwd":"%s","status":"%s","pm_exec_path":"%s/node_modules/next/dist/bin/next"}}' "$RUTA" "$ESTADO" "$RUTA_BIN"
    done
    printf ']'
    ;;
  list) echo "clarvex-team online" ;;
esac
exit 0
EOF

  # La salud responde segun el escenario, y puede depender de que version esta
  # activa: asi se simula "la nueva no levanta pero la anterior si".
  cat > "$bin/curl" <<'EOF'
#!/bin/bash
ACTIVA=$(cat "$SIM_BASE/estado/actual" 2>/dev/null || echo "")
if [ "${SIM_SALUD:-ok}" = "nunca" ]; then exit 22; fi
if [ "${SIM_SALUD:-ok}" = "solo-anterior" ]; then
  case "$ACTIVA" in
    *"${SIM_VERSION_NUEVA:-__ninguna__}"*) exit 22 ;;
    *) echo '{"status":"ok"}'; exit 0 ;;
  esac
fi
echo '{"status":"ok"}'
exit 0
EOF

  chmod +x "$bin/pnpm" "$bin/pm2" "$bin/curl"
}

# ── Un arbol de versiones falso, con su repo git real pero vacio ──────────
montar_base() {
  local base="$1"
  rm -rf "$base"
  mkdir -p "$base/compartido" "$base/releases"
  printf 'DATABASE_URL=postgresql://falso\n' > "$base/compartido/.env"

  git init --quiet "$base/repo" && git -C "$base/repo" config core.autocrlf false
  (
    cd "$base/repo"
    git config user.email sim@clarvex.local
    git config user.name Simulacion
    # ⚠️ La rama tiene que ser `main` DESDE EL PRINCIPIO.
    #
    # Con `git branch -f main` despues del primer commit, HEAD se quedaba en
    # `master` y los commits siguientes no movian `main`. Los segundos
    # despliegues abortaban en la comprobacion del SHA, y escenarios como el de
    # salud pasaban en verde SIN EJERCITARSE.
    git symbolic-ref HEAD refs/heads/main
    mkdir -p scripts
    printf '{}\n' > package.json
    printf 'module.exports={apps:[{name:"clarvex-team",instances:2}]};\n' > ecosystem.config.cjs
    git add -A
    git commit --quiet -m "version simulada"
    # El guion hace `fetch origin main`, asi que `origin` es el propio repo.
    git remote add origin "$base/repo" 2>/dev/null || true
    git fetch --quiet origin main 2>/dev/null || true
  )
  git -C "$base/repo" rev-parse HEAD
}

ejecutar() {
  local base="$1"; shift
  local sha
  sha=$(git -C "$base/repo" rev-parse HEAD)
  env PATH="$TMP/bin:$PATH" \
      CLARVEX_BASE="$base" \
      SIM_BASE="$base" \
      SIM_REGISTRO_PM2="$base/pm2.log" \
      CLARVEX_INTENTOS=2 CLARVEX_ESPERA=0 CLARVEX_MB_NECESARIOS=1 \
      "$@" bash "$GUION" "$sha" > "$base/salida.txt" 2>&1
  echo $?
}

montar_dobles "$TMP/bin"

# ⚠️ Antes de nada: que el guion llegue de verdad a ejecutarse.
#
# La primera version de esta simulacion daba 17 comprobaciones en verde con el
# guion muriendo en la LINEA 59 por un `flock` inexistente. Todos los caminos
# de fallo "pasaban" porque abortar antes produce los mismos sintomas que
# abortar bien. Sin esta comprobacion, la simulacion no prueba nada.
echo "== cordura: el guion se ejecuta =="
BASE0="$TMP/cordura"; montar_base "$BASE0" > /dev/null
CODIGO=$(ejecutar "$BASE0")
comprobar "el guion no muere antes de empezar" "0" "$(grep -c "command not found" "$BASE0/salida.txt" 2>/dev/null || true)"
comprobar "llego a construir" "1" "$(grep -c "build ok" "$BASE0/salida.txt" 2>/dev/null || true)"
comprobar "llego a comprobar la salud" "1" "$(grep -c "salud OK" "$BASE0/salida.txt" 2>/dev/null || true)"
comprobar "dejo una version en disco" "1" "$(find "$BASE0/releases" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d " ")"

echo
echo "== escenarios =="

# 1. Camino feliz: primera version, se activa y queda sana.
BASE1="$TMP/feliz"; montar_base "$BASE1" > /dev/null
CODIGO=$(ejecutar "$BASE1")
comprobar "primer despliegue sale en 0" "0" "$CODIGO"
comprobar "queda una version activa" "1" "$([ -s "$BASE1/estado/actual" ] && echo 1 || echo 0)"
comprobar "PM2 recargo la version nueva" "1" "$(contar_reload "$BASE1/pm2.log")"

# 2. Falla la instalacion: no se activa nada y no queda version a medias.
BASE2="$TMP/install"; montar_base "$BASE2" > /dev/null
CODIGO=$(ejecutar "$BASE2" SIM_FALLA_INSTALL=1)
comprobar "install fallido sale distinto de 0" "1" "$([ "$CODIGO" != "0" ] && echo 1 || echo 0)"
comprobar "install fallido no deja version" "0" "$(find "$BASE2/releases" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')"
comprobar "install fallido no recarga PM2" "0" "$(contar_reload "$BASE2/pm2.log")"

# 3. Falla la migracion: no se construye ni se activa.
BASE3="$TMP/migracion"; montar_base "$BASE3" > /dev/null
CODIGO=$(ejecutar "$BASE3" SIM_FALLA_MIGRACION=1)
comprobar "migracion fallida sale distinto de 0" "1" "$([ "$CODIGO" != "0" ] && echo 1 || echo 0)"
comprobar "migracion fallida no recarga PM2" "0" "$(contar_reload "$BASE3/pm2.log")"
comprobar "migracion fallida no deja version" "0" "$(find "$BASE3/releases" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')"

# 4. Falla el build: la version activa anterior sigue intacta.
BASE4="$TMP/build"; montar_base "$BASE4" > /dev/null
ejecutar "$BASE4" > /dev/null                       # deja una version buena
PRIMERA=$(cat "$BASE4/estado/actual")
: > "$BASE4/pm2.log"
(cd "$BASE4/repo" && printf 'cambio
' > cambio.txt && git add -A && git commit --quiet -m "cambio" && git update-ref refs/remotes/origin/main HEAD)

CODIGO=$(ejecutar "$BASE4" SIM_FALLA_BUILD=1)
comprobar "build fallido sale distinto de 0" "1" "$([ "$CODIGO" != "0" ] && echo 1 || echo 0)"
comprobar "build fallido NO cambia la activa" "$PRIMERA" "$(cat "$BASE4/estado/actual")"
comprobar "build fallido no recarga PM2" "0" "$(contar_reload "$BASE4/pm2.log")"

# 5. Build "termina" con .next incompleto: tampoco se activa.
BASE5="$TMP/incompleto"; montar_base "$BASE5" > /dev/null
ejecutar "$BASE5" > /dev/null
PRIMERA5=$(cat "$BASE5/estado/actual")
: > "$BASE5/pm2.log"
(cd "$BASE5/repo" && printf 'cambio
' > cambio.txt && git add -A && git commit --quiet -m "cambio" && git update-ref refs/remotes/origin/main HEAD)

CODIGO=$(ejecutar "$BASE5" SIM_BUILD_INCOMPLETO=1)
comprobar "build incompleto sale distinto de 0" "1" "$([ "$CODIGO" != "0" ] && echo 1 || echo 0)"
comprobar "build incompleto NO cambia la activa" "$PRIMERA5" "$(cat "$BASE5/estado/actual")"

# 6. La version nueva no responde sana: se vuelve a la anterior SIN recompilar.
BASE6="$TMP/salud"; montar_base "$BASE6" > /dev/null
ejecutar "$BASE6" > /dev/null
ANTERIOR6=$(cat "$BASE6/estado/actual")
: > "$BASE6/pm2.log"
# Se fuerza un commit nuevo para que la version sea distinta.
(cd "$BASE6/repo" && printf 'otra\n' > otro.txt && git add -A && git commit --quiet -m "otra" && git update-ref refs/remotes/origin/main HEAD)
NUEVA6="$(date +%Y%m%d)"
CODIGO=$(ejecutar "$BASE6" SIM_SALUD=solo-anterior SIM_VERSION_NUEVA="$(git -C "$BASE6/repo" rev-parse --short=7 HEAD)")
comprobar "salud fallida sale en 1 (revertido)" "1" "$CODIGO"
comprobar "salud fallida vuelve a la anterior" "$ANTERIOR6" "$(cat "$BASE6/estado/actual")"
comprobar "vuelta atras sin recompilar" "0" "$(grep -c 'build ok' "$BASE6/salida.txt" | awk '{print ($1>1)?1:0}')"

# 7. Ni la anterior responde: sale con 2, que es un estado distinto.
BASE7="$TMP/nadie"; montar_base "$BASE7" > /dev/null
ejecutar "$BASE7" > /dev/null
(cd "$BASE7/repo" && printf 'otra\n' > otro.txt && git add -A && git commit --quiet -m "otra" && git update-ref refs/remotes/origin/main HEAD)
CODIGO=$(ejecutar "$BASE7" SIM_SALUD=nunca)
comprobar "nadie responde sale en 2" "2" "$CODIGO"

# 8. Sin espacio: se para antes de tocar nada.
BASE8="$TMP/disco"; montar_base "$BASE8" > /dev/null
CODIGO=$(env PATH="$TMP/bin:$PATH" CLARVEX_BASE="$BASE8" SIM_BASE="$BASE8" \
  SIM_REGISTRO_PM2="$BASE8/pm2.log" CLARVEX_MB_NECESARIOS=999999999 \
  bash "$GUION" "$(git -C "$BASE8/repo" rev-parse HEAD)" > "$BASE8/salida.txt" 2>&1; echo $?)
comprobar "sin espacio sale distinto de 0" "1" "$([ "$CODIGO" != "0" ] && echo 1 || echo 0)"
comprobar "sin espacio no deja version" "0" "$(find "$BASE8/releases" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')"

# 9. SHA que ya no es origin/main: se aborta.
BASE9="$TMP/sha"; montar_base "$BASE9" > /dev/null
CODIGO=$(env PATH="$TMP/bin:$PATH" CLARVEX_BASE="$BASE9" SIM_BASE="$BASE9" \
  SIM_REGISTRO_PM2="$BASE9/pm2.log" CLARVEX_MB_NECESARIOS=1 \
  bash "$GUION" "0000000000000000000000000000000000000000" > "$BASE9/salida.txt" 2>&1; echo $?)
comprobar "SHA que no es origin/main se rechaza" "1" "$([ "$CODIGO" != "0" ] && echo 1 || echo 0)"

# 10. PM2 adopta la ruta nueva: no hace falta recrear la app.
BASE10="$TMP/pm2ok"; montar_base "$BASE10" > /dev/null
ejecutar "$BASE10" > /dev/null
comprobar "PM2 se movio: no se recrea la app" "0" "$(contar_en "$BASE10/pm2.log" 'pm2 delete')"
comprobar "y se guarda la definicion con pm2 save" "1" "$(contar_en "$BASE10/pm2.log" 'pm2 save')"

# 11. ⚠️ PM2 NO adopta la ruta nueva: hay que recrear la app.
#
# Es el fallo peligroso: el despliegue sale verde, la salud responde, y sigue
# sirviendo la version vieja. Se anuncia como acierto sin serlo.
BASE11="$TMP/pm2quieto"; montar_base "$BASE11" > /dev/null
CODIGO=$(ejecutar "$BASE11" SIM_PM2_NO_SE_MUEVE=1)
comprobar "PM2 quieto: se detecta y se recrea" "1" "$(contar_en "$BASE11/pm2.log" 'pm2 delete')"
comprobar "PM2 quieto: el despliegue igual termina bien" "0" "$CODIGO"

# 12. ⚠️ PM2 no consigue servir la version nueva: hay que VOLVER ATRAS.
#
# Este camino no existia. Con `set -e`, un `pm2 reload` fallido mataba el guion
# ahi mismo, y para entonces el puntero YA apuntaba a la version nueva: el
# estado decia que estaba activa una version que PM2 nunca sirvio, y nadie
# revertia nada. El codigo de salida era 1 en los dos casos, asi que lo que
# distingue el arreglo es el PUNTERO, no la salida.
BASE12="$TMP/pm2caido"; montar_base "$BASE12" > /dev/null
ejecutar "$BASE12" > /dev/null
ANTERIOR12=$(cat "$BASE12/estado/actual")
: > "$BASE12/pm2.log"
(cd "$BASE12/repo" && printf 'otra\n' > otro.txt && git add -A && git commit --quiet -m "otra" && git update-ref refs/remotes/origin/main HEAD)
CORTO12=$(git -C "$BASE12/repo" rev-parse --short=7 HEAD)
CODIGO=$(ejecutar "$BASE12" SIM_PM2_FALLA_EN="$CORTO12")
comprobar "PM2 caido: el puntero vuelve a la anterior" "$ANTERIOR12" "$(cat "$BASE12/estado/actual")"
comprobar "PM2 caido: sale en 1 (revertido)" "1" "$CODIGO"
comprobar "PM2 caido: intento recrear antes de rendirse" "1" "$(contar_en "$BASE12/pm2.log" 'pm2 delete')"
comprobar "PM2 caido: no recompila al volver" "0" "$(grep -c 'build ok' "$BASE12/salida.txt" | awk '{print ($1>1)?1:0}')"

echo
# El defecto persiste tras start: no basta revisar solo el primer worker.
for defecto in mezclado caido faltante duplicado ejecutable; do
  CASO="$TMP/pm2-$defecto"; montar_base "$CASO" >/dev/null
  ejecutar "$CASO" >/dev/null
  PREVIA=$(cat "$CASO/estado/actual")
  (cd "$CASO/repo" && echo otra > otro.txt && git add -A && git commit --quiet -m otra)
  NUEVO_SHA=$(git -C "$CASO/repo" rev-parse --short=7 HEAD)
  CODIGO=$(ejecutar "$CASO" SIM_PM2_DEFECTO="$defecto" SIM_PM2_DEFECTO_EN="$NUEVO_SHA")
  comprobar "$defecto: rechaza la versión" 1 "$CODIGO"
  comprobar "$defecto: restaura puntero" "$PREVIA" "$(cat "$CASO/estado/actual")"
  comprobar "$defecto: restaura workers" "$PREVIA" "$(cat "$CASO/pm2-cwd")"
done
# 14. ⚠️ `pm2 save` falla y TODO lo demas esta bien: se avisa, no se revierte.
#
# Este camino no estaba cubierto --el doble de `pm2` nunca fallaba en `save`--
# y por eso paso desapercibido que se habia vuelto fatal. Con la version que lo
# trataba asi, un fichero de volcado que no se pudo escribir DESHACIA un
# despliegue sano: el primer despliegue salia en 1 en vez de 0, y con version
# anterior salia en 2 anunciando que la anterior tampoco respondia, lo cual era
# falso. Lo que se pierde si `save` falla llega el dia que la maquina se
# reinicie; hoy la tienda esta sirviendo.
BASE14="$TMP/save"; montar_base "$BASE14" > /dev/null
ejecutar "$BASE14" > /dev/null
PREVIA14=$(cat "$BASE14/estado/actual")
: > "$BASE14/pm2.log"
(cd "$BASE14/repo" && printf 'otra\n' > otro.txt && git add -A && git commit --quiet -m "otra" && git update-ref refs/remotes/origin/main HEAD)
CODIGO=$(ejecutar "$BASE14" SIM_SAVE_CODIGO=1)
comprobar "save fallido: el despliegue igual termina bien" "0" "$CODIGO"
comprobar "save fallido: NO vuelve a la anterior" "1" "$([ "$(cat "$BASE14/estado/actual")" != "$PREVIA14" ] && echo 1 || echo 0)"
comprobar "save fallido: los workers se quedan en la nueva" "1" "$([ "$(cat "$BASE14/pm2-cwd")" != "$PREVIA14" ] && echo 1 || echo 0)"
comprobar "save fallido: se avisa del reinicio" "1" "$(contar_en "$BASE14/salida.txt" 'REINICIO del servidor')"
comprobar "save fallido: no se inventa que la anterior no responde" "0" "$(contar_en "$BASE14/salida.txt" 'TAMPOCO RESPONDE')"

# 15. La cache de compilacion se COMPARTE entre versiones.
#
# ⚠️ Antes se construia siempre en frio: cada version se extrae limpia de git,
# asi que la cache nacia vacia, el build la llenaba y el guion la borraba al
# terminar. Se pagaba construirla y luego se tiraba, en cada despliegue. Medido
# en produccion: el paso de construir tardaba 8 min 26 s.
#
# Lo que se comprueba no es "la carpeta existe" --una cache recien creada y
# vacia tambien existe-- sino que el RASTRO que dejo el build siga ahi.
BASE15="$TMP/cache"; montar_base "$BASE15" > /dev/null
ejecutar "$BASE15" > /dev/null
comprobar "cache: se conserva tras un build correcto" "1" \
  "$([ -f "$BASE15/compartido/cache-webpack/marca.txt" ] && echo 1 || echo 0)"
ACTIVA15=$(cat "$BASE15/estado/actual")
comprobar "cache: NO viaja dentro de la version" "0" \
  "$([ -e "$ACTIVA15/.next/cache/webpack" ] && echo 1 || echo 0)"

# Un segundo despliegue tiene que ENCONTRARLA, que es todo el punto.
(cd "$BASE15/repo" && printf 'dos\n' > dos.txt && git add -A && git commit --quiet -m dos && git update-ref refs/remotes/origin/main HEAD)
ejecutar "$BASE15" > /dev/null
comprobar "cache: el segundo despliegue la reutiliza" "1" \
  "$(contar_en "$BASE15/salida.txt" 'caché compartida:')"
comprobar "cache: acumula el trabajo de los dos builds" "2" \
  "$(contar_en "$BASE15/compartido/cache-webpack/marca.txt" 'rastro-del-build')"

# 16. ⚠️ Un build fallido TIRA la cache compartida.
#
# Una cache envenenada rompe TODOS los despliegues siguientes, y el error no
# senala hacia ella: se ve como un build que falla sin motivo, commit tras
# commit. Es el peor fallo posible de esta mejora, asi que ante la duda se tira.
BASE16="$TMP/cache-rota"; montar_base "$BASE16" > /dev/null
ejecutar "$BASE16" > /dev/null
comprobar "cache rota: existe antes de fallar" "1" \
  "$([ -f "$BASE16/compartido/cache-webpack/marca.txt" ] && echo 1 || echo 0)"
(cd "$BASE16/repo" && printf 'tres\n' > tres.txt && git add -A && git commit --quiet -m tres && git update-ref refs/remotes/origin/main HEAD)
CODIGO=$(ejecutar "$BASE16" SIM_FALLA_BUILD=1)
comprobar "cache rota: el despliegue falla" "1" "$CODIGO"
comprobar "cache rota: la cache se descarta" "0" \
  "$([ -d "$BASE16/compartido/cache-webpack" ] && echo 1 || echo 0)"

# 17. ⚠️ Con poco disco NO se usa cache. El disco manda sobre la velocidad:
# con el disco lleno Postgres deja de escribir y la tienda no puede capturar;
# un build lento solo hace esperar.
BASE17="$TMP/cache-disco"; montar_base "$BASE17" > /dev/null
ejecutar "$BASE17" > /dev/null
(cd "$BASE17/repo" && printf 'cuatro\n' > cuatro.txt && git add -A && git commit --quiet -m cuatro && git update-ref refs/remotes/origin/main HEAD)
CODIGO=$(ejecutar "$BASE17" MB_LIBRES_PARA_CACHE=99999999)
comprobar "poco disco: el despliegue igual funciona" "0" "$CODIGO"
comprobar "poco disco: lo dice en el registro" "1" \
  "$(contar_en "$BASE17/salida.txt" 'se construye en frío')"

# 18. ⚠️ Una cache que pasa del tope se descarta, no crece sin limite.
BASE18="$TMP/cache-tope"; montar_base "$BASE18" > /dev/null
ejecutar "$BASE18" > /dev/null
(cd "$BASE18/repo" && printf 'cinco\n' > cinco.txt && git add -A && git commit --quiet -m cinco && git update-ref refs/remotes/origin/main HEAD)
CODIGO=$(ejecutar "$BASE18" MB_CACHE_MAX=0)
comprobar "tope: el despliegue igual funciona" "0" "$CODIGO"
comprobar "tope: la cache se rehace" "1" \
  "$(contar_en "$BASE18/salida.txt" 'se descarta y se rehace')"
comprobar "tope: no acumula el rastro anterior" "1" \
  "$(contar_en "$BASE18/compartido/cache-webpack/marca.txt" 'rastro-del-build')"

# 19. ⚠️ Si `next build` sustituye el enlace por un directorio real, la cache
# queda DENTRO de la version. Borrarla ahi dejaria el siguiente build otra vez
# en frio, y sin decirlo: se veria como que la mejora no sirvio. Se mueve.
BASE19="$TMP/cache-directorio"; montar_base "$BASE19" > /dev/null
CODIGO=$(ejecutar "$BASE19" SIM_BUILD_REEMPLAZA_CACHE=1)
comprobar "enlace sustituido: el despliegue funciona" "0" "$CODIGO"
comprobar "enlace sustituido: la cache acaba en compartido" "1" \
  "$([ -f "$BASE19/compartido/cache-webpack/marca.txt" ] && echo 1 || echo 0)"
ACTIVA19=$(cat "$BASE19/estado/actual")
comprobar "enlace sustituido: no se queda en la version" "0" \
  "$([ -e "$ACTIVA19/.next/cache/webpack" ] && echo 1 || echo 0)"

# 20. La cache es lo PRIMERO que se sacrifica cuando falta disco.
#
# ⚠️ Sin esto, la cache podria crecer hasta impedir el despliegue que la creo:
# la guarda de espacio corre ANTES del bloque que sabe descartarla, asi que
# abortaria sin llegar a el. Un despliegue imposible por una optimizacion es
# peor que no tener la optimizacion.
BASE20="$TMP/cache-bloquea"; montar_base "$BASE20" > /dev/null
ejecutar "$BASE20" > /dev/null
comprobar "sin disco: la cache existe antes" "1" "$([ -d "$BASE20/compartido/cache-webpack" ] && echo 1 || echo 0)"
(cd "$BASE20/repo" && printf 'seis
' > seis.txt && git add -A && git commit --quiet -m seis && git update-ref refs/remotes/origin/main HEAD)
ejecutar "$BASE20" CLARVEX_MB_NECESARIOS=99999999 > /dev/null
comprobar "sin disco: la cache se libera para intentarlo" "0" "$([ -d "$BASE20/compartido/cache-webpack" ] && echo 1 || echo 0)"
comprobar "sin disco: lo dice en el registro" "1" "$(contar_en "$BASE20/salida.txt" 'se descarta la caché compartida')"


echo "  pasadas: $PASADAS   fallidas: $FALLIDAS"
if [ "$FALLIDAS" -ne 0 ] && [ "${SIM_VERBOSO:-0}" = "1" ]; then
  for salida in "$TMP"/*/salida.txt; do
    echo "--- $salida ---"; tail -12 "$salida"
  done
fi
[ "$FALLIDAS" -eq 0 ]
