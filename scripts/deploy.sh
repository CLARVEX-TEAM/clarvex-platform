#!/bin/bash
# Despliegue de Clarvex, con comprobación de salud y vuelta atrás.
#
# Lo invoca GitHub Actions por SSM (`aws ssm send-command`), y también sirve a
# mano: `bash scripts/deploy.sh`.
#
# ⚠️ **LA VUELTA ATRÁS CUBRE EL CÓDIGO, NO EL ESQUEMA.** Si el despliegue
# aplicó una migración, deshacer el commit NO deshace la migración. Por eso las
# migraciones de este proyecto son aditivas: una columna nueva que el código
# viejo ignora no rompe nada, pero un `DROP COLUMN` deja la versión anterior
# sin un campo que sí usa. Si una migración es destructiva, este script no te
# salva y hay que restaurar del respaldo.
#
# ⚠️ **NUNCA `rm -rf .next`.** Los chunks se sirven desde ahí en caliente:
# borrarlo tumba el sitio con 500 aunque PM2 siga «online», y si el build falla
# no hay a qué volver. `next build` reemplaza lo que tiene que reemplazar.
# Pasó de verdad el 24 de agosto de 2026: cuatro minutos de /login en 500.

set -euo pipefail

APP=/home/ubuntu/clarvex-app
SALUD=https://team.clarvex.tech/api/health
INTENTOS=12
ESPERA=5
OBJETIVO=${1:-}

if [ -n "$OBJETIVO" ] && ! [[ "$OBJETIVO" =~ ^[0-9a-f]{40}$ ]]; then
  echo "[deploy] SHA objetivo invalido: $OBJETIVO"
  exit 1
fi

cd "$APP"

# ── Punto al que volver ───────────────────────────────────────────────────
#
# Se guarda ANTES de tocar nada. Sin esto, si el build falla a mitad no hay
# forma de saber en qué commit estaba lo que sí funcionaba.
ANTES=$(git rev-parse HEAD)
echo "[deploy] commit actual: $ANTES"

# ── El ruido va a un archivo, no al registro del despliegue ───────────────
#
# ⚠️ **SSM corta la salida a ~24 000 caracteres.** `pnpm install` y
# `next build` la llenan solos, así que los mensajes de este script —qué hizo
# con la caché, cuánto disco quedaba, si aplicó una migración— se perdían por el
# camino y el registro de GitHub llegaba cortado a la mitad.
#
# Poner guardarraíles cuyo comportamiento no se puede ver es no ponerlos. Lo
# ruidoso se guarda entero en el servidor y aquí solo sale lo que se lee.
REGISTRO=/home/ubuntu/logs/deploy-$(date +%Y%m%d-%H%M%S).log
mkdir -p /home/ubuntu/logs

# Se conservan dos semanas. Sin esto, arreglar el disco creando archivos para
# siempre sería cambiar un problema por el mismo problema más tarde.
find /home/ubuntu/logs -name 'deploy-*.log' -mtime +14 -delete 2>/dev/null || true

# Ejecuta algo mandando su salida al archivo. Si falla, enseña la cola —que es
# donde está el error— y devuelve el fallo.
callado() {
  local que="$1"; shift
  echo "[deploy] $que…"
  if "$@" >>"$REGISTRO" 2>&1; then
    return 0
  fi
  echo "[deploy] ⚠️ falló: $que. Últimas líneas:"
  tail -n 25 "$REGISTRO" | sed 's/^/    /'
  return 1
}

comprobar_salud() {
  for i in $(seq 1 "$INTENTOS"); do
    if curl -sf --max-time 10 "$SALUD" | grep -q '"status":"ok"'; then
      echo "[deploy] salud OK (intento $i)"
      return 0
    fi
    sleep "$ESPERA"
  done
  return 1
}

