"use client";
// Turn on notifications. On iPhone this only works once the app is on the Home Screen.

import { api } from "./api";

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function pushState(): NotificationPermission | "unsupported" {
  return pushSupported() ? Notification.permission : "unsupported";
}

export async function enablePush(): Promise<boolean> {
  if (!pushSupported()) return false;
  const { key, enabled } = await api.pushKey();
  if (!enabled) throw new Error("Push is not set up on this Mac yet. Run kotatsu vapid.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) }));
  await api.subscribe(sub.toJSON(), /iPhone|iPad/.test(navigator.userAgent) ? "iPhone" : navigator.platform || "Computer");
  return true;
}

function b64(s: string) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
