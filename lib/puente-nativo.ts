import { CANAL_AVISOS_ID, CANAL_VENTA_ID } from "@/lib/push-canal";

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

/** Silencioso (importancia 2) y privado: ver `CANAL_VENTA_ID`. */
export const CANAL_VENTA: CanalPush = {
  id: CANAL_VENTA_ID,
  name: "Venta en vivo",
  description: "Tu venta del día, actualizada sin sonar cada vez que se captura.",
  importance: 2,
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
  addListener(
    evento: "pushNotificationActionPerformed",
    cb: (dato: { actionId: string; notification: { data?: Record<string, unknown> } }) => void
  ): Promise<{ remove(): Promise<void> }>;
};

type PuenteCapacitor = {
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (nombre: string) => boolean;
  registerPlugin?: <T>(nombre: string) => T;
  getPlatform?: () => string;
  convertFileSrc?: (ruta: string) => string;
};

function puente(): PuenteCapacitor | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: PuenteCapacitor }).Capacitor;
  return cap ?? null;
}

/**
 * La marca que el contenedor añade a su User-Agent (`appendUserAgent` en
 * `capacitor.config.ts`, en `clarvex-movil`).
 *
 * ⚠️ Se compara el PREFIJO, nunca la versión completa: cada APK escribe la
 * suya --`ClarvexApp/1.3`, `1.4`, `1.5`, `1.5.1`, `1.6`-- y buscar una exacta
 * dejaría fuera a todos los teléfonos que no se hayan actualizado. Comprobado
 * contra el registro del proxy: 2,839 peticiones reales con las cinco.
 */
const MARCA_APP = "ClarvexApp/";

function marcaDeLaApp(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.includes(MARCA_APP);
}

/**
 * `true` solo dentro de la app instalada; `false` en navegador y en la PWA.
 *
 * ⚠️ **Se miran DOS señales, y la del agente es la que no compite.**
 *
 * `window.Capacitor` lo inyecta el contenedor con `addDocumentStartJavaScript`,
 * así que en un arranque en frío puede no estar todavía cuando alguien
 * pregunta. Y quien pregunta primero es la raíz de la app: si contesta que no,
 * manda a `/advisor` o `/manager` --la portada de la WEB-- dentro de la APK.
 *
 * Reportado por el gerente el 18 de septiembre de 2026 («cuando recién entro me
 * aparece la interfaz de la web, tengo que cambiar de pantalla y regresar»), y
 * lo mismo tras actualizar la APK, que es otro arranque en frío. Queda en el
 * registro del proxy, con la misma marca de segundo:
 *
 *     13:12:36  "/"          la app abre la raíz
 *     13:12:36  "/manager"   y la raíz la manda a la portada web
 *
 * El User-Agent, en cambio, lo fija el WebView ANTES de cargar nada: viaja en
 * la primera petición y está en `navigator.userAgent` desde la primera línea de
 * JavaScript. No hay carrera posible.
 *
 * ⚠️ **Esto NO sustituye a `isPluginAvailable`.** Decir «soy la app» no dice
 * que los plugins hayan llegado --son dos piezas distintas del puente y esa
 * confusión ya costó el candado de la huella--. Quien necesite un plugin sigue
 * pidiéndolo por `pluginNativo()`, que mira `PluginHeaders`.
 *
 * ⚠️ Y es una decisión de INTERFAZ, no una frontera de seguridad: un agente se
 * falsifica en dos clics. Lo que protege de verdad las APIs nativas es la
 * sesión y la firma del dispositivo, que no cambian.
 */
export function enContenedorNativo(): boolean {
  // El puente es la respuesta buena en cuanto existe.
  if (puente()?.isNativePlatform?.() === true) return true;
  // Y el agente cubre el hueco de antes, que es justo el arranque.
  return marcaDeLaApp();
}

/**
 * A dónde lleva «volver al inicio».
 *
 * ⚠️ Siete pantallas --Conteos, Pendientes, Plan, Bitácora, Equipo, Suscripción
 * y Administración-- piden volver a `/manager`, que era la portada cuando se
 * escribieron. Dentro de la APK la portada es «Mi día», así que ese botón
 * sacaba de la experiencia de la app a la de la web, con el mismo efecto que el
 * fallo de arranque pero provocado a mano.
 *
 * Solo traduce las DOS portadas. Cualquier otro destino se respeta tal cual:
 * un «atrás» que lleva a la pantalla padre no tiene nada que ver con esto.
 */
