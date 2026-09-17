"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, X } from "lucide-react";
import { appNativa, CANAL_AVISOS, enContenedorNativo, plataformaNativa, pushNativo, rutaInternaDeNotificacion, type PluginPush } from "@/lib/puente-nativo";

/**
 * ⚠️ **Este componente se monta en el LAYOUT RAÍZ, o sea también en `/login`.**
 *
 * Ahí todavía no hay sesión, así que cualquier registro que se intente vuelve en
 * **401** — y el login navega con `router.replace`, que es navegación de cliente:
 * el layout NO se remonta y el efecto no se vuelve a ejecutar. Un aparato que
 * consigue su token en la pantalla de acceso se quedaba sin registrar hasta el
 * SIGUIENTE arranque de la app, justo cuando la persona acaba de conceder el
 * permiso y espera que funcione. Y sin un solo error a la vista.
 *
 * Por eso lo que no se pudo guardar queda PENDIENTE y se reintenta por evento
 * --al cambiar de pantalla y al volver a la app--, nunca con un temporizador:
 * es la misma regla que `useSession`, y por el mismo motivo.
 */
type Pendiente =
  | { tipo: "nativo"; token: string }
  | { tipo: "web"; registro: ServiceWorkerRegistration }
  | null;

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(Array.from(raw).map((c) => c.charCodeAt(0)));
}

/** `true` si quedó registrado; `false` si hay que reintentarlo con sesión. */
export async function saveSubscription(registration: ServiceWorkerRegistration): Promise<boolean> {
  const res = await fetch("/api/push/vapid-public-key");
  const { vapidPublicKey } = (await res.json()) as { vapidPublicKey?: string };
  if (!vapidPublicKey) return true; // Sin VAPID configurado no hay nada que reintentar.
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));
  const { endpoint, keys } = subscription.toJSON() as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  const guardado = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint, p256dh: keys.p256dh, auth: keys.auth }),
  });
  // ⚠️ Antes no se miraba la respuesta. En `/login` este POST vuelve 401 y la
  // suscripción se perdía sin dejar ni una línea: el navegador quedaba
  // suscrito ante el servicio de push y el servidor sin saberlo, así que no le
  // llegaba nada y todo parecía correcto.
  if (guardado.status === 401) return false;
  if (!guardado.ok) console.error("[push web] El servidor rechazó la suscripción —", guardado.status);
  return true;
}

/**
 * El token de FCM identifica al APARATO. Se manda con la sesión de quien esté
 * dentro, y el servidor lo reasigna: el teléfono de la tienda cambia de manos.
 *
 * Devuelve `false` solo cuando falta la sesión, que es lo único que se arregla
 * reintentando. Un rechazo por otra causa se registra y no se insiste.
 */
export async function guardarTokenNativo(token: string): Promise<boolean> {
  const platform = plataformaNativa();
  if (platform !== "android") {
    // Hoy solo existe la app de Android. Un token de otra plataforma se
    // registraría mal etiquetado, y eso es peor que no registrarlo: al mandar
    // se elegiría el camino equivocado sin que nada avise.
    console.warn(`[push nativo] Plataforma sin soporte de registro: ${platform}`);
    return true;
  }
  /*
   * De paso se registra QUE version corre este aparato.
   *
   * ⚠️ **Si no se puede averiguar, se registra igual sin ella.** El token es lo
   * que decide si llegan las notificaciones; la version solo sirve para mirar
   * como va un despliegue. Dejar al aparato sin avisos porque un plugin no
   * contesto seria cambiar lo importante por lo accesorio.
   */
  let version: { appBuild?: number; appVersion?: string } = {};
  try {
    const app = appNativa();
    if (app) {
      const info = await app.getInfo();
      const build = Number.parseInt(info.build, 10);
      // `build` es el versionCode y es lo unico comparable: "1.10" como texto
      // queda por debajo de "1.9".
      if (Number.isFinite(build)) version = { appBuild: build, appVersion: info.version };
    }
  } catch {
    // Sin version: se sigue.
  }

  const res = await fetch("/api/push/device", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform, ...version }),
  });
  if (res.status === 401) return false;
  if (!res.ok) {
    console.error("[push nativo] El servidor rechazó el token del aparato —", res.status);
  }
  return true;
}

