// Web Push. iPhone delivers push only to web apps added to the Home Screen.
// The service worker (apps/web/public/sw.js) shows the notification, its buttons, and the icon count.

import webpush from "web-push";
import { config } from "./config";
import { db, now } from "./db";

const enabled = Boolean(config.vapid.publicKey && config.vapid.privateKey);
if (enabled) webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);

export interface PushPayload {
  title: string;
  body: string;
  url: string;            // page to open when tapped
  tag?: string;           // same tag replaces the earlier notification
  nudgeId?: string;
  actions?: { action: string; title: string }[]; // max 2 show on most devices
  badge?: number;         // count on the app icon
  icon?: string;
}

export const push = {
  enabled,
  publicKey: config.vapid.publicKey,

  subscribe(sub: webpush.PushSubscription, device?: string) {
    db.prepare(`INSERT INTO push_subs(endpoint,json,device,created_at) VALUES(?,?,?,?)
                ON CONFLICT(endpoint) DO UPDATE SET json=excluded.json, device=excluded.device`)
      .run(sub.endpoint, JSON.stringify(sub), device ?? null, now());
  },

  unsubscribe(endpoint: string) {
    db.prepare(`DELETE FROM push_subs WHERE endpoint=?`).run(endpoint);
  },

  async send(p: PushPayload) {
    if (!enabled) return;
    const subs = db.prepare(`SELECT endpoint, json FROM push_subs`).all() as { endpoint: string; json: string }[];
    if (!subs.length) { console.log("[push] no devices registered"); return; }
    let sent = 0;
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(JSON.parse(s.json), JSON.stringify(p), { TTL: 60 * 60 * 6, urgency: "high" });
        sent++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) push.unsubscribe(s.endpoint); // expired
        else console.warn("[push]", e?.statusCode ?? e);
      }
    }));
    console.log(`[push] ${p.title}: ${sent}/${subs.length} delivered`);
  },
};
