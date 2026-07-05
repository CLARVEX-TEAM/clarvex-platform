const CACHE_NAME = "clarvex-team-v7";
const CORE_ASSETS = ["/", "/login", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/api/")) return;
  if (event.request.mode === "navigate" && url.pathname !== "/" && url.pathname !== "/login") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/")))
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data = { title: "CLARVEX Team", body: "Tienes una nueva notificacion.", icon: "/icon-192.png", tag: "clarvex-notification", url: "/notificaciones" };
  try { data = { ...data, ...event.data.json() }; } catch (_) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || "/icon-192.png",
      badge: "/badge-72.png",
      tag: data.tag,
      data: { url: data.url || "/notificaciones" },
      renotify: true,
      vibrate: [200, 100, 200]
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