/**
 * ⚠️ **`localStorage` LANZA en algunas configuraciones**, no devuelve `null`:
 * el WebView con almacenamiento restringido, un navegador con las cookies de
 * terceros cortadas, una ventana privada. Sin proteger, la lectura reventaba
 * dentro del efecto y se llevaba por delante **el aviso entero**, que es el
 * unico sitio desde donde se puede conceder el permiso. Ante la duda se enseña:
 * un aviso de mas se cierra; uno que nunca aparece no se puede pedir.
 */
export function avisoDescartado(): boolean {
  try {
    return localStorage.getItem("push-prompt-dismissed") === "1";
  } catch {
    return false;
  }
}

export function recordarDescarte() {
  try {
    localStorage.setItem("push-prompt-dismissed", "1");
  } catch {
    // Se cerrara otra vez a la proxima. Es preferible a no poder cerrarlo.
  }
}

// El canal tiene que existir ANTES de que llegue la primera notificación: si no
// existe, Android la coloca en el de reserva de Firebase --importancia media-- y
// entra muda. Crear uno que ya está no falla ni pierde los ajustes de la persona.
async function prepararYRegistrar(plugin: PluginPush) {
  try {
    await plugin.createChannel(CANAL_AVISOS);
  } catch (error) {
    // Si el canal falla, el registro sigue: más vale un aviso silencioso que
    // ninguno. Pero se deja dicho, porque «no suena» es justo lo que se
    // reportaría como «no llegan las notificaciones».
    console.warn("[push nativo] No se pudo crear el canal de avisos:", (error as Error).message);
  }
  await plugin.register();
}

