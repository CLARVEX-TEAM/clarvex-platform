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

# ── Migraciones, solo si hay alguna nueva ─────────────────────────────────
if pnpm exec prisma migrate status 2>&1 | grep -q "have not yet been applied"; then
  echo "[deploy] hay migraciones pendientes; aplicando"
  pnpm exec prisma migrate deploy
  MIGRO=1
else
  echo "[deploy] sin migraciones pendientes"
  MIGRO=0
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
