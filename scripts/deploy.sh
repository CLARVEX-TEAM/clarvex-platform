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

cd "$APP"

# ── Punto al que volver ───────────────────────────────────────────────────
#
# Se guarda ANTES de tocar nada. Sin esto, si el build falla a mitad no hay
# forma de saber en qué commit estaba lo que sí funcionaba.
ANTES=$(git rev-parse HEAD)
echo "[deploy] commit actual: $ANTES"

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
  pnpm install --frozen-lockfile
  pnpm exec prisma generate
  pnpm run build
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
DESPUES=$(git rev-parse origin/main)

if [ "$ANTES" = "$DESPUES" ]; then
  echo "[deploy] ya estaba en $DESPUES. Nada que hacer."
  exit 0
fi

git merge --ff-only origin/main

# ── Dependencias y cliente ────────────────────────────────────────────────
#
# `--frozen-lockfile` a propósito: si el lockfile no cuadra con package.json,
# se para en vez de resolver por su cuenta un árbol distinto al que se probó.
pnpm install --frozen-lockfile
pnpm exec prisma generate

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
# minutos en vez de muchos más, y esta máquina va justa. Un giga de margen deja
# que cumpla su función y le pone techo.
CACHE_WEBPACK=.next/cache/webpack
if [ -d "$CACHE_WEBPACK" ]; then
  CACHE_MB=$(du -sm "$CACHE_WEBPACK" 2>/dev/null | cut -f1)
  if [ "${CACHE_MB:-0}" -gt 1024 ]; then
    echo "[deploy] la caché de webpack va por ${CACHE_MB} MB; se limpia antes de construir"
    rm -rf "$CACHE_WEBPACK"
  else
    echo "[deploy] caché de webpack: ${CACHE_MB:-0} MB, dentro de lo razonable"
  fi
fi

# Y un vistazo al disco, que es lo que de verdad puede parar la tienda.
LIBRE_MB=$(df -Pm . | tail -1 | awk '{print $4}')
echo "[deploy] disco libre: ${LIBRE_MB} MB"
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
if ! pnpm run build; then
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
[ "$MIGRO" = "1" ] && echo "[deploy] ⚠️ se aplicó una migración: una vuelta atrás del código NO la deshace."
pm2 list | grep clarvex || true
exit 0
