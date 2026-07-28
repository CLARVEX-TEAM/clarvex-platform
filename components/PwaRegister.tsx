"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";

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

export function PwaRegister() {
  const [reg, setReg] = useState<ServiceWorkerRegistration | null>(null);
  const [showBanner, setShowBanner] = useState(false);

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
    if (!reg) return;
    setShowBanner(false);
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
