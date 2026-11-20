import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
// Cron runs. Anything that runs on a schedule posts here: a shell job, a Hermes cron, a script.
// A failed run becomes a nudge. A run whose body matches the last one is marked quiet.

import type { ChannelPanel, CronJob, CronRun, Metric } from "@kotatsu/shared";
import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { docs, id, now } from "./db";
import { live } from "./live";
import { proactive } from "./proactive";
import { agents } from "./agents";

/**
 * The jobs Hermes actually schedules, read from its own store so the Crons screen can list a job
 * that has not run yet. The app never writes here: this is a read of ~/.hermes/cron/jobs.json.
 */
export function hermesJobs(): { slug: string; name: string; schedule: string; enabled: boolean; nextRunAt?: string; lastRunAt?: string }[] {
  try {
    const file = join(homedir(), ".hermes", "cron", "jobs.json");
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const list: any[] = Array.isArray(raw) ? raw : raw.jobs ?? [];
    return list.map((j) => {
      const prompt: string = j.prompt ?? "";
      const slug = /"job"\s*:\s*"([a-z0-9-]+)"/.exec(prompt)?.[1] ?? String(j.name ?? "job").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
      return {
        slug,
        name: String(j.name ?? slug),
        schedule: typeof j.schedule === "string" ? j.schedule
          : String(j.schedule?.display ?? j.schedule?.expr ?? j.cron ?? ""),
        enabled: Boolean(j.enabled),
        nextRunAt: j.next_run_at ?? j.nextRunAt,
        lastRunAt: j.last_run_at ?? j.lastRunAt,
      };
    }).filter((j) => j.enabled);
  } catch {
    return [];
  }
}

/**
 * Plain names and one line saying what each job does. The Hermes slugs are accurate and unreadable;
 * "weekly-creator-outreach-no-repeat-links" is not a name a person can scan.
 */
const DESCRIBE: Record<string, { short: string; what: string }> = {
  // A job that posts its own name and description needs nothing here.
};

/** Falls back to a cleaned up version of the slug, so a new job still reads like a name. */
export function describe(slug: string, name?: string) {
  const known = DESCRIBE[slug];
  if (known) return known;
  const base = (name && !/^[a-z0-9-]+$/.test(name) ? name : slug).replace(/[-_]+/g, " ");
  return { short: titleCase(base).replace(/\s+$/, "").slice(0, 26), what: "No description yet." };
}

export const crons = {
  jobs: () => docs.all<CronJob>("cronjob").sort((a, b) => (b.lastRunAt ?? "").localeCompare(a.lastRunAt ?? "")),
  job: (slug: string) => docs.get<CronJob>("cronjob", slug),

  runs(opts: { job?: string; unread?: boolean; failed?: boolean; favorite?: boolean; before?: string; limit?: number } = {}) {
    let list = opts.job ? docs.scoped<CronRun>("cronrun", opts.job, opts.limit ?? 250, opts.before) : docs.all<CronRun>("cronrun", opts.limit ?? 400);
    if (opts.unread) list = list.filter((r) => !r.read && !r.quiet);
    if (opts.failed) list = list.filter((r) => !r.ok);
    if (opts.favorite) list = list.filter((r) => r.favorite);
    return list;
  },
  run: (rid: string) => docs.get<CronRun>("cronrun", rid),

  ingest(input: { job: string; name?: string; title: string; body: string; image_url?: string; quiet?: boolean; ok?: boolean; channelId?: string; createdAt?: string }) {
    const prev = docs.scoped<CronRun>("cronrun", input.job, 1)[0];
    const job: CronJob = {
      ...(crons.job(input.job) ?? { slug: input.job, name: input.name ?? titleCase(input.job), failing: false }),
      ...(input.name ? { name: input.name } : {}),
      ...(input.channelId ? { channelId: input.channelId } : {}),
    };
    const ok = input.ok ?? true;
    const run: CronRun = {
      id: id("run"), job: input.job, title: input.title, body: input.body, imageUrl: input.image_url,
      quiet: input.quiet ?? (prev ? prev.body.trim() === input.body.trim() : false),
      ok, read: false, favorite: false, createdAt: input.createdAt ?? now(),
    };
    job.lastRunAt = run.createdAt;
    job.failing = !ok;
    docs.put("cronjob", job.slug, job as any);
    docs.put("cronrun", run.id, run as any, job.slug);
    live.send({ type: "cron", run, job });

    if (!ok) {
      proactive.nudge({
        agentId: agents.defaultId(), channelId: job.channelId, kind: "cron",
        title: `${job.name} failed`, body: input.title, why: "From your crons", dedupeKey: `cron-fail-${job.slug}-${run.createdAt.slice(0, 10)}`,
        actions: [
          { id: "fix", label: "Fix it", primary: true, do: { type: "send", channelId: job.channelId ?? `dm-${agents.defaultId()}`, text: `The ${job.name} cron failed: "${input.title}". Please fix it and rerun it.` } },
          { id: "see", label: "See run", do: { type: "open", href: `/crons/run?id=${run.id}` } },
        ],
      });
    }
    return run;
  },

  update(rid: string, patch: Partial<Pick<CronRun, "read" | "favorite">>) {
    const r = crons.run(rid);
    if (!r) return undefined;
    const next = { ...r, ...patch };
    docs.put("cronrun", rid, next as any, r.job);
    live.send({ type: "cron", run: next, job: crons.job(r.job)! });
    return next;
  },

  markAllRead() {
    for (const r of crons.runs({ unread: true, limit: 500 })) crons.update(r.id, { read: true });
  },
};

