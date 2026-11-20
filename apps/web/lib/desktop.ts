// Inside the desktop app (Tauri), nudges show as Mac notifications through the notification plugin.
// On the phone, Web Push from the bridge does this instead.

import type { Nudge } from "@kotatsu/shared";

export const isDesktopApp = () => typeof window !== "undefined" && "__TAURI__" in window;

export async function desktopNotify(n: Nudge, agentName?: string, channelName?: string) {
  const t = (window as any).__TAURI__?.notification;
  if (!t) return;
  let ok = await t.isPermissionGranted();
  if (!ok) ok = (await t.requestPermission()) === "granted";
  if (ok) t.sendNotification({ title: `${agentName ?? "Agent"}${channelName ? `, ${channelName}` : ""}`, body: `${n.title}${n.body ? `. ${n.body}` : ""}` });
}