volver_atras() {
  echo "[deploy] ⚠️ REVIRTIENDO a $ANTES"
  git reset --hard "$ANTES"
  callado "reinstalando la versión anterior" pnpm install --frozen-lockfile || true
  callado "regenerando Prisma" pnpm exec prisma generate || true
  callado "reconstruyendo la versión anterior" pnpm run build || true
  pm2 restart clarvex-team --update-env

  if comprobar_salud; then
    echo "[deploy] revertido y sano. La migración, si la hubo, NO se deshizo."
    exit 1
  fi

  # Si ni siquiera la versión anterior levanta, el problema no era el código.
  echo "[deploy] ⚠️ LA VERSIÓN ANTERIOR TAMPOCO RESPONDE."
  echo "[deploy] Mira 'pm2 logs clarvex-team' y el estado de Postgres."
  exit 2
}

# ── Traer el código ───────────────────────────────────────────────────────
echo "[deploy] trayendo cambios…"
git fetch origin main
MAIN_REMOTO=$(git rev-parse origin/main)

if [ -n "$OBJETIVO" ]; then
  # El workflow autoriza un commit concreto despues de que SU CI queda verde.
  # Si main avanzo mientras esperaba, se aborta: nunca se despliega a escondidas
  # un commit distinto ni se vuelve atras por una corrida vieja encolada.
  if [ "$OBJETIVO" != "$MAIN_REMOTO" ]; then
    echo "[deploy] main cambio durante la autorizacion."
    echo "[deploy] aprobado: $OBJETIVO"
    echo "[deploy] remoto:   $MAIN_REMOTO"
    echo "[deploy] se aborta; lanza otra corrida para el commit actual."
    exit 1
  fi

  if ! git cat-file -e "${OBJETIVO}^{commit}" 2>/dev/null; then
    echo "[deploy] el commit aprobado no existe despues del fetch: $OBJETIVO"
    exit 1
  fi

  DESPUES=$OBJETIVO
else
  # Conserva el uso manual historico: sin argumento despliega origin/main.
  DESPUES=$MAIN_REMOTO
fi

if [ "$ANTES" = "$DESPUES" ]; then
  echo "[deploy] ya estaba en $DESPUES. Nada que hacer."
  exit 0
fi

git merge --ff-only origin/main

# ── Dependencias y cliente ────────────────────────────────────────────────
#
# `--frozen-lockfile` a propósito: si el lockfile no cuadra con package.json,
# se para en vez de resolver por su cuenta un árbol distinto al que se probó.
if ! callado "instalando dependencias" pnpm install --frozen-lockfile    || ! callado "generando el cliente de Prisma" pnpm exec prisma generate; then
  # Nada se ha construido ni reiniciado: producción sigue con la versión
  # anterior. Se devuelve el árbol ahí para que no quede en un commit que
  # nunca llegó a ejecutarse.
  git reset --hard "$ANTES"
  exit 1
fi

# ── Migraciones ───────────────────────────────────────────────────────────
#
# ⚠️ **SIEMPRE, sin preguntar antes si hacen falta.** La versión anterior lo
# condicionaba a `prisma migrate status | grep -q "have not yet been applied"`,
# y eso NO funcionaba: `migrate status` **sale con código 1 cuando hay
# migraciones pendientes** —es su forma de avisar— y con `set -o pipefail` ese
# 1 se impone al resultado del `grep`. El `if` daba falso justo en el único
# caso en que tenía que dar verdadero.
#
# Se comió la migración `count_presence` el 3 de septiembre de 2026 y el
# despliegue reportó **éxito**: el código quedó arriba consultando una tabla
# que no existía. Un fallo que se anuncia como acierto es el peor de todos.
#
# `migrate deploy` ya es idempotente: sin nada pendiente dice «No pending
# migrations to apply» y sale en 0. La optimización no ahorraba nada y costaba
# esto.
echo "[deploy] aplicando migraciones pendientes, si las hay…"

if ! SALIDA_MIGRACION=$(pnpm exec prisma migrate deploy 2>&1); then
  echo "$SALIDA_MIGRACION"
  # No se reinicia nada: sigue corriendo la versión anterior, que es coherente
  # con el esquema que hay. Se devuelve el árbol a donde estaba para que no
  # quede en un commit que nunca llegó a ejecutarse.
  echo "[deploy] la migración falló. NO se construye ni se reinicia."
  git reset --hard "$ANTES"
  exit 1
