"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { CANAL_AVISOS, enContenedorNativo, plataformaNativa, pushNativo, type PluginPush } from "@/lib/puente-nativo";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(Array.from(raw).map((c) => c.charCodeAt(0)));
}

async function saveSubscription(registration: ServiceWorkerRegistration) {
  const res = await fetch("/api/push/vapid-public-key");
  const { vapidPublicKey } = (await res.json()) as { vapidPublicKey?: string };
  if (!vapidPublicKey) return;
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
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint, p256dh: keys.p256dh, auth: keys.auth }),
  });
}

// El token de FCM identifica al APARATO. Se manda con la sesión de quien esté
// dentro, y el servidor lo reasigna: el teléfono de la tienda cambia de manos.
async function guardarTokenNativo(token: string) {
  const platform = plataformaNativa();
  if (platform !== "android") {
    // Hoy solo existe la app de Android. Un token de otra plataforma se
    // registraría mal etiquetado, y eso es peor que no registrarlo: al mandar
    // se elegiría el camino equivocado sin que nada avise.
    console.warn(`[push nativo] Plataforma sin soporte de registro: ${platform}`);
    return;
  }
  const res = await fetch("/api/push/device", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform }),
  });
  if (!res.ok) {
    console.error("[push nativo] El servidor rechazó el token del aparato —", res.status);
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

  // ── Camino NATIVO: la app de Android ────────────────────────────────────
  //
  // ⚠️ El WebView de Android no implementa la API de Push ni la de Notification,
  // así que dentro de la app instalada el camino de abajo no puede ni pedir
  // permiso: se queda sin avisos y sin decirlo. Aquí se piden al sistema, por
  // FCM, con el plugin que el contenedor trae compilado.
  useEffect(() => {
    const plugin = enContenedorNativo() ? pushNativo() : null;
    if (!plugin) return;
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
            void guardarTokenNativo(dato.value).catch(() => undefined);
          }),
          plugin.addListener("registrationError", (dato) => {
            console.error("[push nativo] Google no entregó el token:", dato.error);
          }),
        ]);
        if (!montado) {
          await Promise.all(asas.map((a) => a.remove()));
          return;
        }
        soltar = asas.map((a) => () => a.remove());

        const estado = await plugin.checkPermissions();
        if (estado.receive === "granted") {
          await prepararYRegistrar(plugin);
          return;
        }
        // "denied" no se puede volver a preguntar desde la app: Android exige
        // que la persona lo cambie en los ajustes del sistema. Insistir con el
        // aviso solo enseñaría un botón que no hace nada.
        if (estado.receive === "denied") return;
        if (!localStorage.getItem("push-prompt-dismissed")) setShowBanner(true);
      } catch (error) {
        console.error("[push nativo] No se pudo preparar el registro:", (error as Error).message);
      }
    })();

    return () => {
      montado = false;
      void Promise.all(soltar.map((s) => s())).catch(() => undefined);
    };
  }, []);

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
          saveSubscription(registration).catch(() => undefined);
        } else if (permission === "default") {
          const dismissed = localStorage.getItem("push-prompt-dismissed");
          if (!dismissed) setShowBanner(true);
        }
      })
      .catch(() => undefined);

    return cleanup;
  }, []);

  async function handleActivate() {
    setShowBanner(false);
    if (nativo) {
      try {
        const estado = await nativo.requestPermissions();
        if (estado.receive === "granted") await prepararYRegistrar(nativo);
      } catch (error) {
        console.error("[push nativo] No se pudo pedir el permiso:", (error as Error).message);
      }
      return;
    }
    if (!reg) return;
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        await saveSubscription(reg);
      }
    } catch {
      // push no soportado
    }
  }

  function handleDismiss() {
    setShowBanner(false);
    localStorage.setItem("push-prompt-dismissed", "1");
  }

  if (!showBanner) return null;

  return (
    // `data-transient`: ver UpdatePrompt. Depende del estado del navegador, no
    // del diseño, así que las pruebas visuales lo ocultan.
    <div data-transient className="fixed bottom-20 left-4 right-4 z-50 flex items-center gap-3 rounded-2xl border border-volt/30 bg-panel px-4 py-3 shadow-lg">
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
