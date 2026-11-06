#!/bin/bash
# Verifica un dump en PostgreSQL efímero sin red. No descarga respaldos.
# Uso: bash scripts/restaurar-aislado.sh <archivo.dump>
# Solo se retira el ID creado por ESTA ejecución, incluidos sus volúmenes.
set -euo pipefail
DUMP="${1:-}"
CONTENEDOR="${RESTAURAR_CONTENEDOR:-clarvex-restaurar-$(date +%s)-$$}"
IMAGEN="${RESTAURAR_IMAGEN:-postgres:16}"
BASE="clarvex_prueba"
USUARIO="clarvex"
CLAVE="prueba-local-sin-valor"
ID_CREADO=""
log() { echo "[restaurar] $*"; }
fatal() { echo "[restaurar] $*" >&2; exit 1; }
limpiar() {
  if [ -n "$ID_CREADO" ]; then
    docker rm -fv "$ID_CREADO" >/dev/null 2>&1 || log "No se pudo retirar el contenedor propio $ID_CREADO"
  fi
}
trap limpiar EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
[ -n "$DUMP" ] && [ -f "$DUMP" ] || fatal "Falta un archivo de respaldo válido."
TAM=$(wc -c < "$DUMP")
[ "$TAM" -gt 10240 ] || fatal "El archivo pesa $TAM bytes; no se restaura."
command -v docker >/dev/null || fatal "Hace falta docker."
# No reutiliza ni borra contenedores existentes, aunque lleven nuestra etiqueta.
# Docker reserva el nombre de forma atómica. Si create falla, no hay nada propio.
log "creando PostgreSQL aislado, sin puertos publicados ni acceso a la red"
if ! NUEVO_ID=$(docker create --name "$CONTENEDOR" --network none \
  --label clarvex-restauracion=1 \
  -e POSTGRES_USER="$USUARIO" -e POSTGRES_PASSWORD="$CLAVE" -e POSTGRES_DB="$BASE" \
  "$IMAGEN"); then
  fatal "No se pudo crear el contenedor. Si el nombre está ocupado, usa otro; no se borra el existente."
fi
[[ "$NUEVO_ID" =~ ^[a-f0-9]{64}$ ]] || fatal "Docker no devolvió un ID válido; no se elimina ningún contenedor por nombre."
ID_CREADO="$NUEVO_ID"
docker start "$ID_CREADO" >/dev/null
# Por TCP y no por socket: la imagen arranca primero un servidor TEMPORAL que solo
# escucha en el socket, crea la base y lo reinicia. Por socket, pg_isready dice
# «listo» ante ese temporal, antes de que exista $BASE.
for intento in $(seq 1 60); do
  if docker exec "$ID_CREADO" pg_isready -h 127.0.0.1 -U "$USUARIO" -d "$BASE" >/dev/null 2>&1; then break; fi
  [ "$intento" -eq 60 ] && fatal "Postgres no arrancó."
  sleep 1
done
# Cualquier salida no cero invalida la restauración, aunque no haya texto de error
# (OOM, desconexión de Docker o señal). No se aceptan datos parciales.
# Los propietarios y ACL originales no existen en el entorno sintético.
if ! docker exec -i "$ID_CREADO" pg_restore -U "$USUARIO" -d "$BASE" \
  --clean --if-exists --no-owner --no-privileges --exit-on-error --single-transaction < "$DUMP"; then
  fatal "La restauración falló; este respaldo NO se puede dar por bueno."
fi
if ! RECUENTO=$(docker exec -i "$ID_CREADO" psql -X -v ON_ERROR_STOP=1 -U "$USUARIO" -d "$BASE" -t -A -F'|' <<'SQL'
SELECT 'tablas', count(*)::text FROM information_schema.tables WHERE table_schema = 'public'
UNION ALL SELECT 'usuarios', count(*)::text FROM "User"
UNION ALL SELECT 'tiendas', count(*)::text FROM "Store"
UNION ALL SELECT 'kpis', count(*)::text FROM "Kpi"
UNION ALL SELECT 'migraciones', count(*)::text FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;
SQL
); then
  fatal "No se pudo verificar la base restaurada."
fi
for clave in tablas usuarios tiendas; do
  VALOR=$(echo "$RECUENTO" | awk -F'|' -v clave="$clave" '$1 == clave { print $2 }')
  [[ "$VALOR" =~ ^[0-9]+$ ]] && [ "$VALOR" -gt 0 ] || fatal "Recuento inválido o vacío: $clave."
done
echo "$RECUENTO"
log "Restauración íntegra y recuentos básicos válidos. La validación funcional adicional sigue siendo necesaria."
