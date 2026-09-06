#!/bin/bash
# Dobles locales: nunca llama a Docker ni usa un respaldo real.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
GUION="${SIM_GUION:-$RAIZ/scripts/restaurar-aislado.sh}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"
cat > "$TMP/bin/docker" <<'EOF'
#!/bin/bash
set -eu
echo "$*" >> "$SIM_CASA/log"
ID=$(printf 'a%.0s' {1..64})
case "$1" in
  create)
    if [ "${SIM_COLISION:-0}" = 1 ] || [ -f "$SIM_CASA/ajeno" ]; then
      echo ajeno > "$SIM_CASA/ajeno"
      exit 125
    fi
    echo propio > "$SIM_CASA/$ID"
    echo "$ID" ;;
  start) [ "${SIM_START_FALLA:-0}" = 0 ] ;;
  rm)
    # Borrar por nombre eliminaría el recurso ajeno y haría fallar la prueba.
    if [ "$3" = clarvex_sim ]; then rm -f "$SIM_CASA/ajeno"; fi
    rm -f "$SIM_CASA/$3" ;;
  exec)
    case "$*" in
      *pg_isready*) exit 0 ;;
      *pg_restore*) cat >/dev/null; exit "${SIM_RESTORE_CODIGO:-0}" ;;
      *psql*)
        cat >/dev/null
        [ "${SIM_PSQL_FALLA:-0}" = 0 ] || exit 2
        echo "tablas|72"
        echo "usuarios|${SIM_USUARIOS:-19}"
        echo "tiendas|4"
        echo "kpis|483"
        echo "migraciones|61" ;;
    esac ;;
esac
EOF
chmod +x "$TMP/bin/docker"
head -c 20000 /dev/zero > "$TMP/prueba.dump"
PASADAS=0; FALLIDAS=0
comprobar() {
  if [ "$2" = "$3" ]; then echo "ok $1"; PASADAS=$((PASADAS+1));
  else echo "FALLA $1 esperado=$2 real=$3"; FALLIDAS=$((FALLIDAS+1)); fi
}
ejecutar() {
  CASA="$TMP/$1"; shift; mkdir -p "$CASA"
  CODIGO=0
  env PATH="$TMP/bin:$PATH" SIM_CASA="$CASA" RESTAURAR_CONTENEDOR=clarvex_sim "$@" \
    bash "$GUION" "$TMP/prueba.dump" > "$CASA/salida" 2>&1 || CODIGO=$?
}
contar() { grep -c "$2" "$1" || true; }
ejecutar feliz
comprobar "restauración completa" 0 "$CODIGO"
comprobar "ejecutó pg_restore" 1 "$(contar "$CASA/log" pg_restore)"
comprobar "verificó recuentos" 1 "$(contar "$CASA/log" psql)"
comprobar "sin red" 1 "$(contar "$CASA/log" '\-\-network none')"
comprobar "restauración transaccional" 1 "$(contar "$CASA/log" '\-\-single-transaction')"
comprobar "retira volumen propio" 1 "$(contar "$CASA/log" '^rm -fv a')"
for codigo in 1 125 137 143; do
  ejecutar "fallo-$codigo" SIM_RESTORE_CODIGO="$codigo"
  comprobar "rechaza salida $codigo sin texto de error" 1 "$CODIGO"
  comprobar "no valida una restauración fallida ($codigo)" 0 "$(contar "$CASA/log" psql)"
done
ejecutar colision SIM_COLISION=1
comprobar "colisión rechazada" 1 "$CODIGO"
comprobar "no intenta borrar tras create fallido" 0 "$(contar "$CASA/log" '^rm ')"
comprobar "conserva contenedor ajeno" 1 "$([ -f "$CASA/ajeno" ] && echo 1 || echo 0)"
mkdir -p "$TMP/preexistente"; echo 'clarvex-restauracion=1' > "$TMP/preexistente/ajeno"
ejecutar preexistente
comprobar "tampoco reutiliza otra restauración en marcha" 1 "$CODIGO"
comprobar "no borra una restauración anterior" 1 "$([ -f "$CASA/ajeno" ] && echo 1 || echo 0)"
ejecutar arranque SIM_START_FALLA=1
comprobar "fallo de arranque" 1 "$CODIGO"
comprobar "limpia ID creado aun si start falla" 1 "$(contar "$CASA/log" '^rm -fv a')"
ejecutar recuento SIM_PSQL_FALLA=1
comprobar "rechaza fallo de psql" 1 "$CODIGO"
ejecutar vacio SIM_USUARIOS=0
comprobar "rechaza base vacía" 1 "$CODIGO"
echo "pasadas: $PASADAS fallidas: $FALLIDAS"
[ "$FALLIDAS" -eq 0 ]
