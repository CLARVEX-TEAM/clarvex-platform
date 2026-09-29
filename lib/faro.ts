import { TransportItemType, getWebInstrumentations, initializeFaro } from "@grafana/faro-web-sdk";
import type { ExceptionEvent } from "@grafana/faro-web-sdk";
import { humanizeError } from "@/lib/sentry-humanize";

/**
 * Errores del navegador a Grafana Cloud.
 *
 * Sustituye a la mitad de cliente de Sentry. La del servidor ya la cubren las
 * trazas de OpenTelemetry; esto es lo que faltaba para poder retirarlo entero.
 *
 * ⚠️ **La URL del colector NO es un secreto** y por eso va en el código. Viaja
 * dentro del JavaScript que descarga cualquiera que abra la app, así que
 * esconderla en el `.env` daría una falsa sensación de resguardo. Lo que la
 * protege es el `Allowed origins` de Grafana, que solo acepta lo que llega
 * desde `team.clarvex.tech`.
 *
 * ⚠️ **Sin el paquete de tracing del navegador, a propósito.** Añade
 * OpenTelemetry entero al bundle que descarga cada teléfono de la tienda, y lo
 * que aporta --el camino de una petición desde el clic-- ya se ve desde el
 * servidor. La app pesa 9 MB de JavaScript y la señal del centro comercial se
 * cae a diario: cada kilobyte se paga en el arranque.
 */

/** La misma dirección que Grafana genera al dar de alta la aplicación. */
const COLECTOR =
  "https://faro-collector-prod-us-west-0.grafana.net/collect/28b586a4c1870ff17edff2d11212a4af";

let arrancado = false;

export function iniciarFaro(version: string) {
  /*
   * ⚠️ Una sola vez por documento. `instrumentation-client` se ejecuta al
   * cargar, pero un montaje doble --React en modo estricto, un remonte-- haría
   * que cada error se enviara por duplicado y la cuota se gastaría el doble
   * diciendo lo mismo.
   */
  if (arrancado || typeof window === "undefined") return;
  arrancado = true;

  initializeFaro({
    url: COLECTOR,
    app: { name: "clarvex-app", version, environment: process.env.NODE_ENV },
    instrumentations: getWebInstrumentations({
      /*
       * ⚠️ Sin `captureConsole`. La app escribe en consola en sitios donde hay
       * datos de tienda --respuestas de KPIs, nombres-- y eso acabaría en un
       * tercero sin que nadie lo hubiera decidido. Es la misma línea que ya se
       * trazó apagando Session Replay en Sentry: grabaría pantallas con ventas
       * y empleados.
       */
      captureConsole: false,
    }),
    sessionTracking: {
      enabled: true,
      // Normal, no persistente: una sesión que sobrevive al cierre del
      // navegador sigue a la persona entre días, y aquí no hace falta.
      persistent: false,
    },
    /*
     * Titula en claro lo que llega del navegador, igual que hacía Sentry.
     *
     * `AbortError: signal is aborted without reason` no le dice nada a quien
     * abre la alerta, y desde un celular en tienda la mayoría de lo que llega
     * son cortes de señal. Sin traducir, la bandeja se vuelve ilegible y los
     * fallos de verdad se pierden entre el ruido.
     *
     * ⚠️ Se retitula y se baja de nivel, NUNCA se descarta: el 24 de agosto de
     * 2026 un `AbortError` fue justo lo que delató tres componentes globales
     * sin `.catch`. Filtrarlos nos habría dejado ciegos ante un fallo real.
     */
    beforeSend: (item) => {
      if (item.type !== TransportItemType.EXCEPTION) return item;

      const payload = item.payload as ExceptionEvent;
      const humanizado = humanizeError(payload.value);
      if (!humanizado) return item;

      /*
       * ⚠️ Se modifica EN SITIO, no se reconstruye el objeto. Rehaciendolo con
       * un `spread` se pierden campos obligatorios --el `timestamp`, entre
       * otros-- y el envio se rechaza: el error desapareceria en silencio, que
       * es justo lo contrario de lo que hace este gancho.
       */
      payload.context = {
        ...payload.context,
        error_original: payload.type ?? "desconocido",
        /*
         * ⚠️ El nivel va como ATRIBUTO, no en `meta`: en Faro una excepción no
         * lleva severidad propia --a diferencia de Sentry-- y no hay dónde
         * bajarla. Puesto aquí se filtra igual en el panel (`nivel = warning`),
         * que es para lo que servía: sacar del camino los cortes de red sin
         * borrarlos, y dejar en rojo solo lo accionable.
         */
        nivel: humanizado.level === "error" ? "error" : "warning",
      };
      payload.value = `${humanizado.title} (${payload.value ?? ""})`.trim();
      return item;
    },
  });
}
