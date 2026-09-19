import type { OperacionEnCola } from "@/lib/cola-offline";
import { colaClarvexNativa, type CampoEncolado } from "@/lib/puente-nativo";

/**
 * Dónde se guarda lo capturado sin conexión, hasta que llegue.
 *
 * Hay dos almacenes y se elige solo:
 *
 * | Dónde | Almacén | Se vacía |
 * |---|---|---|
 * | APK 1.7 o posterior | archivos privados de Android | también con la app CERRADA |
 * | navegador, PWA, APK vieja | IndexedDB | al abrir la app |
 *
 * ⚠️ **El almacén nativo NO es una copia del de la web: lo SUSTITUYE.** Dos
 * copias del mismo dato se separan en cuanto una escritura falla, y entonces ya
 * no se sabe cuál vale. Es la misma razón por la que Slack es una ventana del
 * chat y no un segundo dueño del mensaje.
 *
 * ⚠️ **IndexedDB y no `localStorage`** en el camino web: las evidencias son
 * fotos de uno o dos megas y `localStorage` guarda TEXTO con un tope de unos
 * cinco. IndexedDB guarda `Blob` tal cual y tiene sitio.
 *
 * ⚠️ **Y nada de esto DECIDE.** Qué se reintenta, en qué orden y qué se da por
 * perdido está en `lib/cola-offline`, sin navegador, porque es lo único que se
 * puede probar.
 */

const BASE = "clarvex-cola";
const VERSION = 1;
const ALMACEN = "operaciones";

/**
 * Lo que se guarda: la operación y su cuerpo listo para reenviar.
 *
 * ⚠️ **Los campos nuevos van OPCIONALES y nunca se renombra lo viejo.** Al
 * publicar una versión puede haber capturas ya guardadas en el teléfono de la
 * tienda, esperando señal. Un formato que no sepa leerlas las pierde en
 * silencio, que es justo lo que esta cola existe para evitar.
 */
export type OperacionGuardada = OperacionEnCola & {
  /**
   * Campos del formulario. Los `Blob` viajan tal cual en IndexedDB.
   *
   * ⚠️ Con el almacén nativo llega VACÍO al listar: veinticinco fotos en base64
   * a la vez no caben en memoria. El cuerpo se pide con `cuerpoDe()` justo antes
   * de mandar una, y la cola manda una sola cada vez.
   */
  campos: Array<[string, string | Blob]>;
  /** Nombre del archivo, cuando el campo es un `Blob`. */
  nombreArchivo: string | null;
  /** Cuerpo JSON ya serializado. Solo en las operaciones firmadas. */
  json?: string;
  /**
   * `true` cuando hay que pedir reto al servidor y FIRMAR al enviar.
   *
   * ⚠️ **La firma NO se puede hacer al capturar.** Lleva un reto de un solo uso
   * --que exige red-- y una ventana de dos minutos: guardada, llegaría vencida.
   * Firmar al enviar no relaja nada: el aparato prueba posesión en el momento en
   * que de verdad manda, que es lo que la ventana protege.
   */
  firmado?: boolean;
};

/* ─────────────────────────── IndexedDB ─────────────────────────── */

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(BASE, VERSION);
    peticion.onupgradeneeded = () => {
      const db = peticion.result;
      if (!db.objectStoreNames.contains(ALMACEN)) {
        // La clave es la de idempotencia: guardar dos veces la misma operación
        // la sobrescribe en vez de encolarla dos veces.
        db.createObjectStore(ALMACEN, { keyPath: "id" });
      }
    };
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error ?? new Error("No se pudo abrir la cola."));
  });
}

function comoPromesa<T>(peticion: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error ?? new Error("Falló la cola."));
  });
}

/* ──────────────────── conversión para el puente ──────────────────── */

function bytesABase64(bytes: ArrayBuffer): string {
  const vista = new Uint8Array(bytes);
  let texto = "";
  /*
   * ⚠️ Por tramos. `String.fromCharCode(...array)` con dos megas de golpe se
   * pasa del límite de argumentos y lanza --y eso ocurriría solo con las fotos
   * grandes, las del escáner, o sea justo en el cierre.
   */
  for (let i = 0; i < vista.length; i += 0x8000) {
    texto += String.fromCharCode(...vista.subarray(i, i + 0x8000));
  }
  return btoa(texto);
}

function base64ABlob(base64: string, tipo: string): Blob {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: tipo });
}

/** El campo reservado por el que viaja el cuerpo JSON de una operación firmada. */
const CAMPO_JSON = "__json";

async function aCamposNativos(op: OperacionGuardada): Promise<CampoEncolado[]> {
  const salida: CampoEncolado[] = [];
  for (const [nombre, valor] of op.campos) {
    if (typeof valor === "string") salida.push({ nombre, texto: valor });
    else {
      salida.push({
        nombre,
        base64: bytesABase64(await valor.arrayBuffer()),
        tipo: valor.type || "application/octet-stream",
        nombreArchivo: op.nombreArchivo ?? "archivo"
      });
    }
  }
  /*
   * Una operación firmada no lleva formulario sino un cuerpo JSON. Viaja como un
   * campo de texto más, y el trabajo en segundo plano la salta a propósito: su
   * firma exige pedir un reto de un solo uso que caduca en dos minutos.
   */
  if (typeof op.json === "string") salida.push({ nombre: CAMPO_JSON, texto: op.json });
  return salida;
}

