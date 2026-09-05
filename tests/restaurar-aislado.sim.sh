#!/bin/bash
# Simulacion de `scripts/restaurar-aislado.sh`, sin Docker y sin PostgreSQL.
#
# ⚠️ **NO levanta contenedores ni toca ningun respaldo real.** Pone en el PATH un
# `docker` de mentira que lleva su propio registro de contenedores en un
# directorio temporal, y que puede fingir a voluntad los errores de `pg_restore`
# y los recuentos de `psql`. Lo que se comprueba es lo que el guion DECIDE.
#
#   bash tests/restaurar-aislado.sim.sh
#
# Igual que la del despliegue, acepta `SIM_GUION` para correrse contra otra copia
# del guion: es como se comprueba que sabe ponerse en rojo.

set -uo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
GUION="${SIM_GUION:-$RAIZ/scripts/restaurar-aislado.sh}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASADAS=0
FALLIDAS=0

comprobar() {
  local nombre="$1" esperado="$2" real="$3"
  if [ "$esperado" = "$real" ]; then
    printf "  ok   %-54s (%s)\n" "$nombre" "$real"
    PASADAS=$((PASADAS + 1))
  else
    printf "  FALLA %-54s esperado=%s real=%s\n" "$nombre" "$esperado" "$real"
    FALLIDAS=$((FALLIDAS + 1))
  fi
}

# ── Un `docker` de mentira con memoria ────────────────────────────────────
#
# Guarda un fichero por contenedor "existente" cuyo contenido son sus etiquetas.
# Asi el filtro por `label` del guion se puede comprobar de verdad, que es lo
# que separa "un contenedor mio de una prueba anterior" de "uno de alguien mas".
montar_docker() {
  local bin="$1"
  mkdir -p "$bin"
  cat > "$bin/docker" <<'EOF'
#!/bin/bash
echo "docker $*" >> "$SIM_DOCKER_REG"
sub="$1"; shift

case "$sub" in
  ps)
    nombre=""; etiqueta=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --filter)
          case "$2" in
            name=*)  nombre="${2#name=}" ;;
            label=*) etiqueta="${2#label=}" ;;
          esac
          shift 2 ;;
        *) shift ;;
      esac
    done
    nombre="${nombre#^/}"; nombre="${nombre%\$}"
    [ -n "$nombre" ] || exit 0
    [ -f "$SIM_DOCKER_DIR/$nombre" ] || exit 0
    if [ -n "$etiqueta" ] && ! grep -qxF "$etiqueta" "$SIM_DOCKER_DIR/$nombre"; then exit 0; fi
    echo "id-$nombre"
    ;;
  run)
    nombre=""; etiquetas=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --name)  nombre="$2"; shift 2 ;;
        --label) etiquetas="$etiquetas$2
"; shift 2 ;;
        -e|-p)   shift 2 ;;
        -d)      shift ;;
        *)       shift ;;
      esac
    done
    printf '%s' "$etiquetas" > "$SIM_DOCKER_DIR/$nombre"
    echo "id-$nombre"
    ;;
  rm)
    for arg in "$@"; do
      case "$arg" in
        -*) ;;
        *) rm -f "$SIM_DOCKER_DIR/$arg" ;;
      esac
    done
    ;;
  exec)
    [ "${1:-}" = "-i" ] && shift
    shift                      # el nombre del contenedor
    programa="${1:-}"
    case "$programa" in
      pg_isready) exit 0 ;;
      pg_restore)
        cat > /dev/null         # se traga el dump
        [ -f "$SIM_RESTORE_ERR" ] && cat "$SIM_RESTORE_ERR" >&2
        exit "${SIM_RESTORE_CODIGO:-0}" ;;
      psql)
        cat > /dev/null         # se traga el SQL
        [ "${SIM_PSQL_CAIDO:-0}" = "1" ] && { echo "psql: error: connection refused" >&2; exit 2; }
        cat "$SIM_RECUENTO"
        exit 0 ;;
    esac
    ;;
esac
exit 0
EOF
  chmod +x "$bin/docker"
}

# Un "respaldo" que pasa el filtro de tamano (mas de 10 KB) y no es nada mas.
montar_dump() {
  head -c 20000 /dev/zero | tr '\0' 'x' > "$1"
}

