import type { OperacionEnCola } from "@/lib/cola-offline";

/**
 * Dónde se guarda lo capturado sin conexión, hasta que llegue.
 *
 * ⚠️ **IndexedDB y no `localStorage`.** Las evidencias del checklist son fotos
 * de uno o dos megas y `localStorage` guarda TEXTO con un tope de unos cinco:
 * dos fotos lo llenarían, y su fallo es una excepción a media escritura que
 * dejaría la cola corrupta. IndexedDB guarda `Blob` tal cual y tiene sitio.
 *
 * ⚠️ **Todo lo que toca el navegador vive aquí y NADA decide.** Las decisiones
 * --qué se reintenta, en qué orden, qué se da por perdido-- están en
 * `lib/cola-offline`, sin navegador, porque es lo único que se puede probar.
 */

const BASE = "clarvex-cola";
const VERSION = 1;
const ALMACEN = "operaciones";

/** Lo que se guarda: la operación y su cuerpo listo para reenviar. */
export type OperacionGuardada = OperacionEnCola & {
  /** Campos del formulario. Los `Blob` viajan tal cual. */
  campos: Array<[string, string | Blob]>;
  /** Nombre del archivo, cuando el campo es un `Blob`. */
  nombreArchivo: string | null;
};

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

/**
 * ⚠️ Todas las lecturas devuelven la cola VACÍA si IndexedDB no está.
 *
 * Una ventana privada, el almacenamiento bloqueado o una cuota llena hacen que
 * `indexedDB` falle o ni exista. Ahí la app tiene que seguir funcionando en
 * línea como siempre; lo que no puede es reventar por no poder encolar.
 */
export function hayAlmacen(): boolean {
  return typeof indexedDB !== "undefined";
}

export async function leerTodo(): Promise<OperacionGuardada[]> {
  if (!hayAlmacen()) return [];
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

/** Devuelve `false` si no se pudo guardar, para poder DECIRLO. */
export async function guardar(operacion: OperacionGuardada): Promise<boolean> {
  if (!hayAlmacen()) return false;
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
  if (!hayAlmacen()) return;
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
