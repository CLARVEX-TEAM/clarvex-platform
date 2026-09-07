/** Solo archivos privados caducados/excedentes del historial POS. No carga .env ni toca bases/red. */
import { posFailureStore } from "../lib/pos-failure-store";

posFailureStore().prune().then(() => {
  console.log("Historial POS: limpieza terminada.");
}).catch(() => {
  console.error("Historial POS: limpieza fallida. Revisar ruta privada, permisos, espacio y bloqueo de escritura.");
  process.exitCode = 1;
});
