import * as Sentry from "@sentry/nextjs";
import { registerOTel } from "@vercel/otel";
import { OTLPHttpJsonTraceExporter } from "@vercel/otel";

/**
 * Hook de instrumentación de Next.js.
 *
 * ⚠️ **Las trazas van al COLECTOR de la máquina, no a un servicio.** Salen por
 * `127.0.0.1:4318`, que es el colector de OpenTelemetry que ya corre aquí y las
 * reparte a donde toque. Tres motivos, y ninguno es comodidad:
 *
 *   - **La app no lleva ninguna credencial.** Las claves de Grafana y de SigNoz
 *     viven en el `.env` del colector; el código de la app no las ve ni las
 *     necesita, así que cambiar de destino no toca el despliegue.
 *   - **Si el destino no contesta, el colector encola.** Exportando directo, un
 *     corte de red se lo comería el proceso de Next, que es el que atiende a la
 *     tienda.
 *   - **Y se cambia de proveedor sin desplegar la app.** Es lo que permite
 *     tener SigNoz y Grafana a la vez hoy y apagar uno mañana.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    /*
     * ⚠️ El colector solo existe en el SERVIDOR, así que un build o una máquina
     * de desarrollo sin él no deben intentar exportar: el SDK reintentaría
     * contra un puerto cerrado en cada petición. Se activa con una variable, no
     * por omisión -- la misma regla que `BEDROCK_USE_INSTANCE_ROLE`, que este
     * proyecto ya escribió: el comportamiento caro se PIDE, no se deduce.
     */
    const destino = process.env.OTEL_COLECTOR_URL;
    if (destino) {
      registerOTel({
        serviceName: "clarvex-app",
        traceExporter: new OTLPHttpJsonTraceExporter({ url: `${destino}/v1/traces` }),
      });
    }

    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/**
 * Errores no manejados de route handlers y server components.
 *
 * ⚠️ Sigue en Sentry A PROPÓSITO mientras las trazas se asientan. El orden es
 * el mismo que con cualquier corte de este proyecto: lo nuevo se verifica
 * recibiendo antes de retirar lo viejo. Quitarlo antes deja producción ciega, y
 * esta app ya ha pagado caro no enterarse de las cosas.
 */
export const onRequestError = Sentry.captureRequestError;
