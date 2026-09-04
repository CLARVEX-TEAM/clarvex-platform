// Configuración de PM2 para producción.
//
// exec_mode: "cluster" con 2 instancias permite `pm2 reload` SIN CAÍDA: PM2
// levanta la instancia nueva, espera a que esté escuchando y solo entonces tira
// la vieja, una por una. Así siempre hay al menos una sirviendo y Nginx nunca
// devuelve 502 durante un deploy.
//
// Es seguro correr en cluster porque la app no guarda estado crítico en memoria:
// las sesiones son JWT (sin estado) y el rate limiting está respaldado en
// Postgres a propósito (ver lib/rate-limit.ts), así que funciona entre procesos.
//
// ⚠️ Dos instancias usan ~el doble de RAM. Revisa `free -h` en el VPS antes de
// migrar: si va justo (Postgres + n8n + Uptime Kuma + etc. ya cargan el server),
// baja a `instances: 1` — con 1 sola, `reload` deja de ser sin-caída, pero al
// menos el resto queda parametrizado.
const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "clarvex-team",
      /*
       * ⚠️ **Rutas ABSOLUTAS derivadas de este archivo, no relativas.**
       *
       * Sin esto, PM2 resuelve las rutas contra el directorio desde el que se
       * arrancó, que hoy es `/home/ubuntu/clarvex-app` por costumbre y nada
       * más. Con despliegues por versiones cada una vive en su propio
       * directorio, y `pm2 reload <version>/ecosystem.config.cjs` tiene que
       * levantar ESA versión, no la que estuviera activa cuando alguien corrió
       * `pm2 start` hace meses.
       *
       * `__dirname` es el directorio de este archivo, así que cada copia apunta
       * a la suya. En la instalación actual da exactamente la misma ruta que
       * antes: el cambio no altera el comportamiento vigente.
       *
       * Se evita a propósito el enlace `actual`: PM2 guarda la ruta que
       * resolvió, así que apuntar al enlace deja la duda de si al recargar
       * sigue la vieja. Una ruta concreta no tiene esa duda.
       */
      cwd: __dirname,
      // Se apunta al binario de Next (un script de Node) para que PM2 lo pueda
      // clonar en modo cluster. `pnpm start`/`npm start` NO sirve en cluster.
      script: path.join(__dirname, "node_modules/next/dist/bin/next"),
      args: "start",
      interpreter: "node",
      exec_mode: "cluster",
      instances: 2,
      // Un fuga de memoria no tumba las dos a la vez: PM2 recicla la que se pase.
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