export function PwaRegister() {
  const [reg, setReg] = useState<ServiceWorkerRegistration | null>(null);
  const [nativo, setNativo] = useState<PluginPush | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const pendiente = useRef<Pendiente>(null);
  // Evita volver a pedir el token en cada vuelta a la app: el POST es un upsert,
  // asi que repetirlo no rompe nada, pero es una peticion por cada foco.
  const yaRegistrado = useRef(false);
  const pathname = usePathname();

  // Guarda, y si lo único que faltaba era la sesión, lo deja pendiente.
  const registrar = useCallback(async (que: NonNullable<Pendiente>) => {
    try {
      const hecho = que.tipo === "nativo"
        ? await guardarTokenNativo(que.token)
        : await saveSubscription(que.registro);
      pendiente.current = hecho ? null : que;
    } catch {
      // Sin red. Se conserva: los mismos eventos que traen la sesión traen
      // también la conexión de vuelta.
      pendiente.current = que;
    }
  }, []);

  // ⚠️ El reintento va por EVENTO, no por temporizador. Entrar produce una
  // navegación de cliente --`router.replace` en el login-- y volver a la app
  // produce un `visibilitychange`. Insistir cada X segundos gastaría batería sin
  // ninguna señal de que algo haya cambiado; es la regla de `useSession`.
  useEffect(() => {
    if (pendiente.current) void registrar(pendiente.current);
  }, [pathname, registrar]);

  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      if (pendiente.current) void registrar(pendiente.current);

      // ⚠️ **El permiso se puede conceder DESDE LOS AJUSTES del sistema**, que
      // es adonde Android manda a quien lo denego una vez --y desde donde
      // cualquiera puede activarlo por su cuenta--. Al volver, la app sigue
      // viva: el efecto de montaje NO se repite, asi que sin esto el permiso
      // queda dado y el aparato sin registrar, hasta que alguien mate la app.
      // Paso de verdad la primera vez que se probo.
      if (!nativo || yaRegistrado.current) return;
      void (async () => {
        try {
          const estado = await nativo.checkPermissions();
          if (estado.receive !== "granted") return;
          yaRegistrado.current = true;
          setShowBanner(false);
          await prepararYRegistrar(nativo);
        } catch (error) {
          console.error("[push nativo] No se pudo reintentar el registro al volver:", (error as Error).message);
        }
      })();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [registrar, nativo]);

  // ── Camino NATIVO: la app de Android ────────────────────────────────────
  //
  // ⚠️ El WebView de Android no implementa la API de Push ni la de Notification,
  // así que dentro de la app instalada el camino de abajo no puede ni pedir
  // permiso: se queda sin avisos y sin decirlo. Aquí se piden al sistema, por
  // FCM, con el plugin que el contenedor trae compilado.
  useEffect(() => {
    if (!enContenedorNativo()) return;
    const plugin = pushNativo();
    // ⚠️ Estamos DENTRO de la app pero el binario no trae el plugin: es una
    // version vieja instalada sobre la web nueva. Sin esta linea se quedaria
    // sin notificaciones y sin decirlo, que es justo el fallo que este archivo
    // vino a cerrar. El camino web de abajo tampoco la cubre: el WebView no
    // tiene API de Push.
    if (!plugin) {
      console.warn("[push nativo] Esta version de la app no trae el plugin de notificaciones.");
      return;
    }
    setNativo(plugin);

    let montado = true;
    let soltar: Array<() => Promise<void>> = [];

    void (async () => {
      try {
        // ⚠️ Los oyentes van ANTES de `register()`. El token llega por el
        // evento `registration`, y Google puede entregarlo de inmediato: con
        // el orden al revés se pierde el de la primera vez --justo la que
        // importa-- y no vuelve hasta que el token rote.
        const asas = await Promise.all([
          plugin.addListener("registration", (dato) => {
            void registrar({ tipo: "nativo", token: dato.value });
          }),
          plugin.addListener("registrationError", (dato) => {
            console.error("[push nativo] Google no entregó el token:", dato.error);
          }),
          plugin.addListener("pushNotificationActionPerformed", (dato) => {
            const raw = dato.notification.data?.path ?? dato.notification.data?.url;
            // Solo navegación interna. Una notificación no puede convertir un
            // toque en una salida a otro dominio ni ejecutar un esquema ajeno.
            const target = rutaInternaDeNotificacion(raw, window.location.origin);
            if (target) window.location.assign(target);
          }),
        ]);
        if (!montado) {
          await Promise.all(asas.map((a) => a.remove()));
          return;
        }
        soltar = asas.map((a) => () => a.remove());

        const estado = await plugin.checkPermissions();
        if (estado.receive === "granted") {
          yaRegistrado.current = true;
          await prepararYRegistrar(plugin);
          return;
        }
        // "denied" no se puede volver a preguntar desde la app: Android exige
        // que la persona lo cambie en los ajustes del sistema. Insistir con el
        // aviso solo enseñaría un botón que no hace nada.
        if (estado.receive === "denied") return;
        if (!avisoDescartado()) setShowBanner(true);
      } catch (error) {
        console.error("[push nativo] No se pudo preparar el registro:", (error as Error).message);
      }
    })();

    return () => {
      montado = false;
      void Promise.all(soltar.map((s) => s())).catch(() => undefined);
    };
    // `registrar` es estable (`useCallback` sin dependencias), asi que esto
    // sigue corriendo UNA vez. Va en la lista para no apagar la regla del lint:
    // si algun dia deja de ser estable, conviene que avise.
  }, [registrar]);

  // ── Camino WEB: navegador y PWA ─────────────────────────────────────────
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Recarga automática al activarse un SW nuevo: evita la pantalla en blanco
    // tras un deploy, cuando el shell HTML viejo (cacheado por la PWA) apunta a
    // chunks de JS que ya no existen. Al tomar control el SW nuevo, refrescamos
    // una sola vez para cargar los assets frescos.
    //
    // Guard en sessionStorage (NO una variable local): la variable se reinicia
    // en cada recarga, así que no impide un BUCLE de recargas si el controlador
    // cambia de forma repetida (p. ej. otra pestaña o un claim() reiterado). Con
    // el flag persistente por pestaña, recargamos como máximo una vez.
    const RELOAD_FLAG = "clarvex-sw-refreshed";
    const onControllerChange = () => {
      try {
        if (sessionStorage.getItem(RELOAD_FLAG) === "1") return;
        sessionStorage.setItem(RELOAD_FLAG, "1");
      } catch {
        // sessionStorage bloqueado: mejor no recargar que arriesgar un bucle.
        return;
      }
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    // Busca un SW nuevo SIN depender de recargar el documento: al volver a la
    // pestaña y cada minuto. Un POS que nunca cierra el navegador se quedaba con
    // el bundle viejo tras un deploy (la comprobación de SW solo corría al abrir
    // la app), así que un bug ya arreglado no llegaba nunca. updateViaCache:"none"
    // evita además que el navegador sirva el sw.js viejo desde su caché HTTP
    // (venía con max-age de 4 h), que era lo que impedía ver la versión nueva.
    const checkForUpdate = () => {
      navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => undefined);
    };
    const onVisible = () => { if (document.visibilityState === "visible") checkForUpdate(); };
    document.addEventListener("visibilitychange", onVisible);
    const updateTimer = window.setInterval(checkForUpdate, 60_000);
    const cleanup = () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(updateTimer);
    };

    // ⚠️ Dentro de la app, el service worker SÍ se registra --da la caché y el
    // aviso de versión nueva-- pero el push lo lleva el efecto de arriba. Sin
    // este corte, un WebView que sí exponga `Notification` enseñaría DOS avisos
    // de activar notificaciones y el segundo suscribiría a un `pushManager` que
    // no existe.
    if (enContenedorNativo()) {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => undefined);
      return cleanup;
    }

    if (!("Notification" in window)) {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => undefined);
      return cleanup;
    }

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => {
        setReg(registration);
        // Busca actualizaciones al abrir la app (clave en PWA que rara vez recarga).
        registration.update().catch(() => undefined);
        const permission = Notification.permission;
        if (permission === "granted") {
          void registrar({ tipo: "web", registro: registration });
        } else if (permission === "default") {
          if (!avisoDescartado()) setShowBanner(true);
        }
      })
      .catch(() => undefined);

    return cleanup;
  }, [registrar]);

  async function handleActivate() {
    setShowBanner(false);
    if (nativo) {
      try {
        const estado = await nativo.requestPermissions();
        if (estado.receive === "granted") {
          yaRegistrado.current = true;
          await prepararYRegistrar(nativo);
        }
      } catch (error) {
        console.error("[push nativo] No se pudo pedir el permiso:", (error as Error).message);
      }
      return;
    }
    if (!reg) return;
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        await registrar({ tipo: "web", registro: reg });
      }
    } catch {
      // push no soportado
    }
  }

  function handleDismiss() {
    setShowBanner(false);
    recordarDescarte();
  }

  if (!showBanner) return null;

  return (
    // `data-transient`: ver UpdatePrompt. Depende del estado del navegador, no
    // del diseño, así que las pruebas visuales lo ocultan.
    <div data-transient className="fixed bottom-[calc(5rem+var(--safe-bottom))] left-4 right-4 z-50 flex items-center gap-3 rounded-2xl border border-volt/30 bg-panel px-4 py-3 shadow-lg">
      <Bell size={18} className="shrink-0 text-volt" />
      <p className="flex-1 text-sm font-semibold text-ink">Activa las notificaciones push</p>
      <button
        onClick={() => void handleActivate()}
        className="rounded-xl bg-volt px-3 py-1.5 text-xs font-semibold text-white"
      >
        Activar
      </button>
      <button onClick={handleDismiss} className="text-muted">
        <X size={16} />
      </button>
    </div>
  );
}