/* ───────────────────────────── API ───────────────────────────── */

export function hayAlmacen(): boolean {
  return colaClarvexNativa() !== null || typeof indexedDB !== "undefined";
}

export async function leerTodo(): Promise<OperacionGuardada[]> {
  const nativa = colaClarvexNativa();
  if (nativa) {
    try {
      const { operaciones } = await nativa.listar();
      return operaciones.map((fila) => ({
        id: fila.id,
        creada: fila.creada,
        ruta: fila.ruta,
        etiqueta: fila.etiqueta,
        intentos: fila.intentos,
        ultimoError: fila.ultimoError,
        // Android solo distingue «pendiente» de «fallida»; el resto lo decide la
        // web, que se lo vuelve a guardar en cada intento.
        estado: fila.estado === "fallida" ? "fallida" as const : "pendiente" as const,
        campos: [],
        nombreArchivo: null,
        ...(fila.firmado ? { firmado: true } : {})
      }));
    } catch {
      return [];
    }
  }

  /*
   * ⚠️ Devuelve la cola VACÍA si IndexedDB no está. Una ventana privada, el
   * almacenamiento bloqueado o una cuota llena hacen que falle o ni exista. Ahí
   * la app tiene que seguir funcionando en línea como siempre; lo que no puede
   * es reventar por no poder encolar.
   */
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await abrir();
    const tx = db.transaction(ALMACEN, "readonly");
    const todo = await comoPromesa(tx.objectStore(ALMACEN).getAll() as IDBRequest<OperacionGuardada[]>);
    db.close();
    return todo;
  } catch {
    return [];
  }
}

/**
 * La operación con su cuerpo, justo antes de mandarla.
 *
 * Devuelve `null` cuando el cuerpo ya no está: lo mandó el trabajo en segundo
 * plano y lo borró. **No es un fallo** --significa que ya llegó-- y por eso
 * quien llama la saca de la cola en vez de darla por perdida.
 */
export async function cuerpoDe(op: OperacionGuardada): Promise<OperacionGuardada | null> {
  const nativa = colaClarvexNativa();
  if (!nativa) return op;
  try {
    const entera = await nativa.leer({ id: op.id });
    if (!entera.campos) return null;
    const campos: Array<[string, string | Blob]> = [];
    let json: string | undefined;
    let nombreArchivo: string | null = null;
    for (const campo of entera.campos) {
      if ("texto" in campo) {
        if (campo.nombre === CAMPO_JSON) json = campo.texto;
        else campos.push([campo.nombre, campo.texto]);
      } else {
        nombreArchivo = campo.nombreArchivo;
        campos.push([campo.nombre, base64ABlob(campo.base64, campo.tipo)]);
      }
    }
    return { ...op, campos, nombreArchivo, ...(json !== undefined ? { json } : {}) };
  } catch {
    return null;
  }
}

/** Devuelve `false` si no se pudo guardar, para poder DECIRLO. */
export async function guardar(operacion: OperacionGuardada): Promise<boolean> {
  const nativa = colaClarvexNativa();
  if (nativa) {
    try {
      const { guardada } = await nativa.guardar({
        id: operacion.id,
        ruta: operacion.ruta,
        creada: operacion.creada,
        etiqueta: operacion.etiqueta,
        firmado: Boolean(operacion.firmado),
        estado: operacion.estado,
        intentos: operacion.intentos,
        ultimoError: operacion.ultimoError,
        campos: await aCamposNativos(operacion)
      });
      return guardada;
    } catch {
      return false;
    }
  }

  if (typeof indexedDB === "undefined") return false;
  try {
    const db = await abrir();
    const tx = db.transaction(ALMACEN, "readwrite");
    await comoPromesa(tx.objectStore(ALMACEN).put(operacion));
    db.close();
    return true;
  } catch {
    /*
     * ⚠️ Un `false` aquí NO se traga. Quien llama tiene que avisar de que la
     * captura no quedó ni siquiera encolada: dar por buena una foto que no se
     * guardó en ningún sitio es el fallo que esta app lleva meses persiguiendo.
     */
    return false;
  }
}

export async function borrar(id: string): Promise<void> {
  const nativa = colaClarvexNativa();
  if (nativa) {
    await nativa.olvidar({ id }).catch(() => undefined);
    return;
  }
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await abrir();
    const tx = db.transaction(ALMACEN, "readwrite");
    await comoPromesa(tx.objectStore(ALMACEN).delete(id));
    db.close();
  } catch {
    // Que no se pueda borrar no puede tumbar el envío: la idempotencia hace que
    // reenviarla otra vez sea inofensivo.
  }
}