/**
 * A job's history as Hermes itself recorded it. The app only knows about runs that posted something,
 * so a job that runs quietly every day looks empty here. This reads the Mac's own session log so the
 * job page can show that it has been running, and when.
 */
/** Hermes titles a cron session with the job's own name, so match on that as well as the slug. */
function cleanTask(s: string) {
  return s
    .replace(/\[[^\]]*\]/g, " ")                                  // injected preamble
    .replace(/^\s*(You are running|IMPORTANT|The user has provided)[^.]*\./i, " ")
    .replace(/[#*_`>]+/g, " ")                                     // markdown noise
    .replace(/\s+/g, " ")
    .trim();
}

export function hermesHistory(slug: string, limit = 25, name?: string) {
  const file = join(homedir(), ".hermes/state.db");
  if (!existsSync(file)) return [];
  try {
    const db = new Database(file, { readonly: true, fileMustExist: true });
    const rows = db.prepare(
      `SELECT id, title, started_at, ended_at, message_count, archived
         FROM sessions
        WHERE created_source = 'cron' AND (title LIKE ? OR session_key LIKE ?)
        ORDER BY started_at DESC LIMIT ?`,
    ).all(`${slug}%`, `%${slug}%`, limit) as any[];
    const named = name && name !== slug
      ? db.prepare(
          `SELECT id, title, started_at, ended_at, message_count, archived
             FROM sessions
            WHERE created_source = 'cron' AND title LIKE ?
            ORDER BY started_at DESC LIMIT ?`,
        ).all(`${name}%`, limit) as any[]
      : [];
    const seenIds = new Set(rows.map((r) => r.id));
    for (const r of named) if (!seenIds.has(r.id)) { rows.push(r); seenIds.add(r.id); }
    rows.sort((a, b) => (b.started_at ?? 0) - (a.started_at ?? 0));
    const iso = (v: any) => (typeof v === "number" ? new Date(v * 1000).toISOString() : v ?? "");

    // A date and a message count say nothing about what happened. These two lines do.
    const firstUser = db.prepare(
      `SELECT content FROM messages WHERE session_id=? AND role='user' AND length(trim(content))>0 ORDER BY id ASC LIMIT 1`);
    const firstAgent = db.prepare(
      `SELECT content FROM messages WHERE session_id=? AND role='assistant' AND length(trim(content))>0 ORDER BY id ASC LIMIT 1`);
    const lastAgent = db.prepare(
      `SELECT content FROM messages WHERE session_id=? AND role='assistant' AND length(trim(content))>0 ORDER BY id DESC LIMIT 1`);
    const out = rows.map((r) => {
      let preview = "";
      let last = "";
      try {
        // What it was told, with the boilerplate peeled off. If that is empty, what it said first.
        // What it produced reads better than what it was told, and the boilerplate never shows.
        // Drop the tool warnings: they say nothing about what the job delivered.
        preview = cleanTask(String((firstAgent.get(r.id) as any)?.content ?? "")
          .split("\n").filter((l) => !/skill\(?s?\)? not found/i.test(l)).join(" ")).slice(0, 150)
          || cleanTask(String((firstUser.get(r.id) as any)?.content ?? "")).slice(0, 150);
        last = String((lastAgent.get(r.id) as any)?.content ?? "").replace(/\s+/g, " ").slice(0, 160);
      } catch { /* older rows may have no messages */ }
      return {
        id: r.id,
        title: r.title ?? slug,
        at: iso(r.started_at),
        endedAt: iso(r.ended_at),
        messages: r.message_count ?? 0,
        preview,
        last,
        failed: /\b(failed|error|could not)\b/i.test(last) && !/no (failures|errors)/i.test(last),
        tookMin: r.started_at && r.ended_at ? Math.max(1, Math.round(((typeof r.ended_at === "number" ? r.ended_at : Date.parse(r.ended_at) / 1000) - (typeof r.started_at === "number" ? r.started_at : Date.parse(r.started_at) / 1000)) / 60)) : undefined,
      };
    });
    db.close();
    db.close();
    return out.slice(0, limit);
  } catch {
    return [];
  }
}

/** One cron session, read only: what the agent actually did while the job ran. */
export function hermesSession(sid: string, limit = 120) {
  const file = join(homedir(), ".hermes/state.db");
  if (!existsSync(file)) return null;
  try {
    const db = new Database(file, { readonly: true, fileMustExist: true });
    const s = db.prepare(`SELECT id, title, started_at, ended_at, message_count FROM sessions WHERE id=?`).get(sid) as any;
    if (!s) { db.close(); return null; }
    const raw = db.prepare(
      `SELECT role, content, timestamp FROM messages WHERE session_id=? AND length(trim(content))>0 ORDER BY id ASC LIMIT ?`,
    ).all(sid, limit) as any[];
    // The cron preamble and the tool chatter are not the story. Keep what the job did.
    const messages = raw.filter((m) => !/^\s*\[IMPORTANT/.test(String(m.content))
      && !/^\s*<untrusted_tool_result/.test(String(m.content))
      && !/skill\(?s?\)? not found/i.test(String(m.content)));
    db.close();
    const iso = (v: any) => (typeof v === "number" ? new Date(v * 1000).toISOString() : v ?? "");
    return {
      id: s.id,
      title: s.title ?? sid,
      at: iso(s.started_at),
      endedAt: iso(s.ended_at),
      count: s.message_count ?? raw.length,
      messages: messages.map((m) => ({
        role: m.role === "user" ? "user" : m.role === "assistant" ? "agent" : "system",
        text: String(m.content).slice(0, 8000),
        at: iso(m.timestamp),
      })),
    };
  } catch {
    return null;
  }
}

export const metrics = {
  forChannel: (cid: string) => docs.scoped<Metric & { id: string }>("metric", cid, 50).reverse(), // first posted shows first and big
  put(m: Omit<Metric, "updatedAt">) {
    const prev = docs.get<{ createdAt?: string }>("metric", `${m.channelId}:${m.key}`);
    const full: Metric & { id: string; createdAt: string } = { ...m, id: `${m.channelId}:${m.key}`, updatedAt: now(), createdAt: prev?.createdAt ?? now(), points: m.points.slice(-90) };
    docs.put("metric", full.id, full as any, m.channelId);
    live.send({ type: "metric", metric: full });
    return full;
  },
  /** Add one point without resending the history. */
  add(cid: string, key: string, v: number, t = now()) {
    const cur = docs.get<Metric>("metric", `${cid}:${key}`);
    if (!cur) throw new Error(`Unknown metric ${cid}:${key}. Post the full metric first.`);
    return metrics.put({ ...cur, points: [...cur.points, { t, v }] });
  },
};

export function panel(cid: string): ChannelPanel | undefined {
  const channel = docs.get<ChannelPanel["channel"]>("channel", cid);
  if (!channel) return undefined;
  const jobs = crons.jobs().filter((j) => j.channelId === cid);
  const links = docs.scoped<ChannelPanel["links"][number] & { id: string; order?: number }>("link", cid, 20)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return {
    channel,
    metrics: metrics.forChannel(cid),
    crons: jobs.map((job) => ({ job, last: docs.scoped<CronRun>("cronrun", job.slug, 1)[0] })),
    links: links.map(({ title, url, sub, icon }) => ({ title, url, sub, icon })),
  };
}

function titleCase(s: string) {
  return s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