export function rutaDeInicio(destino: string): string {
  if (destino !== "/manager" && destino !== "/advisor") return destino;
  return enContenedorNativo() ? "/mi-dia" : destino;
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

/** El plugin propio que descarga e instala una version nueva del APK. */
export type PluginActualizador = {
  puedeInstalar(): Promise<{ permitido: boolean }>;
  abrirAjustesDeInstalacion(): Promise<void>;
  descargarEInstalar(opciones: { url: string; sha256: string }): Promise<{ lanzado: boolean }>;
  addListener(
    evento: "progreso",
    cb: (dato: { porcentaje: number }) => void
  ): Promise<{ remove(): Promise<void> }>;
};

/** Lo que la app sabe de si misma. Lo da `@capacitor/app`, que ya viene dentro. */
export type PluginApp = {
  getInfo(): Promise<{ name: string; id: string; build: string; version: string }>;
};

/** `null` fuera del contenedor, o si esta version de la app no lo trae. */
export function actualizadorNativo(): PluginActualizador | null {
  return pluginNativo<PluginActualizador>("Actualizador");
}

export function appNativa(): PluginApp | null {
  return pluginNativo<PluginApp>("App");
}

/**
 * La huella del sistema como CANDADO, distinta de la passkey.
 *
 * ⚠️ Las dos usan el mismo dedo y hacen cosas distintas. La passkey (WebAuthn)
 * demuestra al SERVIDOR quién eres. Esto solo decide, en el teléfono, si se
 * enseña la sesión que ya existe. Confundirlas llevaría a creer que este
 * candado autentica, y no lo hace.
 */
export type PluginBiometria = {
  disponible(): Promise<{ puede: boolean; motivo: "listo" | "sin-registrar" | "sin-lector" | "no-disponible" }>;
  autenticar(opciones?: { titulo?: string; subtitulo?: string }): Promise<{
    ok: boolean;
    cancelado?: boolean;
    motivo?: string;
  }>;
};

export function biometriaNativa(): PluginBiometria | null {
  return pluginNativo<PluginBiometria>("Biometria");
}

export type ResultadoEscanerNativo = {
  cancelado: boolean;
  paginas: string[];
  pdf?: string | null;
};

export type PluginScannerDocumentos = {
  escanear(opciones?: { limite?: number; galeria?: boolean }): Promise<ResultadoEscanerNativo>;
};

/** Escáner de documentos de ML Kit, disponible desde la APK 1.5. */
export function scannerDocumentosNativo(): PluginScannerDocumentos | null {
  return pluginNativo<PluginScannerDocumentos>("ScannerDocumentos");
}

export type IdentidadDispositivoNativo = {
  installationId: string;
  publicKey: string;
  keyAlgorithm: "ES256";
  platform: "android";
  packageName: string;
  appBuild: number;
  appVersion: string;
  capabilities: string[];
};

export type DiagnosticoDispositivoNativo = {
  installationId: string;
  androidVersion: string;
  androidSdk: number;
  manufacturer: string;
  model: string;
  camera: boolean;
  notifications: boolean;
  network: "offline" | "wifi" | "cellular" | "ethernet" | "online";
  freeStorageBytes: number;
  webView: string;
  automaticTime: boolean;
};

export type PluginDispositivoClarvex = {
  identidad(): Promise<IdentidadDispositivoNativo>;
  firmar(options: { payload: string }): Promise<{ installationId: string; signature: string }>;
  diagnostico(): Promise<DiagnosticoDispositivoNativo>;
  /**
   * Cadena de atestación del origen del binario, desde APK 1.8.
   *
   * ⚠️ Opcional a propósito: una APK anterior no lo trae y tiene que poder
   * registrarse igual.
   */
  atestiguar?(options: { reto: string }): Promise<{ disponible: boolean; cadena?: string[]; motivo?: string }>;
};

/** Identidad no exportable y diagnóstico del equipo, desde la APK posterior a 1.5. */
export function dispositivoClarvexNativo(): PluginDispositivoClarvex | null {
  return pluginNativo<PluginDispositivoClarvex>("DispositivoClarvex");
}

export type PluginCalendarioClarvex = {
  agregarEvento(options: {
    title: string;
    date: string;
    start: string;
    end: string;
    location?: string;
    notes?: string;
  }): Promise<{ opened: boolean }>;
};

/** Abre el editor del calendario del sistema; no solicita acceso al calendario. */
export function calendarioClarvexNativo(): PluginCalendarioClarvex | null {
  return pluginNativo<PluginCalendarioClarvex>("CalendarioClarvex");
}

export type CampoEncolado =
  | { nombre: string; texto: string }
  | { nombre: string; base64: string; tipo: string; nombreArchivo: string };

export type OperacionNativa = {
  id: string;
  ruta: string;
  creada: number;
  etiqueta: string;
  firmado: boolean;
  estado: string;
  intentos: number;
  ultimoError: string | null;
};

export type PluginColaClarvex = {
  guardar(options: OperacionNativa & { campos: CampoEncolado[] }): Promise<{ guardada: boolean; motivo?: string }>;
  listar(): Promise<{ operaciones: OperacionNativa[] }>;
  leer(options: { id: string }): Promise<Partial<OperacionNativa & { campos: CampoEncolado[] }>>;
  olvidar(options: { id: string }): Promise<void>;
  programar(): Promise<void>;
};

/**
 * La cola de lo capturado sin señal, guardada por Android.
 *
 * ⚠️ **Existe porque un worker de Android NO puede leer IndexedDB.** Vive dentro
 * del WebView, en formato interno de Chromium. Guardando aquí, la web y el envío
 * en segundo plano leen los MISMOS archivos, en vez de tener cada uno su copia
 * --que se separarían en cuanto una escritura fallara.
 *
 * `null` en el navegador, en la PWA y en una APK anterior a la 1.7: ahí la cola
 * sigue en IndexedDB y se vacía al abrir la app, como hasta ahora.
 */
export function colaClarvexNativa(): PluginColaClarvex | null {
  return pluginNativo<PluginColaClarvex>("ColaClarvex");
}

export type LecturaDeCodigo = {
  /** `false` cuando el teléfono no puede escanear nativamente: se usa el web. */
  disponible: boolean;
  cancelado: boolean;
  valor: string;
  formato?: number;
  motivo?: string;
};

export type PluginEscanerCodigos = {
  escanear(): Promise<LecturaDeCodigo>;
};

/**
 * Lector de códigos nativo, desde APK 1.8.
 *
 * ⚠️ **Existe porque el WebView NO trae `BarcodeDetector`.** Es una función de
 * Chrome, no del contenedor, así que dentro de la APK el escáner web cae siempre
 * a jsQR: decodifica cuadro por cuadro en JavaScript sobre vídeo de 1080p. Se lee
 * como «el escáner no sirve» en el teléfono de la tienda y perfecto en el
 * navegador, siendo la misma web.
 *
 * `null` fuera de la APK 1.8: ahí sigue el escáner de siempre, que funciona.
 */
export function escanerCodigosNativo(): PluginEscanerCodigos | null {
  return pluginNativo<PluginEscanerCodigos>("EscanerCodigos");
}

/** Convierte un `file://` privado devuelto por Android en una URL legible por el WebView. */
export function urlArchivoNativo(ruta: string): string | null {
  const convertir = puente()?.convertFileSrc;
  if (!convertir || !ruta.startsWith("file://")) return null;
  try {
    return convertir(ruta);
  } catch {
    return null;
  }
}

/** Normaliza el destino de una notificación y rechaza dominios o esquemas externos. */
export function rutaInternaDeNotificacion(valor: unknown, origen: string): string | null {
  if (typeof valor !== "string" || !valor.startsWith("/") || valor.startsWith("//")) return null;
  try {
    const destino = new URL(valor, origen);
    if (destino.origin !== origen) return null;
    return `${destino.pathname}${destino.search}${destino.hash}`;
  } catch {
    return null;
  }
}
