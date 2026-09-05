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
# Sale en 0 solo si la restauración se puede dar por buena. Cualquier error real
# de `pg_restore`, o una base restaurada vacía, sale en 1.
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
# ⚠️ La marca con la que este guion reconoce SUS contenedores. Sin ella, «el de
# la prueba anterior» y «uno de alguien más que se llama igual» son la misma
# cosa vistos desde aquí.
ETIQUETA="clarvex-restauracion=1"
CREADO=0

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

REGISTRO_RESTAURA=""

# ⚠️ **Solo destruye lo que este guion creó.** Antes borraba por nombre pase lo
# que pase: si alguien tenía un contenedor llamado igual —o `RESTAURAR_CONTENEDOR`
# venía apuntando a otro— se lo llevaba por delante, y encima al SALIR, aunque
# el guion no hubiera llegado a levantar nada.
limpiar() {
  if [ -n "$REGISTRO_RESTAURA" ]; then rm -f "$REGISTRO_RESTAURA"; fi
  if [ "$CREADO" = "1" ]; then
    log "destruyendo el contenedor de prueba"
    docker rm -f "$CONTENEDOR" >/dev/null 2>&1 || true
  fi
  return 0
}
trap limpiar EXIT

# ⚠️ Un contenedor con ese nombre de una prueba anterior sí se retira: una base
# con datos viejos daría un resultado que no significa nada. Pero se comprueba
# antes que lleve NUESTRA etiqueta. Uno ajeno detiene el guion; forzarlo es una
# decisión escrita, no el valor por omisión.
EXISTENTE=$(docker ps -aq --filter "name=^/${CONTENEDOR}$" 2>/dev/null || true)
if [ -n "$EXISTENTE" ]; then
  NUESTRO=$(docker ps -aq --filter "name=^/${CONTENEDOR}$" --filter "label=$ETIQUETA" 2>/dev/null || true)
  if [ -z "$NUESTRO" ] && [ "${RESTAURAR_FORZAR:-0}" != "1" ]; then
    fatal "Ya existe un contenedor '$CONTENEDOR' que NO creó este guion. No se borra nada. Usa RESTAURAR_CONTENEDOR con otro nombre, o RESTAURAR_FORZAR=1 si de verdad es desechable."
  fi
  log "retirando el contenedor de una prueba anterior"
  docker rm -f "$CONTENEDOR" >/dev/null 2>&1 || true
fi

log "levantando $IMAGEN en el puerto $PUERTO (efímero, sin volumen)"
CREADO=1
docker run -d --name "$CONTENEDOR" \
  --label "$ETIQUETA" \
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
REGISTRO_RESTAURA=$(mktemp)
# ⚠️ `-U clarvex` no es opcional: el rol `postgres` no existe en esta imagen tal
# como la usa el proyecto, y sin el usuario correcto `pg_restore` falla con un
# mensaje que manda a buscar donde no está el problema.
if ! docker exec -i "$CONTENEDOR" pg_restore -U "$USUARIO" -d "$BASE" --clean --if-exists < "$DUMP" 2>"$REGISTRO_RESTAURA"; then
  log "pg_restore salió con error. Últimas líneas:"
  tail -15 "$REGISTRO_RESTAURA" | sed 's/^/    /'
fi

# ⚠️ **Los errores se CUENTAN, no se ojean.** Antes se imprimían quince líneas y
# el guion seguía como si nada, así que una restauración a medias --la mitad de
# las tablas dentro-- terminaba igual que una buena. Con `--if-exists` los DROP
# ya no fallan por no encontrar el objeto, así que lo que quede aquí es un error
# de verdad; el filtro del molde antiguo se conserva por si el dump viene de una
# versión que todavía los emitía.
#
# ⚠️ Solo las líneas `error:`. La última línea de pg_restore es
# «warning: errors ignored on restore: N», un RESUMEN de las anteriores:
# contarla sumaba uno de más y convertía una restauración con solo avisos
# inocuos en un fallo inventado. Lo vio la prueba de abajo, no el ojo.
CUENTAS=$(awk '
  /pg_restore: error:/ { total++; if ($0 ~ /does not exist, skipping/) benignos++ }
  END { printf "%d %d", total + 0, benignos + 0 }
' "$REGISTRO_RESTAURA")
TOTAL_AVISOS="${CUENTAS%% *}"
BENIGNOS="${CUENTAS##* }"
REALES=$((TOTAL_AVISOS - BENIGNOS))
log "avisos de pg_restore: $TOTAL_AVISOS (inocuos por --clean: $BENIGNOS)"

# ── Lo que de verdad dice si el respaldo sirve ────────────────────────────
#
# No solo el código de salida de `pg_restore`: cuántas filas hay en las tablas
# que importan. Un dump que restaura «sin errores» sobre una base vacía también
# sale en 0.
log ""
log "=== recuento en la base restaurada ==="
RECUENTO=$(docker exec -i "$CONTENEDOR" psql -U "$USUARIO" -d "$BASE" -t -A -F' | ' <<'SQL' || true
SELECT 'tablas', count(*)::text FROM information_schema.tables WHERE table_schema = 'public'
UNION ALL SELECT 'usuarios', count(*)::text FROM "User"
UNION ALL SELECT 'tiendas', count(*)::text FROM "Store"
UNION ALL SELECT 'kpis', count(*)::text FROM "Kpi"
UNION ALL SELECT 'migraciones aplicadas', count(*)::text FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;
SQL
)
echo "$RECUENTO" | sed 's/^/    /'

# Solo dígitos: si psql no pudo responder, el valor queda vacío y cuenta como
# cero, que es justo lo que hace saltar la comprobación de abajo.
#
# ⚠️ El separador va como `[|]` y no como `\|`. En una expresión regular de awk,
# `\|` no es un escape estándar: gawk avisa y lo trata como un `|` pelado, o sea
# una ALTERNANCIA, así que el separador pasaba a ser «un espacio» y el valor
# leído era la propia barra. Con el corchete no hay ambigüedad.
valor() { echo "$RECUENTO" | awk -F' [|] ' -v clave="$1" '$1 == clave { print $2 }' | tr -cd '0-9'; }
TABLAS=$(valor tablas)
USUARIOS=$(valor usuarios)
TIENDAS=$(valor tiendas)

PROBLEMAS=0
if [ "$REALES" -gt 0 ]; then
  log ""
  log "⚠️ $REALES error(es) de pg_restore que NO son los inocuos de --clean."
  PROBLEMAS=1
fi
if [ "${TABLAS:-0}" -lt 1 ] || [ "${USUARIOS:-0}" -lt 1 ] || [ "${TIENDAS:-0}" -lt 1 ]; then
  log ""
  log "⚠️ La base restaurada no tiene tablas, usuarios o tiendas. Eso no es un respaldo usable."
  PROBLEMAS=1
fi

log ""
if [ "$PROBLEMAS" != "0" ]; then
  log "⚠️ ESTE RESPALDO NO SE PUEDE DAR POR BUENO. El contenedor se destruye igual."
  exit 1
fi

log "✅ restauración completa y con datos dentro."
log "Comprueba además que los recuentos cuadren con producción."
log "El contenedor se destruye al salir; no queda nada."
