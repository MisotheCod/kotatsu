// Live updates. Every open app (phone, desktop) keeps one WebSocket at /api/live.
// Anything that changes is broadcast here, so screens never need a manual refresh.

import type { WebSocket } from "ws";
import type { LiveEvent } from "@kotatsu/shared";

const clients = new Set<WebSocket>();

export const live = {
  add(ws: WebSocket) {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
    ws.on("error", () => clients.delete(ws));
  },
  send(ev: LiveEvent) {
    const data = JSON.stringify(ev);
    for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(data);
  },
  count: () => clients.size,
};

// Keep connections alive through Tailscale Serve and phone sleep.
setInterval(() => {
  for (const ws of clients) if (ws.readyState === ws.OPEN) ws.ping();
}, 25_000).unref();
