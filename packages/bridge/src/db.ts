// Storage. One SQLite file in the data folder.
// Most things are stored as JSON documents with a few indexed columns. Hermes and Claude keep their own
// session history; the bridge keeps the channel timeline so several agents can share one thread.

import Database from "better-sqlite3";
import { config } from "./config";

export const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS docs (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  scope TEXT,                 -- channel id, cron job slug, or null
  created_at TEXT NOT NULL,
  json TEXT NOT NULL,
  PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS docs_scope ON docs(kind, scope, created_at);
CREATE INDEX IF NOT EXISTS docs_created ON docs(kind, created_at);

CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- Which runtime session each agent uses in each channel. Created on first message.
CREATE TABLE IF NOT EXISTS sessions (
  channel_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  PRIMARY KEY (channel_id, agent_id)
);

CREATE TABLE IF NOT EXISTS devices (
  token_hash TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  device TEXT,
  created_at TEXT NOT NULL
);
`);

export type Kind =
  | "agent" | "channel" | "message" | "nudge" | "watch" | "cronjob" | "cronrun"
  | "metric" | "brief" | "approval" | "link";

const stmts = {
  put: db.prepare(`INSERT INTO docs(kind,id,scope,created_at,json) VALUES(@kind,@id,@scope,@created_at,@json)
                   ON CONFLICT(kind,id) DO UPDATE SET scope=excluded.scope, json=excluded.json, created_at=excluded.created_at`),
  get: db.prepare(`SELECT json FROM docs WHERE kind=? AND id=?`),
  del: db.prepare(`DELETE FROM docs WHERE kind=? AND id=?`),
  all: db.prepare(`SELECT json FROM docs WHERE kind=? ORDER BY created_at DESC LIMIT ?`),
  scoped: db.prepare(`SELECT json FROM docs WHERE kind=? AND scope=? ORDER BY created_at DESC LIMIT ?`),
  scopedBefore: db.prepare(`SELECT json FROM docs WHERE kind=? AND scope=? AND created_at < ? ORDER BY created_at DESC LIMIT ?`),
  since: db.prepare(`SELECT json FROM docs WHERE kind=? AND created_at >= ? ORDER BY created_at DESC`),
  search: db.prepare(`SELECT json FROM docs WHERE kind=? AND json LIKE ? ORDER BY created_at DESC LIMIT ?`),
  kvGet: db.prepare(`SELECT value FROM kv WHERE key=?`),
  kvSet: db.prepare(`INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`),
};

export const docs = {
  put<T extends { id?: string; createdAt?: string }>(kind: Kind, id: string, value: T, scope?: string | null) {
    stmts.put.run({ kind, id, scope: scope ?? null, created_at: value.createdAt ?? new Date().toISOString(), json: JSON.stringify(value) });
    return value;
  },
  get<T>(kind: Kind, id: string): T | undefined {
    const r = stmts.get.get(kind, id) as { json: string } | undefined;
    return r ? (JSON.parse(r.json) as T) : undefined;
  },
  del(kind: Kind, id: string) { stmts.del.run(kind, id); },
  all<T>(kind: Kind, limit = 500): T[] {
    return (stmts.all.all(kind, limit) as { json: string }[]).map((r) => JSON.parse(r.json));
  },
  scoped<T>(kind: Kind, scope: string, limit = 200, before?: string): T[] {
    const rows = before ? stmts.scopedBefore.all(kind, scope, before, limit) : stmts.scoped.all(kind, scope, limit);
    return (rows as { json: string }[]).map((r) => JSON.parse(r.json));
  },
  since<T>(kind: Kind, iso: string): T[] {
    return (stmts.since.all(kind, iso) as { json: string }[]).map((r) => JSON.parse(r.json));
  },
  search<T>(kind: Kind, q: string, limit = 20): T[] {
    return (stmts.search.all(kind, `%${q.replace(/[%_]/g, "")}%`, limit) as { json: string }[]).map((r) => JSON.parse(r.json));
  },
};

export const kv = {
  get<T>(key: string, fallback: T): T {
    const r = stmts.kvGet.get(key) as { value: string } | undefined;
    return r ? (JSON.parse(r.value) as T) : fallback;
  },
  set(key: string, value: unknown) { stmts.kvSet.run(key, JSON.stringify(value)); },
};

export const sessions = {
  get(channelId: string, agentId: string): string | undefined {
    const r = db.prepare(`SELECT session_id FROM sessions WHERE channel_id=? AND agent_id=?`).get(channelId, agentId) as { session_id: string } | undefined;
    return r?.session_id;
  },
  set(channelId: string, agentId: string, sessionId: string) {
    db.prepare(`INSERT INTO sessions(channel_id,agent_id,session_id) VALUES(?,?,?)
                ON CONFLICT(channel_id,agent_id) DO UPDATE SET session_id=excluded.session_id`).run(channelId, agentId, sessionId);
  },
  /** Forget the thread for this agent here, so the next turn starts a fresh session. */
  clear(channelId: string, agentId: string) {
    db.prepare(`DELETE FROM sessions WHERE channel_id=? AND agent_id=?`).run(channelId, agentId);
  },
};

/**
 * A reply that was still streaming when the process died would sit there as "Working" forever.
 * On boot, close those out honestly instead of leaving a phantom spinner in the thread.
 */
export function closeDanglingReplies() {
  const rows = db.prepare(`SELECT id, json FROM docs WHERE kind='message'`).all() as { id: string; json: string }[];
  let fixed = 0;
  for (const r of rows) {
    const m = JSON.parse(r.json);
    if (m.status !== "streaming") continue;
    m.status = "error";
    m.pending = false;
    m.text = m.text || "Interrupted when the bridge restarted. Send it again.";
    db.prepare(`UPDATE docs SET json=? WHERE kind='message' AND id=?`).run(JSON.stringify(m), r.id);
    fixed++;
  }
  return fixed;
}

export const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
export const now = () => new Date().toISOString();
