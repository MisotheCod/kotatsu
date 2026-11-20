// Mirrors a Hermes session that lives somewhere else (the desktop app, the terminal) into a Kotatsu
// channel, so the same conversation can be read here. It reads the Mac's own message log every few
// seconds rather than hooking the gateway, which keeps it simple and cannot double write: each Hermes
// message is copied once, keyed by its own id.
import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Message } from "@kotatsu/shared";
import { channels } from "./channels";
import { db, kv } from "./db";

const HERMES_DB = join(homedir(), ".hermes/state.db");

interface Cursor { [channelId: string]: number }

function hermesDb() {
  if (!existsSync(HERMES_DB)) return null;
  try {
    return new Database(HERMES_DB, { readonly: true, fileMustExist: true });
  } catch {
    return null;
  }
}

export const mirror = {
  /** One pass. Exposed so it can be run by hand when testing. */
  pass() {
    const list = channels.list().filter((c) => c.mirror);
    if (!list.length) return 0;
    const h = hermesDb();
    if (!h) return 0;
    const cursors = kv.get<Cursor>("mirror", {});
    let added = 0;

    for (const channel of list) {
      const row = db
        .prepare(`SELECT session_id FROM sessions WHERE channel_id=? AND agent_id=?`)
        .get(channel.id, channel.agentIds[0]) as { session_id: string } | undefined;
      if (!row?.session_id) continue;

      const since = cursors[channel.id] ?? 0;
      let rows: any[] = [];
      try {
        rows = h
          .prepare(
            `SELECT id, role, content, timestamp FROM messages
              WHERE session_id=? AND role IN ('user','assistant') AND id>? AND length(trim(content))>0
              ORDER BY id ASC LIMIT 600`,
          )
          .all(row.session_id, since);
      } catch {
        continue;
      }
      if (!rows.length) continue;

      for (const r of rows) {
        const id = `msg_h_${r.id}`;
        if (db.prepare(`SELECT 1 FROM docs WHERE kind='message' AND id=?`).get(id)) continue;
        const author = r.role === "user"
          ? ({ kind: "user" } as const)
          : ({ kind: "agent", agentId: channel.agentIds[0] } as const);
        const m: Message = {
          id,
          channelId: channel.id,
          author,
          text: String(r.content).slice(0, 6000),
          mentions: [],
          status: "done",
          createdAt: new Date((r.timestamp ?? Date.now() / 1000) * 1000).toISOString(),
        };
        // A reply that lands while he is elsewhere should show as unread in the app.
        channels.putMessage(m, r.role === "agent");
        added++;
      }
      cursors[channel.id] = rows[rows.length - 1].id;
    }

    if (added) {
      kv.set("mirror", cursors);
      for (const c of list) {
        const last = channels.messages(c.id, undefined, 1)[0];
        if (last) channels.save({ ...c, updatedAt: last.createdAt });
      }
    } else if (Object.keys(cursors).length) {
      kv.set("mirror", cursors);
    }
    h.close();
    return added;
  },

  start(intervalMs = 12_000) {
    setInterval(() => {
      try {
        this.pass();
      } catch (e: any) {
        console.warn("[mirror]", e?.message ?? e);
      }
    }, intervalMs).unref?.();
  },
};
