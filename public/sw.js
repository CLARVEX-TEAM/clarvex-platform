const CACHE_NAME = "clarvex-team-v14";
// Solo assets estáticos con nombre fijo. NUNCA se cachea HTML: un shell viejo
// apuntaría a chunks de JS ya borrados tras un deploy → pantalla en blanco.
const CORE_ASSETS = ["/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Navegaciones (HTML), RSC y chunks: SIEMPRE a la red. Así el HTML servido
  // referencia los chunks actuales del deploy vigente y nunca queda en blanco.
  if (event.request.mode === "navigate") return;
  if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/api/")) return;

  // Solo assets estáticos propios (íconos, manifest): cache-first con refresco
  // en segundo plano.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data = { title: "CLARVEX Team", body: "Tienes una nueva notificacion.", icon: "/icon-192.png", tag: "clarvex-notification", url: "/notificaciones" };
  try { data = { ...data, ...event.data.json() }; } catch (_) {}

  // URLs ABSOLUTAS: con rutas relativas, Android/Chrome a veces no resuelve el
  // ícono grande y muestra un monograma gris ("A"). Absolutas siempre cargan.
  const iconUrl = new URL(data.icon || "/icon-192.png", self.location.origin).href;
  const badgeUrl = new URL("/badge-72.png", self.location.origin).href;

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: iconUrl,
      badge: badgeUrl,
      tag: data.tag,
      data: { url: data.url || "/notificaciones" },
      // La venta en vivo se actualiza muchas veces al día: reemplaza la
      // anterior (mismo tag) sin sonar ni vibrar.
      renotify: !data.silencioso,
      silent: Boolean(data.silencioso),
      ...(data.silencioso ? {} : { vibrate: [200, 100, 200] })
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/notificaciones";
  const absolute = new URL(target, self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find((c) => c.url.startsWith(self.location.origin) && "focus" in c);
      if (existing) {
        return existing.focus().then((client) => {
          const focused = client || existing;
          if (focused && "navigate" in focused) {
            return focused.navigate(absolute).catch(() => focused);
          }
          return focused;
        });
      }
      return clients.openWindow(absolute);
    })
  );
});
