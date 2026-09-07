import { CANAL_AVISOS_ID } from "@/lib/push-canal";

/**
 * Acceso a la capa nativa cuando la app corre dentro del contenedor de Android.
 *
 * ⚠️ **La misma web se sirve en tres sitios y solo uno tiene capa nativa**: el
 * navegador, la PWA instalada y la app de la Play Store. Todo lo de aquí
 * devuelve `null` o `false` en los dos primeros; nada de lo que se construya
 * encima puede darla por hecha.
 *
 * ⚠️ **Aquí NO se importa `@capacitor/core`, y es deliberado.** El contenedor
 * inyecta su puente en la página con `addDocumentStartJavaScript`, así que
 * `window.Capacitor` ya existe --con `registerPlugin` y con `PluginHeaders`,
 * la lista de plugins que el binario trae de verdad-- antes de que corra
 * nuestro código. Añadir el paquete metería una dependencia de móvil en el
 * bundle que descargan también los navegadores, para no ganar nada.
 *
 * ⚠️ **`Capacitor.Plugins.X` está VACÍO hasta que alguien lo registra.** El
 * puente expone `registerPlugin`, pero no rellena `Plugins` por su cuenta: eso
 * lo hace cada paquete de JS al importarse, y aquí no se importa ninguno. Por
 * eso se pide el plugin con `registerPlugin(nombre)` y no se lee de `Plugins`,
 * que es el atajo que parece funcionar y devuelve `undefined`.
 */

type EstadoPermiso = "prompt" | "prompt-with-rationale" | "denied" | "granted";

export type PermisosPush = { receive: EstadoPermiso };

/** El token que Google le asigna a este aparato. */
export type RegistroPush = { value: string };

/** Un canal de notificaciones de Android. Ver `CANAL_AVISOS`. */
export type CanalPush = {
  id: string;
  name: string;
  description?: string;
  /** 1 a 5. Desde Android 8 es ESTO --y no la prioridad del mensaje-- lo que decide si suena. */
  importance?: 1 | 2 | 3 | 4 | 5;
  /** 0 privado (oculta el texto en la pantalla de bloqueo), 1 público, -1 secreto. */
  visibility?: -1 | 0 | 1;
};

/**
 * ⚠️ **Importancia 5 y visibilidad PRIVADA.**
 *
 * - **5** porque desde Android 8 la importancia del canal manda sobre la
 *   prioridad del mensaje: en el canal de reserva que crea Firebase --media--
 *   los avisos entran mudos, y un aviso de captura que no suena no es un aviso.
 * - **0, privada**, porque estas notificaciones llevan cifras de la tienda. En
 *   público, el cierre del día se lee en la pantalla de bloqueo de un teléfono
 *   que está sobre el mostrador. Con el teléfono desbloqueado se ve entero; lo
 *   único que se pierde es enseñárselo a quien pasa por delante.
 *
 * El `id` es el mismo que declara `default_notification_channel_id` en el
 * manifiesto de la app. Si dejan de coincidir, los avisos caen en un canal que
 * nadie configuró y vuelven a entrar mudos, sin que nada falle.
 */
export const CANAL_AVISOS: CanalPush = {
  id: CANAL_AVISOS_ID,
  name: "Avisos de Clarvex",
  description: "Metas, pendientes, comunicados y alertas de la tienda.",
  importance: 5,
  visibility: 0
};

export type PluginPush = {
  checkPermissions(): Promise<PermisosPush>;
  requestPermissions(): Promise<PermisosPush>;
  register(): Promise<void>;
  /** Solo Android. Crear un canal que ya existe no falla: actualiza el nombre y la descripción. */
  createChannel(canal: CanalPush): Promise<void>;
  addListener(evento: "registration", cb: (dato: RegistroPush) => void): Promise<{ remove(): Promise<void> }>;
  addListener(evento: "registrationError", cb: (dato: { error: string }) => void): Promise<{ remove(): Promise<void> }>;
};

type PuenteCapacitor = {
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (nombre: string) => boolean;
  registerPlugin?: <T>(nombre: string) => T;
  getPlatform?: () => string;
};

function puente(): PuenteCapacitor | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: PuenteCapacitor }).Capacitor;
  return cap ?? null;
}

/** `true` solo dentro de la app instalada; `false` en navegador y en la PWA. */
export function enContenedorNativo(): boolean {
  return puente()?.isNativePlatform?.() === true;
}

/** "android", "ios" o "web". Sirve para etiquetar el aparato al registrarlo. */
export function plataformaNativa(): string {
  return puente()?.getPlatform?.() ?? "web";
}

// ⚠️ Se recuerda lo ya pedido. Capacitor avisa por consola --«Cannot register
// plugins twice»-- si se le pide dos veces el mismo, y React monta los efectos
// dos veces en desarrollo. Devuelve el mismo proxy igualmente, así que es solo
// ruido; pero ruido que enseña a ignorar la consola.
const pedidos = new Map<string, unknown>();

/**
 * Pide un plugin nativo por su nombre.
 *
 * ⚠️ **Se comprueba `isPluginAvailable` ANTES de registrarlo.** `registerPlugin`
 * devuelve un proxy para cualquier nombre, exista o no: sus métodos solo fallan
 * al llamarlos, y con un `UNIMPLEMENTED` dentro de una promesa que es fácil
 * tragarse. Preguntar primero convierte «este binario no trae ese plugin» en un
 * `null` que se ve en el sitio donde se decide, y no en un error silencioso más
 * tarde. `isPluginAvailable` mira `PluginHeaders`, que es lo que el contenedor
 * compiló de verdad --no lo que dice el `package.json`--.
 */
export function pluginNativo<T>(nombre: string): T | null {
  const recordado = pedidos.get(nombre);
  if (recordado !== undefined) return recordado as T | null;

  const cap = puente();
  if (!cap?.registerPlugin || cap.isPluginAvailable?.(nombre) !== true) return null;
  try {
    const plugin = cap.registerPlugin<T>(nombre);
    pedidos.set(nombre, plugin);
    return plugin;
  } catch {
    return null;
  }
}

/** El plugin de notificaciones, o `null` si esta versión de la app no lo trae. */
export function pushNativo(): PluginPush | null {
  return pluginNativo<PluginPush>("PushNotifications");
}
