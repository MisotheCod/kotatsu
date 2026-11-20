// Pairing and tokens.
// - Devices (phone, desktop) pair once with a 6 digit code from `kotatsu pair`, then use a device token.
// - Agents and crons on this computer use the agent token for /agent/* and /api/crons/runs.
// Tokens are stored hashed. AUTH=off skips all of this for local dev.

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { db, kv, now } from "./db";
import { config } from "./config";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

export const auth = {
  /** Shown once by `kotatsu pair`. Valid 5 minutes, one use. */
  newPairCode(): string {
    const code = String(randomInt(100000, 1000000));
    kv.set("pair", { hash: hash(code), until: Date.now() + 5 * 60_000, tries: 0 });
    return code;
  },

  pair(code: string, name: string): string | null {
    const p = kv.get<{ hash: string; until: number; tries?: number } | null>("pair", null);
    if (!p || Date.now() > p.until) return null;
    // Five wrong guesses burns the code, so a six digit space cannot be walked through.
    const tries = (p.tries ?? 0) + 1;
    if (tries > 5) { kv.set("pair", null); return null; }
    kv.set("pair", { ...p, tries });
    const a = Buffer.from(p.hash), b = Buffer.from(hash(code.trim()));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    kv.set("pair", null);
    const token = randomBytes(32).toString("base64url");
    db.prepare(`INSERT INTO devices(token_hash,name,created_at) VALUES(?,?,?)`).run(hash(token), name || "Device", now());
    return token;
  },

  /** A device token without a code. Only ever called for a request proven to come from the desktop app. */
  createDevice(name: string): { token: string } {
    const token = randomBytes(32).toString("base64url");
    db.prepare(`INSERT INTO devices(token_hash,name,created_at) VALUES(?,?,?)`).run(hash(token), name || "Device", now());
    return { token };
  },

  device(token: string | undefined | null): string | null {
    if (!config.auth) return "dev";
    if (!token) return null;
    const r = db.prepare(`SELECT name FROM devices WHERE token_hash=?`).get(hash(token)) as { name: string } | undefined;
    if (!r) return null;
    db.prepare(`UPDATE devices SET last_seen_at=? WHERE token_hash=?`).run(now(), hash(token));
    return r.name;
  },

  devices: () => db.prepare(`SELECT substr(token_hash,1,12) as id, name, created_at as createdAt, last_seen_at as lastSeenAt FROM devices ORDER BY created_at`).all(),

  /** Removing a device takes its token out of the table, so the token stops working at once. */
  revokeDevice(id: string) {
    db.prepare(`DELETE FROM devices WHERE substr(token_hash,1,12)=?`).run(id);
  },

  /** The token agents and crons on this computer use. Made once and kept. */
  agentToken(): string {
    if (config.agentToken) return config.agentToken;
    let t = kv.get<string | null>("agentToken", null);
    if (!t) { t = randomBytes(24).toString("base64url"); kv.set("agentToken", t); }
    return t;
  },

  isAgent(token: string | undefined | null) {
    if (!config.auth) return true;
    return Boolean(token) && token === auth.agentToken();
  },
};

export function bearer(h: string | undefined | null) {
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}