RECUENTO_BUENO="$TMP/recuento-bueno.txt"
cat > "$RECUENTO_BUENO" <<'EOF'
tablas | 72
usuarios | 19
tiendas | 4
kpis | 483
migraciones aplicadas | 61
EOF

RECUENTO_VACIO="$TMP/recuento-vacio.txt"
cat > "$RECUENTO_VACIO" <<'EOF'
tablas | 0
usuarios | 0
tiendas | 0
kpis | 0
migraciones aplicadas | 0
EOF

# ⚠️ Solo avisos inocuos de `--clean`, CON la linea de resumen que pg_restore
# escribe al final. Contarla como un error mas convertia una restauracion buena
# en un fallo inventado.
ERR_INOCUO="$TMP/err-inocuo.txt"
cat > "$ERR_INOCUO" <<'EOF'
pg_restore: error: could not execute query: ERROR:  table "Kpi" does not exist, skipping
pg_restore: error: could not execute query: ERROR:  table "User" does not exist, skipping
pg_restore: warning: errors ignored on restore: 2
EOF

ERR_REAL="$TMP/err-real.txt"
cat > "$ERR_REAL" <<'EOF'
pg_restore: error: could not execute query: ERROR:  table "Kpi" does not exist, skipping
pg_restore: error: could not execute query: ERROR:  permission denied for schema public
pg_restore: warning: errors ignored on restore: 2
EOF

ERR_LIMPIO="$TMP/err-limpio.txt"
: > "$ERR_LIMPIO"

ejecutar() {
  local etiqueta="$1"; shift
  local casa="$TMP/$etiqueta"
  mkdir -p "$casa/contenedores"
  local dump="$casa/respaldo.dump"
  montar_dump "$dump"
  env PATH="$TMP/bin:$PATH" \
      SIM_DOCKER_DIR="$casa/contenedores" \
      SIM_DOCKER_REG="$casa/docker.log" \
      SIM_RESTORE_ERR="$ERR_LIMPIO" \
      SIM_RECUENTO="$RECUENTO_BUENO" \
      RESTAURAR_CONTENEDOR="clarvex_sim" \
      "$@" bash "$GUION" "$dump" > "$casa/salida.txt" 2>&1
  echo $?
}

contar_en() {
  [ -f "$1" ] || { echo 0; return; }
  grep -c "$2" "$1" 2>/dev/null || true
}

montar_docker "$TMP/bin"

# ⚠️ Cordura primero: que el guion llegue de verdad a ejecutarse. La simulacion
# del despliegue dio diecisiete pasadas falsas con el guion muriendo en la
# primera linea, y todas las trampas de aqui son del mismo molde.
echo "== cordura =="
CODIGO=$(ejecutar cordura)
comprobar "no muere por un mandato inexistente" "0" "$(contar_en "$TMP/cordura/salida.txt" 'command not found')"
comprobar "llego a levantar el contenedor" "1" "$(contar_en "$TMP/cordura/docker.log" 'docker run')"
comprobar "llego a restaurar" "1" "$(contar_en "$TMP/cordura/docker.log" 'pg_restore')"
comprobar "llego a contar" "1" "$(contar_en "$TMP/cordura/docker.log" 'psql')"

echo
echo "== escenarios =="

# 1. Camino feliz.
CODIGO=$(ejecutar feliz)
comprobar "restauracion buena sale en 0" "0" "$CODIGO"
comprobar "y destruye el contenedor al salir" "0" "$(ls "$TMP/feliz/contenedores" | wc -l | tr -d ' ')"

# 2. ⚠️ Solo avisos inocuos: NO puede darse por fallida.
CODIGO=$(ejecutar inocuos SIM_RESTORE_ERR="$ERR_INOCUO" SIM_RESTORE_CODIGO=1)
comprobar "solo avisos de --clean sale en 0" "0" "$CODIGO"

# 3. ⚠️ Un error de verdad: antes se imprimia y se seguia como si nada.
CODIGO=$(ejecutar errorreal SIM_RESTORE_ERR="$ERR_REAL" SIM_RESTORE_CODIGO=1)
comprobar "un error real sale en 1" "1" "$CODIGO"
comprobar "y lo dice" "1" "$(contar_en "$TMP/errorreal/salida.txt" 'NO SE PUEDE DAR POR BUENO')"

