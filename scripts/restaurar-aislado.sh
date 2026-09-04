#!/bin/bash
# Restaura un respaldo en una base AISLADA, para comprobar que sirve.
#
# ⚠️ **NO restaura sobre producción y no puede hacerlo.** Levanta un contenedor
# de Postgres aparte, con su propio puerto y su propio volumen efímero, y
# restaura ahí. Al terminar lo destruye.
#
# Por qué existe: un respaldo que nunca se ha restaurado no es un respaldo, es
# un fichero. Lo que falla el día que hace falta —un dump truncado, una versión
# de Postgres incompatible, un `pg_restore` que necesita un rol que no existe—
# no se descubre mirando el tamaño del archivo.
#
#   bash scripts/restaurar-aislado.sh <archivo.dump>
#
# ⚠️ El guion NO descarga nada de R2 ni de S3: se le pasa un dump que ya se tenga
# a mano. Bajarlo es una decisión aparte, y las credenciales de lectura no
# tienen por qué estar donde corre esto.

set -euo pipefail

DUMP="${1:-}"
PUERTO="${RESTAURAR_PUERTO:-55432}"
CONTENEDOR="${RESTAURAR_CONTENEDOR:-clarvex_restaurar_prueba}"
IMAGEN="${RESTAURAR_IMAGEN:-postgres:16}"
BASE="clarvex_prueba"
USUARIO="clarvex"
CLAVE="prueba-local-sin-valor"

log() { echo "[restaurar] $*"; }
fatal() { echo "[restaurar] ⚠️ $*" >&2; exit 1; }

[ -n "$DUMP" ] || fatal "Falta el archivo: bash $0 <archivo.dump>"
[ -f "$DUMP" ] || fatal "No existe $DUMP"

# ⚠️ Un dump de unos pocos bytes suele ser un mensaje de error guardado como si
# fuera un respaldo. Se comprueba antes de montar nada.
TAM=$(wc -c < "$DUMP")
[ "$TAM" -gt 10240 ] || fatal "El archivo pesa $TAM bytes. Eso no es un respaldo."
log "archivo: $DUMP ($((TAM / 1048576)) MB)"

command -v docker >/dev/null || fatal "Hace falta docker."

limpiar() {
  log "destruyendo el contenedor de prueba"
  docker rm -f "$CONTENEDOR" >/dev/null 2>&1 || true
}
trap limpiar EXIT

# ⚠️ Si ya existe uno con ese nombre se destruye ANTES, no se reutiliza: una
# base con datos de una prueba anterior daría un resultado que no significa nada.
docker rm -f "$CONTENEDOR" >/dev/null 2>&1 || true

log "levantando $IMAGEN en el puerto $PUERTO (efímero, sin volumen)"
docker run -d --name "$CONTENEDOR" \
  -e POSTGRES_USER="$USUARIO" \
  -e POSTGRES_PASSWORD="$CLAVE" \
  -e POSTGRES_DB="$BASE" \
  -p "127.0.0.1:$PUERTO:5432" \
  "$IMAGEN" >/dev/null

log "esperando a que acepte conexiones…"
for intento in $(seq 1 30); do
  if docker exec "$CONTENEDOR" pg_isready -U "$USUARIO" -d "$BASE" >/dev/null 2>&1; then
    log "listo (intento $intento)"
    break
  fi
  [ "$intento" -eq 30 ] && fatal "Postgres no arrancó en 30 intentos."
  sleep 1
done

log "restaurando…"
# ⚠️ `-U clarvex` no es opcional: el rol `postgres` no existe en esta imagen tal
# como la usa el proyecto, y sin el usuario correcto `pg_restore` falla con un
# mensaje que manda a buscar donde no está el problema.
if ! docker exec -i "$CONTENEDOR" pg_restore -U "$USUARIO" -d "$BASE" --clean --if-exists < "$DUMP" 2>"/tmp/restaurar-$$.log"; then
  log "pg_restore reportó errores. Últimas líneas:"
  tail -15 "/tmp/restaurar-$$.log" | sed 's/^/    /'
  log ""
  log "⚠️ Algunos avisos de pg_restore son normales con --clean (objetos que no"
  log "   existían). Lo que importa es el recuento de abajo."
fi
rm -f "/tmp/restaurar-$$.log"

# ── Lo que de verdad dice si el respaldo sirve ────────────────────────────
#
# No el código de salida de `pg_restore`, que avisa de cosas inocuas: cuántas
# filas hay en las tablas que importan.
log ""
log "=== recuento en la base restaurada ==="
docker exec -i "$CONTENEDOR" psql -U "$USUARIO" -d "$BASE" -t -A -F' | ' <<'SQL'
SELECT 'tablas', count(*)::text FROM information_schema.tables WHERE table_schema = 'public'
UNION ALL SELECT 'usuarios', count(*)::text FROM "User"
UNION ALL SELECT 'tiendas', count(*)::text FROM "Store"
UNION ALL SELECT 'kpis', count(*)::text FROM "Kpi"
UNION ALL SELECT 'migraciones aplicadas', count(*)::text FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;
SQL

log ""
log "Si los recuentos cuadran con producción, el respaldo sirve."
log "El contenedor se destruye al salir; no queda nada."
