// Service worker. Generated into public/sw.js by write-version.mjs with a new build id on every build.
//
// Why the app used to go stale: the old worker served cached HTML forever. This one never caches HTML.
// - Pages (navigations): network first, cached copy only when offline.
// - /_next/static/*: cached forever (file names change every build).
// - /api/* and /version.json: never touched.
// A new worker waits until the app says "reload" (the Update ready bar), then takes over.

const BUILD = "__BUILD__";
const STATIC = `static-${BUILD}`;
const PAGES = `pages-${BUILD}`;

self.addEventListener("install", () => {
  // Wait for the app to ask, so a reload never happens in the middle of typing.
});

self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== STATIC && k !== PAGES) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/agent/") || url.pathname === "/version.json") return;

  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(caches.open(STATIC).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }

  if (e.request.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const res = await fetch(e.request, { cache: "no-store" });
        if (res.ok) (await caches.open(PAGES)).put(e.request, res.clone());
        return res;
      } catch {
        return (await caches.match(e.request)) ?? (await caches.match("/")) ?? Response.error();
      }
    })());
  }
});

// ---------- push ----------
self.addEventListener("push", (e) => {
  const p = e.data ? e.data.json() : { title: "Kotatsu", body: "" };
  e.waitUntil((async () => {
    await self.registration.showNotification(p.title, {
      body: p.body,
      tag: p.tag,
      icon: p.icon || "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: p.url || "/", nudgeId: p.nudgeId },
      actions: p.actions || [],
      renotify: Boolean(p.tag),
    });
    if (typeof p.badge === "number" && self.navigator.setAppBadge) {
      p.badge > 0 ? self.navigator.setAppBadge(p.badge) : self.navigator.clearAppBadge();
    }
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const { url, nudgeId } = e.notification.data || {};
  e.waitUntil((async () => {
    let href = url || "/";
    // A button on the notification runs the nudge action without opening the app.
    if (e.action && nudgeId) {
      try {
        const token = await readToken();
        const r = await fetch(`/api/nudges/${nudgeId}/act`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ actionId: e.action }),
        });
        const j = await r.json();
        if (!j.href) return; // done in the background, nothing to open
        href = j.href;
      } catch { /* fall through and open the app */ }
    }
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) { await w.focus(); w.navigate(href); return; }
    await self.clients.openWindow(href);
  })());
});

// The app stores the device token in IndexedDB too, so the worker can use it.
function readToken() {
  return new Promise((resolve) => {
    const open = indexedDB.open("kotatsu", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("kv");
    open.onerror = () => resolve(null);
    open.onsuccess = () => {
      const tx = open.result.transaction("kv", "readonly");
      const g = tx.objectStore("kv").get("token");
      g.onsuccess = () => resolve(g.result || null);
      g.onerror = () => resolve(null);
    };
  });
}
