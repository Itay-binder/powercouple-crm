/* eslint-disable no-undef */
/** Service Worker — Web Push ל־CRM. לא מחליף «התראות חירום» מדינתיות; כפוף להגדרות מערכת/דפדפן. */
self.addEventListener("push", (event) => {
  let data = {
    title: "Liftygo CRM",
    body: "",
    url: "/",
    tag: "crm",
    priority: "high",
    ts: Date.now(),
  };
  try {
    if (event.data) {
      const j = event.data.json();
      if (j && typeof j === "object") Object.assign(data, j);
    }
  } catch {
    /* ignore */
  }
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/";
  const baseTag = String(data.tag || "crm");
  const uniqueTag = `${baseTag}-${data.ts || Date.now()}`;
  const title = String(data.title || "CRM");
  const body = String(data.body || "");

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      /** נתיב אייקון מהאפליקציה (Next `app/icon.tsx`) — לא תלוי ב־favicon.ico */
      icon: "/icon",
      badge: "/icon",
      tag: uniqueTag,
      renotify: true,
      requireInteraction: true,
      silent: false,
      vibrate: [400, 120, 400, 120, 600],
      timestamp: typeof data.ts === "number" ? data.ts : Date.now(),
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url;
  const path = typeof raw === "string" && raw.startsWith("/") ? raw : "/";
  const target = self.location.origin + path;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const c of clientList) {
        if (c.url && "focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return Promise.resolve();
    })
  );
});
