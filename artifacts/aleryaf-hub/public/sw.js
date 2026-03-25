self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  const title = payload.title || "ALERYAF";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/pwa-512.png",
    badge: "/pwa-192.png",
    image: payload.image || undefined,
    tag: payload.tag || "aleryaf-notification",
    dir: "rtl",
    lang: "ar",
    requireInteraction: false,
    renotify: false,
    data: {
      url: payload.url || "/",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});
