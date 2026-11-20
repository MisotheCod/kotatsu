"use client";
// Knows when a newer build is on the Mac, so the Update ready bar can show.
// Checks /version.json on open, on focus and every minute. Never cached (the bridge and the worker skip it).

import { useEffect, useState } from "react";
import { BRIDGE } from "./api";

export const BUILD = process.env.NEXT_PUBLIC_BUILD ?? "dev";
export const VERSION = process.env.NEXT_PUBLIC_VERSION ?? "0.0.0";

export function useUpdate() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch(`${BRIDGE}/version.json?t=${Date.now()}`, { cache: "no-store" });
        const v = await r.json();
        if (alive && v.build && v.build !== BUILD) {
          setReady(true);
          // If the app opened on an old build, take the new one once without asking. The flag stops a
          // reload loop in case the new build still disagrees.
          const key = "kotatsu.updated." + v.build;
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, "1");
            void applyUpdate();
          }
        }
      } catch {}
    };
    void check();
    const t = setInterval(check, 60_000);
    const onVis = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVis);

    // A new service worker installed in the background also means an update is ready.
    navigator.serviceWorker?.getRegistration().then((reg) => {
      if (!reg) return;
      if (reg.waiting) setReady(true);
      reg.addEventListener("updatefound", () => {
        reg.installing?.addEventListener("statechange", (e) => {
          if ((e.target as ServiceWorker).state === "installed" && navigator.serviceWorker.controller) setReady(true);
        });
      });
    });
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  return { ready, reload: applyUpdate };
}

export async function applyUpdate() {
  const reg = await navigator.serviceWorker?.getRegistration();
  if (reg?.waiting) {
    navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
    reg.waiting.postMessage("skipWaiting");
    setTimeout(() => location.reload(), 1500);
  } else {
    await reg?.update().catch(() => {});
    location.reload();
  }
}

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
  navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((reg) => {
    setInterval(() => reg.update().catch(() => {}), 60_000);
  });
}