# 4. ⚠️ Restaura "sin errores" sobre una base que queda VACIA.
CODIGO=$(ejecutar vacia SIM_RECUENTO="$RECUENTO_VACIO")
comprobar "base restaurada vacia sale en 1" "1" "$CODIGO"

# 5. psql no responde: tampoco se puede afirmar que sirva.
CODIGO=$(ejecutar psqlcaido SIM_PSQL_CAIDO=1)
comprobar "sin recuento sale en 1" "1" "$CODIGO"

# 6. ⚠️ Un contenedor AJENO con el mismo nombre: no se borra y se para.
mkdir -p "$TMP/ajeno/contenedores"
: > "$TMP/ajeno/contenedores/clarvex_sim"          # sin etiquetas: no es nuestro
montar_dump "$TMP/ajeno/respaldo.dump"
CODIGO=$(env PATH="$TMP/bin:$PATH" \
  SIM_DOCKER_DIR="$TMP/ajeno/contenedores" SIM_DOCKER_REG="$TMP/ajeno/docker.log" \
  SIM_RESTORE_ERR="$ERR_LIMPIO" SIM_RECUENTO="$RECUENTO_BUENO" \
  RESTAURAR_CONTENEDOR="clarvex_sim" \
  bash "$GUION" "$TMP/ajeno/respaldo.dump" > "$TMP/ajeno/salida.txt" 2>&1; echo $?)
comprobar "contenedor ajeno: se para" "1" "$CODIGO"
comprobar "contenedor ajeno: NO lo borra" "1" "$([ -f "$TMP/ajeno/contenedores/clarvex_sim" ] && echo 1 || echo 0)"
comprobar "contenedor ajeno: ni siquiera lo intenta" "0" "$(contar_en "$TMP/ajeno/docker.log" 'docker rm')"

# 7. Uno NUESTRO de una prueba anterior si se retira y la prueba sigue.
mkdir -p "$TMP/propio/contenedores"
printf 'clarvex-restauracion=1\n' > "$TMP/propio/contenedores/clarvex_sim"
montar_dump "$TMP/propio/respaldo.dump"
CODIGO=$(env PATH="$TMP/bin:$PATH" \
  SIM_DOCKER_DIR="$TMP/propio/contenedores" SIM_DOCKER_REG="$TMP/propio/docker.log" \
  SIM_RESTORE_ERR="$ERR_LIMPIO" SIM_RECUENTO="$RECUENTO_BUENO" \
  RESTAURAR_CONTENEDOR="clarvex_sim" \
  bash "$GUION" "$TMP/propio/respaldo.dump" > "$TMP/propio/salida.txt" 2>&1; echo $?)
comprobar "contenedor propio: se reemplaza y termina bien" "0" "$CODIGO"

# 8. Un archivo diminuto no es un respaldo: se para antes de tocar Docker.
mkdir -p "$TMP/pequeno/contenedores"
printf 'no soy un dump\n' > "$TMP/pequeno/respaldo.dump"
CODIGO=$(env PATH="$TMP/bin:$PATH" \
  SIM_DOCKER_DIR="$TMP/pequeno/contenedores" SIM_DOCKER_REG="$TMP/pequeno/docker.log" \
  SIM_RESTORE_ERR="$ERR_LIMPIO" SIM_RECUENTO="$RECUENTO_BUENO" \
  RESTAURAR_CONTENEDOR="clarvex_sim" \
  bash "$GUION" "$TMP/pequeno/respaldo.dump" > "$TMP/pequeno/salida.txt" 2>&1; echo $?)
comprobar "archivo diminuto sale en 1" "1" "$CODIGO"
comprobar "archivo diminuto no toca Docker" "0" "$(contar_en "$TMP/pequeno/docker.log" 'docker')"

echo
echo "  pasadas: $PASADAS   fallidas: $FALLIDAS"
if [ "$FALLIDAS" -ne 0 ] && [ "${SIM_VERBOSO:-0}" = "1" ]; then
  for salida in "$TMP"/*/salida.txt; do
    echo "--- $salida ---"; tail -15 "$salida"
  done
fi
[ "$FALLIDAS" -eq 0 ]