fi

echo "$SALIDA_MIGRACION"

if echo "$SALIDA_MIGRACION" | grep -q "No pending migrations"; then
  MIGRO=0
else
  MIGRO=1
fi

# ── La caché de webpack, que crece sin freno ──────────────────────────────
#
# ⚠️ Cada build le AÑADE y nada le quita. El 3 de septiembre de 2026 llegó a
# **2.7 GB** y dejó el disco al 87 %, con la alerta avisando de lo que de verdad
# importa: con el disco lleno Postgres deja de escribir, y entonces la tienda no
# puede capturar.
#
# ⚠️ **Esto NO es borrar `.next`** —eso tumba el sitio, ver el aviso de arriba—.
# Es solo `.next/cache/webpack`, que se usa **al construir** y no se sirve a
# nadie: lo que ve la tienda está en `.next/static` y `.next/server`. Borrarla
# solo hace el siguiente build más lento.
#
# Con tope y no siempre: la caché es lo que hace que un build incremental tarde
# minutos en vez de muchos más, y esta máquina va justa de RAM.
#
# ⚠️ **Los números salen de medir, no de suponer.** Un solo build genera ~1.6 GB
# de caché. Un tope de 1 GB —que fue lo primero que puse— la borraría antes de
# CADA build: la caché no llegaría a servir nunca y todos los despliegues serían
# lentos. Por eso el techo va en 4 GB, que da para varios despliegues seguidos.
#
# Y hay una segunda condición, porque el techo por tamaño no conoce el disco: si
# queda poco espacio se limpia igual, aunque la caché no haya llegado al tope.
CACHE_WEBPACK=.next/cache/webpack
LIBRE_MB=$(df -Pm . | tail -1 | awk '{print $4}')
echo "[deploy] disco libre: ${LIBRE_MB} MB"

if [ -d "$CACHE_WEBPACK" ]; then
  CACHE_MB=$(du -sm "$CACHE_WEBPACK" 2>/dev/null | cut -f1)
  if [ "${CACHE_MB:-0}" -gt 4096 ] || [ "${LIBRE_MB:-0}" -lt 5120 ]; then
    echo "[deploy] caché de webpack: ${CACHE_MB:-0} MB con ${LIBRE_MB} MB libres; se limpia"
    rm -rf "$CACHE_WEBPACK"
    LIBRE_MB=$(df -Pm . | tail -1 | awk '{print $4}')
    echo "[deploy] disco libre tras limpiar: ${LIBRE_MB} MB"
  else
    echo "[deploy] caché de webpack: ${CACHE_MB:-0} MB, se conserva"
  fi
fi
if [ "${LIBRE_MB:-0}" -lt 2048 ]; then
  echo "[deploy] ⚠️ MENOS DE 2 GB LIBRES. El build necesita espacio y Postgres"
  echo "[deploy]    deja de escribir con el disco lleno. Se para antes de tocar nada."
  git reset --hard "$ANTES"
  exit 1
fi

# ── Construir ─────────────────────────────────────────────────────────────
#
# Si el build falla no se reinicia nada: la versión que está corriendo sigue
# viva y sirviendo. Es el mejor momento posible para fallar.
if ! callado "construyendo" pnpm run build; then
  echo "[deploy] el build falló. NO se reinicia; sigue corriendo la versión anterior."
  git reset --hard "$ANTES"
  exit 1
fi

# ── Reiniciar y comprobar ─────────────────────────────────────────────────
pm2 restart clarvex-team --update-env

if ! comprobar_salud; then
  echo "[deploy] la versión nueva no responde sana."
  volver_atras
fi

echo "[deploy] ✅ desplegado $DESPUES"
echo "[deploy] detalle completo en $REGISTRO"
[ "$MIGRO" = "1" ] && echo "[deploy] ⚠️ se aplicó una migración: una vuelta atrás del código NO la deshace."
pm2 list | grep clarvex || true
exit 0
