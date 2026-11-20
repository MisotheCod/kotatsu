// HTTP API and the web app files. One origin: Tailscale Serve points at this server.

import { Hono } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { cors } from "hono/cors";
import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import type { Agent, Card, Channel, Host, Metric, Nudge, SearchResults, Settings, WatchDraft } from "@kotatsu/shared";
import { config, isSetupDone, saveConfig } from "./config";
import { docs, id, kv, now, sessions } from "./db";
import { auth, bearer } from "./auth";
import { agents } from "./agents";
import { channels } from "./channels";
import { live } from "./live";
import { voice } from "./voice";
import { proactive, settings } from "./proactive";
import { agentContext, briefPrompt } from "./context";
import { crons, describe, hermesHistory, hermesJobs, hermesSession, metrics, panel } from "./crons";
import { claudeModels, openrouterModels } from "./models";
import { push } from "./push";
import { detectAgents } from "./detect";
import { ownerName, setOwnerName } from "./owner";

/** A stable id from a name, unique against the agents that already exist. */
function slugifyAgentId(name: string, taken: string[]) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "agent";
  let candidate = base;
  let n = 2;
  while (taken.includes(candidate)) candidate = `${base}-${n++}`;
  return candidate;
}

function labelFor(runtime: Agent["runtime"]) {
  return runtime === "hermes" ? "Hermes on this Mac"
    : runtime === "claude" ? "Claude Agent SDK"
    : runtime === "codex" ? "Codex on this Mac"
    : runtime === "http" ? "Connected by address"
    : "Demo agent";
}

const startedAt = now();
export const host = (): Host => ({ name: config.hostName, online: true, bridgeVersion: config.version, startedAt });

export const app = new Hono();

if (!config.auth || config.corsOrigin) app.use("/api/*", cors({ origin: config.corsOrigin, allowHeaders: ["Authorization", "Content-Type"] }));

// ---------- auth ----------
const open = new Set(["/api/host", "/api/pair", "/api/push/key"]);
/** True only for a request that came from this Mac itself, never through Tailscale. */
function isLoopback(c: any) {
  // Anything forwarded came through a proxy (Tailscale Serve), so it is not this Mac.
  if (c.req.header("x-forwarded-for") || c.req.header("x-real-ip")) return false;
  try {
    const addr = getConnInfo(c).remote.address ?? "";
    return /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(addr);
  } catch {
    return false;
  }
}

app.use("/api/*", async (c, next) => {
  if (open.has(c.req.path)) return next();
  // Setup and everything else open on the Mac itself. A phone still needs a pairing code.
  if (isLoopback(c)) return next();
  if (c.req.path === "/api/crons/runs" && c.req.method === "POST" && auth.isAgent(bearer(c.req.header("Authorization")))) return next();
  // The desktop app has no token yet; this one route hands it one, and it proves itself by user agent.
  if (c.req.path === "/api/desktop/token" || c.req.path === "/api/clientlog" || c.req.path.startsWith("/uploads/")) return next();
  if (!auth.device(bearer(c.req.header("Authorization")))) return c.json({ error: "Not paired" }, 401);
  return next();
});
app.use("/agent/*", async (c, next) => {
  // The agent token is for programs on this Mac only. A phone never carries it.
  if (!isLoopback(c)) return c.json({ error: "The agent token only works on this Mac" }, 403);
  if (!auth.isAgent(bearer(c.req.header("Authorization")))) return c.json({ error: "Bad agent token" }, 401);
  return next();
});

// ---------- host and pairing ----------
app.get("/api/host", (c) => c.json(host()));
/**
 * The desktop app runs on this same Mac. Rather than make a person read a code out of a window and type it
 * into another window, the app identifies itself in its user agent and gets a device token straight
 * away. A request that arrives through Tailscale is a different user agent, so a phone cannot use this.
 */
/**
 * Where the phone reports what broke. Voice only fails on a real device, so the app has to be able to
 * tell the Mac what happened instead of being described over a chat.
 */
/**
 * Pictures from the chat. The bytes land in the app's own folder on the Mac and the message carries a
 * link, so a photo is still there next month and the agent can open the file itself.
 */
app.post("/api/upload", async (c) => {
  const mime = (c.req.header("content-type") ?? "").split(";")[0].trim();
  if (!/^image\/(png|jpeg|jpg|webp|gif|heic|heif)$/.test(mime)) return c.json({ error: "That is not an image" }, 400);
  const buf = Buffer.from(await c.req.arrayBuffer());
  if (!buf.length) return c.json({ error: "Empty file" }, 400);
  if (buf.length > 12 * 1024 * 1024) return c.json({ error: "Images have to be under 12 MB" }, 413);
  const ext = mime.split("/")[1].replace("jpeg", "jpg");
  const file = `${id("img")}.${ext}`;
  const dir = join(config.dataDir, "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, file), buf);
  return c.json({ attachment: { id: file.split(".")[0], url: `/uploads/${file}`, mime, size: buf.length, name: c.req.header("x-filename") ?? file } });
});

app.post("/api/clientlog", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const line = `${new Date().toISOString()} ${c.req.header("user-agent")?.slice(0, 60) ?? ""} ${JSON.stringify(body).slice(0, 900)}\n`;
  await appendFile("/tmp/client.log", line).catch(() => {});
  return c.json({ ok: true });
});

app.get("/api/desktop/token", (c) => {
  const ua = c.req.header("user-agent") ?? "";
  const fromHere = (c.req.header("x-forwarded-for") ?? "").length === 0;
  if (!fromHere || !ua.includes("KotatsuDesktop")) return c.json({ error: "Not the desktop app" }, 403);
  const { token } = auth.createDevice("Kotatsu on this Mac");
  return c.json({ token });
});

app.post("/api/pair", async (c) => {
  const { code, name } = await c.req.json<{ code: string; name?: string }>();
  const token = auth.pair(code, name ?? "Phone");
  return token ? c.json({ token }) : c.json({ error: "That code did not work. Run kotatsu pair for a new one." }, 400);
});

// ---------- push ----------
app.get("/api/push/key", (c) => c.json({ key: push.publicKey, enabled: push.enabled }));
app.post("/api/push/subscribe", async (c) => {
  const { subscription, device } = await c.req.json();
  push.subscribe(subscription, device);
  return c.json({ ok: true });
});
app.delete("/api/push/subscribe", async (c) => {
  const { endpoint } = await c.req.json();
  push.unsubscribe(endpoint);
  return c.json({ ok: true });
});

// ---------- home ----------
/** Rewrite the brief now. Used when the one from this morning has gone stale. */
/** Clears the brief until the next one is written. */
app.post("/api/brief/dismiss", async (c) => {
  const b = proactive.brief();
  if (b) proactive.dismissBrief((b as any).id);
  return c.json({ ok: true });
});

app.post("/api/brief/refresh", async (c) => {
  const agent = agents.default();
  if (!agent) return c.json({ error: "No agent" }, 400);
  const adapter = agents.adapter(agent.id);
  if (!adapter?.online()) return c.json({ error: "That agent is not connected" }, 503);
  const hidden = "_system";
  const res = await adapter.turn(
    { sessionId: sessions.get(hidden, agent.id), channelId: hidden, text: briefPrompt(), context: agentContext(agent, { id: hidden, kind: "direct", name: "Scheduled checks", agentIds: [agent.id], unread: 0, live: false, updatedAt: "" }) },
    { delta() {}, approval: async () => "reject" },
    new AbortController().signal,
  );
  sessions.set(hidden, agent.id, res.sessionId);
  return c.json({ ok: true, brief: proactive.brief() });
});

/** Pictures are served without a token: they are only reachable on the tailnet, and <img> cannot carry one. */
app.get("/uploads/:file", async (c) => {
  const file = c.req.param("file").replace(/[^a-zA-Z0-9._-]/g, "");
  try {
    const buf = await readFile(join(config.dataDir, "uploads", file));
    const type = file.endsWith(".png") ? "image/png" : file.endsWith(".webp") ? "image/webp" : file.endsWith(".gif") ? "image/gif" : "image/jpeg";
    return new Response(buf, { headers: { "content-type": type, "cache-control": "private, max-age=31536000" } });
  } catch {
    return c.json({ error: "No such picture" }, 404);
  }
});

app.get("/api/home", (c) => c.json(proactive.home(channels.running())));

// ---------- agents ----------
app.get("/api/agents", (c) => c.json(agents.list()));

/**
 * What is actually on this Mac. Every row says ready, or the one thing standing in the way,
 * so the app can say "Run claude once to sign in" instead of failing later.
 */
app.get("/api/agents/detect", (c) => c.json(detectAgents()));

/** Adds an agent while the bridge runs. Its adapter starts immediately, no restart. */
app.post("/api/agents", async (c) => {
  const b = await c.req.json<Partial<Agent> & { name: string; runtime: Agent["runtime"] }>();
  if (!b?.name?.trim() || !b?.runtime) return c.json({ error: "A name and a kind are needed" }, 400);
  const id = slugifyAgentId(b.name, agents.list().map((a) => a.id));
  const agent: Agent = {
    id,
    name: b.name.trim(),
    face: (b.face as Agent["face"]) ?? "fox",
    voice: b.voice ?? "Calm, warm",
    goodAt: b.goodAt ?? [],
    runtime: b.runtime,
    runtimeLabel: b.runtimeLabel ?? labelFor(b.runtime),
    isDefault: Boolean(b.isDefault) || agents.list().length === 0,
    online: false,
    model: b.model,
    workspace: b.workspace,
    config: b.config ?? {},
  };
  const saved = await agents.add(agent);
  // A new agent joins Direct, and the projects the user picked.
  channels.direct(id);
  for (const cid of (b as any).channelIds ?? []) {
    const ch = channels.get(cid);
    if (ch && !ch.agentIds.includes(id)) channels.save({ ...ch, agentIds: [...ch.agentIds, id] });
  }
  return c.json(saved);
});

app.patch("/api/agents/:id", async (c) => {
  const id = c.req.param("id");
  const patch = await c.req.json<Partial<Agent>>();
  const a = agents.update(id, patch);
  if (!a) return c.json({ error: "No such agent" }, 404);
  if (patch.config || patch.runtime) await agents.restart(id);
  return c.json(agents.get(id));
});

app.post("/api/agents/:id/pause", async (c) => {
  const { paused } = await c.req.json<{ paused: boolean }>();
  const a = await agents.pause(c.req.param("id"), Boolean(paused));
  return a ? c.json(a) : c.json({ error: "No such agent" }, 404);
});

app.delete("/api/agents/:id", async (c) => {
  const id = c.req.param("id");
  if (!agents.get(id)) return c.json({ error: "No such agent" }, 404);
  await agents.remove(id);
  return c.json({ ok: true });
});

/** The name the person gave, used in greetings and in what agents are told. */
app.post("/api/owner", async (c) => {
  const { name } = await c.req.json<{ name: string }>();
  setOwnerName(String(name ?? ""));
  saveConfig({ ownerName: String(name ?? "").trim() });
  return c.json({ ok: true, name: ownerName() });
});

/** First run setup: one call, then the app reloads into Home. */
app.post("/api/setup", async (c) => {
  const b = await c.req.json<{
    name?: string; defaultAgentId?: string; agentId?: string;
    projects?: { name: string; color?: string }[];
    settings?: Partial<Settings>;
    connections?: string[];
  }>();
  if (b.name) { setOwnerName(b.name); saveConfig({ ownerName: b.name.trim() }); }
  if (b.defaultAgentId && agents.get(b.defaultAgentId)) agents.update(b.defaultAgentId, { isDefault: true });
  if (agents.get(b.agentId ?? "") === undefined && b.agentId) agents.update(b.agentId, { isDefault: true });
  for (const p of b.projects ?? []) if (p.name?.trim()) channels.create({ name: p.name.trim(), kind: "project", color: p.color });
  if (b.settings) settings.set(b.settings);
  if (b.connections?.length) kv.set("laterConnections", b.connections);
  saveConfig({ setupDone: true });
  return c.json({ ok: true });
});

app.get("/api/setup/state", (c) => c.json({
  done: isSetupDone(),
  ownerName: ownerName(),
  agents: agents.list(),
  projects: channels.list().filter((x) => x.kind === "project").length,
  later: kv.get<string[]>("laterConnections", []),
}));

// ---------- channels ----------
app.get("/api/channels", (c) => c.json(channels.list()));
app.post("/api/channels", async (c) => {
  const b = await c.req.json<{ name: string; kind?: Channel["kind"]; logo?: string; color?: string; text?: string; agentId?: string }>();
  const ch = channels.create({ name: b.name, kind: b.kind ?? "project", logo: b.logo, color: b.color });
  if (b.text) channels.send(ch.id, b.text, { agentId: b.agentId });
  return c.json(ch);
});
/**
 * Choose the model a chat talks to. Hermes pins the model when a session is created, so switching
 * starts a fresh session for that agent in this channel; the old thread is left untouched in Hermes.
 */
// ---------- voice ----------
/** Text to speech for one agent. Streamed back as mp3. */
app.post("/api/voice/speak", async (c) => {
  const { text, agentId } = await c.req.json<{ text: string; agentId?: string }>();
  if (!voice.ready()) return c.json({ error: "Voice is not set up on this Mac" }, 503);
  if (!text?.trim()) return c.json({ error: "No text" }, 400);
  const agent = agentId ? agents.get(agentId) : undefined;
  try {
    const stream = await voice.speak(text, agent?.voiceId, agent?.voiceLocal, (agent as any)?.voiceMode);
    return new Response(stream, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
  } catch (e: any) {
    return c.json({ error: e.message ?? "Voice failed" }, 502);
  }
});

/** Speech to text. The screen posts whatever the mic recorded. */
app.post("/api/voice/transcribe", async (c) => {
  if (!voice.ready()) return c.json({ error: "Voice is not set up on this Mac" }, 503);
  const buf = await c.req.arrayBuffer();
  if (!buf.byteLength) return c.json({ error: "No audio" }, 400);
  try {
    const text = await voice.transcribe(buf, c.req.header("content-type") ?? "audio/webm");
    return c.json({ text });
  } catch (e: any) {
    return c.json({ error: e.message ?? "Could not hear that" }, 502);
  }
});

app.get("/api/voice/status", (c) => c.json({ ready: voice.ready() }));

app.post("/api/channels/:id/model", async (c) => {
  const { agentId, model } = await c.req.json<{ agentId: string; model: string }>();
  const ch = channels.get(c.req.param("id"));
  if (!ch || !agentId) return c.json({ error: "No such channel" }, 404);
  channels.save({ ...ch, models: { ...(ch.models ?? {}), [agentId]: model } });
  sessions.clear(ch.id, agentId);
  const fresh = channels.get(ch.id)!;
  live.send({ type: "channel", channel: fresh });
  return c.json({ ok: true, models: fresh.models });
});

/** The models each agent can run on. */
/** Everything each agent can be switched to. The OpenRouter list is a live catalogue. */
app.get("/api/models", async (c) => c.json({
  openrouter: await openrouterModels(),
  claude: claudeModels,
}));

app.post("/api/direct/:agentId", (c) => c.json(channels.direct(c.req.param("agentId"))));
app.get("/api/channels/:id", (c) => {
  const ch = channels.get(c.req.param("id"));
  return ch ? c.json(ch) : c.json({ error: "No such channel" }, 404);
});
app.patch("/api/channels/:id", async (c) => {
  const ch = channels.get(c.req.param("id"));
  if (!ch) return c.json({ error: "No such channel" }, 404);
  const b = await c.req.json<Partial<Pick<Channel, "name" | "logo" | "color" | "archived" | "agentIds" | "description" | "defaultAgentId">>>();
  return c.json(channels.save({ ...ch, ...b }));
});
app.get("/api/channels/:id/messages", (c) => c.json(channels.messages(c.req.param("id"), c.req.query("before"))));
app.post("/api/channels/:id/messages", async (c) => {
  const { text, agentId, attachments } = await c.req.json<{ text: string; agentId?: string; attachments?: any[] }>();
  if (!text?.trim() && !attachments?.length) return c.json({ error: "Empty message" }, 400);
  return c.json(channels.send(c.req.param("id"), text?.trim() ?? "", { agentId, attachments }));
});
app.post("/api/channels/:id/read", (c) => { channels.markRead(c.req.param("id")); return c.json({ ok: true }); });
app.post("/api/channels/:id/stop", (c) => { channels.stop(c.req.param("id")); return c.json({ ok: true }); });
app.get("/api/channels/:id/panel", (c) => {
  const p = panel(c.req.param("id"));
  return p ? c.json(p) : c.json({ error: "No such channel" }, 404);
});

// Cards on messages. Today only the watch offer has a server side effect.
app.post("/api/messages/:id/cards/:i", async (c) => {
  const { state } = await c.req.json<{ state: "accepted" | "declined" }>();
  const m = docs.get<{ cards?: Card[] }>("message", c.req.param("id"));
  const i = Number(c.req.param("i"));
  const card = m?.cards?.[i];
  if (!card || card.type !== "watchOffer") return c.json({ error: "No such card" }, 404);
  if (state === "accepted") proactive.addWatch(card.draft);
  channels.updateCard(c.req.param("id"), i, { ...card, state });
  return c.json({ ok: true });
});

// ---------- approvals ----------
app.post("/api/approvals/:id", async (c) => {
  const { decision } = await c.req.json<{ decision: "approve" | "reject" }>();
  try { return c.json(channels.decide(c.req.param("id"), decision)); }
  catch (e: any) { return c.json({ error: e.message }, 404); }
});

// ---------- nudges ----------
/** A reminder that a person or an agent wants on Today. Same pipeline as any other nudge: capped, deduped, pushed. */
app.post("/api/nudges", async (c) => {
  const b = await c.req.json<{ title: string; body?: string; why?: string; agentId?: string; urgent?: boolean; hours?: number }>();
  if (!b?.title?.trim()) return c.json({ error: "A nudge needs a title" }, 400);
  const n = proactive.nudge({
    agentId: (b.agentId as any) ?? agents.defaultId(),
    kind: "reminder",
    title: b.title.trim(),
    body: b.body,
    why: b.why ?? "asked for directly",
    actions: [{ id: "open", label: "Open", primary: true, do: { type: "open", href: "/" } }],
    dedupeKey: `manual-${b.title.trim().toLowerCase().slice(0, 40)}`,
    urgent: b.urgent,
  });
  if (!n) return c.json({ error: "Already open, or the daily cap is reached" }, 409);
  return c.json(n);
});

app.post("/api/nudges/:id", async (c) => {
  const { state, snoozeUntil } = await c.req.json<{ state: Nudge["state"]; snoozeUntil?: string }>();
  const n = proactive.setNudge(c.req.param("id"), state, snoozeUntil);
  return n ? c.json(n) : c.json({ error: "No such nudge" }, 404);
});
/** Runs a nudge button. Also used by notification buttons from the service worker. */
/**
 * A finished job, written into a channel as a card: what changed, how it was checked, what is still
 * unproven. It exists so a person can audit a night of work without reading a transcript.
 */
app.post("/api/report", async (c) => {
  const body = await c.req.json<{ channelId?: string; title: string; changed?: string[]; verified?: string[]; unproven?: string[] }>();
  const channelId = body.channelId ?? (agents.defaultId() ? `dm-${agents.defaultId()}` : "");
  const agent = agents.default();
  if (!agent) return c.json({ error: "No agent" }, 400);
  const m = {
    id: id("msg"),
    channelId,
    author: { kind: "agent" as const, agentId: agent.id },
    text: "",
    mentions: [],
    cards: [{ type: "report" as const, title: body.title, changed: body.changed ?? [], verified: body.verified ?? [], unproven: body.unproven ?? [] }],
    status: "done" as const,
    createdAt: now(),
  };
  channels.putMessage(m);
  return c.json({ ok: true, id: m.id });
});

app.post("/api/nudges/:id/act", async (c) => {
  const { actionId } = await c.req.json<{ actionId: string }>();
  const n = docs.get<Nudge>("nudge", c.req.param("id"));
  if (!n) return c.json({ error: "No such nudge" }, 404);
  // "Later" is not a stored action, it is a delay: the card comes back, it does not disappear.
  if (actionId.startsWith("snooze-")) {
    const hours = Number(actionId.slice(7)) || 6;
    docs.put("nudge", n.id, { ...n, state: "snoozed", snoozeUntil: new Date(Date.now() + hours * 3600_000).toISOString() } as any);
    return c.json({ ok: true });
  }
  const a = n.actions.find((x) => x.id === actionId);
  if (!a) return c.json({ error: "No such action" }, 404);
  let href: string | undefined;
  switch (a.do.type) {
    case "send": channels.send(a.do.channelId, a.do.text, { agentId: a.do.agentId }); href = `/c?id=${a.do.channelId}`; break;
    case "approve": try { channels.decide(a.do.approvalId, a.do.decision); } catch {} break;
    case "watch": proactive.addWatch(a.do.watch); break;
    case "open": href = a.do.href; break;
    case "snooze": {
      docs.put("nudge", n.id, { ...n, state: "snoozed", snoozeUntil: new Date(Date.now() + a.do.hours * 3600_000).toISOString() } as any);
      return c.json({ ok: true });
    }
    case "dismiss": break;
  }
  proactive.setNudge(n.id, a.do.type === "dismiss" ? "dismissed" : "done");
  return c.json({ ok: true, href });
});

// ---------- watches ----------
app.get("/api/watches", (c) => c.json(proactive.watches()));
app.post("/api/watches", async (c) => c.json(proactive.addWatch(await c.req.json<WatchDraft>())));
app.patch("/api/watches/:id", async (c) => {
  const w = docs.get<any>("watch", c.req.param("id"));
  if (!w) return c.json({ error: "No such watch" }, 404);
  return c.json(proactive.saveWatch({ ...w, ...(await c.req.json()) }));
});

// ---------- crons ----------
app.get("/api/crons/jobs", (c) => {
  // Every job Hermes schedules, with the app's own record merged on top, so a job that has not
  // run yet still appears. Read only: the app never writes to the Hermes store.
  const stored = crons.jobs();
  const byslug = new Map(hermesJobs().map((j) => [j.slug, j]));
  // a job that has posted keeps its own record, but borrows the schedule Hermes knows
  const posted = stored.map((j) => ({ ...j, schedule: byslug.get(j.slug)?.schedule ?? j.schedule }));
  const seen = new Set(posted.map((j) => j.slug));
  const scheduled = [...byslug.values()].filter((j) => !seen.has(j.slug))
    .map((j) => ({ slug: j.slug, name: j.name, schedule: j.schedule, scheduled: true, failing: false, lastRunAt: j.lastRunAt }));
  c.header("cache-control", "no-store");
  // Every job carries a name a person can read and one line saying what it does.
  return c.json([...posted, ...scheduled].map((j) => ({ ...j, ...describe(j.slug, j.name) })));
});
app.get("/api/crons/runs", (c) => c.json(crons.runs({
  job: c.req.query("job"), unread: c.req.query("unread") === "1", failed: c.req.query("failed") === "1",
  favorite: c.req.query("favorite") === "1", before: c.req.query("before"),
})));
/** What Hermes itself recorded for a job, so a quiet job still shows its history. */
app.get("/api/crons/jobs/:slug/history", (c) => {
  const slug = c.req.param("slug");
  const name = crons.job(slug)?.name ?? describe(slug).short;
  return c.json(hermesHistory(slug, 25, name));
});
/** The transcript behind one cron session, so a session row is not a dead end. */
app.get("/api/sessions/:id", (c) => {
  const s = hermesSession(c.req.param("id"));
  return s ? c.json(s) : c.json({ error: "No such session" }, 404);
});

app.get("/api/crons/runs/:id", (c) => {
  const r = crons.run(c.req.param("id"));
  return r ? c.json({ run: r, job: crons.job(r.job) }) : c.json({ error: "No such run" }, 404);
});
app.patch("/api/crons/runs/:id", async (c) => {
  const r = crons.update(c.req.param("id"), await c.req.json());
  return r ? c.json(r) : c.json({ error: "No such run" }, 404);
});
app.post("/api/crons/read-all", (c) => { crons.markAllRead(); return c.json({ ok: true }); });
app.post("/api/crons/runs", async (c) => c.json(crons.ingest(await c.req.json())));

// ---------- settings and search ----------
app.get("/api/settings", (c) => c.json({ ...settings.get(), devices: auth.devices() }));
app.delete("/api/devices/:id", (c) => { auth.revokeDevice(c.req.param("id")); return c.json({ ok: true }); });
app.patch("/api/settings", async (c) => c.json(settings.set(await c.req.json())));

app.get("/api/search", (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2) return c.json({ channels: [], runs: [], watches: [] } satisfies SearchResults);
  const byChannel = new Map<string, { snippet: string; at: string }>();
  for (const m of docs.search<any>("message", q, 40)) if (!byChannel.has(m.channelId)) byChannel.set(m.channelId, { snippet: m.text.slice(0, 160), at: m.createdAt });
  for (const ch of channels.list()) if (ch.name.toLowerCase().includes(q.toLowerCase()) && !byChannel.has(ch.id)) byChannel.set(ch.id, { snippet: ch.lastMessage?.text ?? "", at: ch.updatedAt });
  const res: SearchResults = {
    channels: [...byChannel].map(([cid, v]) => ({ channel: channels.get(cid)!, ...v })).filter((x) => x.channel),
    runs: docs.search<any>("cronrun", q, 20).map((run) => ({ run, job: crons.job(run.job)! })).filter((x) => x.job),
    watches: proactive.watches().filter((w) => `${w.title} ${w.query}`.toLowerCase().includes(q.toLowerCase())),
  };
  return c.json(res);
});

// ---------- tools for agents and crons on this computer ----------
app.post("/agent/nudges", async (c) => {
  const b = await c.req.json<any>();
  const agentId = b.agentId ?? agents.defaultId();
  const actions = (b.actions ?? []).map((a: any, i: number) => ({ id: a.id ?? `a${i}`, label: a.label, primary: a.primary ?? i === 0, do: a.do ?? { type: "dismiss" } }));
  if (!actions.some((a: any) => a.do.type === "dismiss")) actions.push({ id: "later", label: "Not now", do: { type: "dismiss" } });
  const n = proactive.nudge({ agentId, channelId: b.channelId, kind: b.kind ?? "reminder", title: b.title, body: b.body, why: b.why ?? "",
    actions, watchId: b.watchId, dedupeKey: b.dedupeKey, urgent: false });
  return c.json(n ?? { skipped: true });
});
app.post("/agent/watches", async (c) => {
  const b = await c.req.json<any>();
  return c.json(proactive.addWatch({ agentId: b.agentId ?? agents.defaultId(), channelId: b.channelId, title: b.title, query: b.query, cadence: b.cadence ?? "hourly" }));
});
app.post("/agent/metrics", async (c) => c.json(metrics.put(await c.req.json<Omit<Metric, "updatedAt">>())));
app.post("/agent/metrics/:cid/:key", async (c) => {
  const { v, t } = await c.req.json<{ v: number; t?: string }>();
  try { return c.json(metrics.add(c.req.param("cid"), c.req.param("key"), v, t)); }
  catch (e: any) { return c.json({ error: e.message }, 400); }
});
app.post("/agent/brief", async (c) => {
  const b = await c.req.json<any>();
  return c.json(proactive.setBrief({ agentId: b.agentId ?? agents.defaultId(), text: b.text, stats: b.stats ?? [] }));
});
app.post("/agent/links", async (c) => {
  const b = await c.req.json<{ channelId: string; title: string; url: string; sub?: string; icon?: string; order?: number }>();
  const lid = id("lnk");
  return c.json(docs.put("link", lid, { ...b, id: lid, icon: b.icon ?? "link", createdAt: now() } as any, b.channelId));
});
app.post("/agent/channels", async (c) => {
  const b = await c.req.json<any>();
  return c.json(channels.create({ name: b.name, kind: b.kind ?? "project", logo: b.logo, color: b.color, description: b.description, id: b.id }));
});

// ---------- web app files ----------
// HTML, the service worker and version.json are never cached, so a new build shows up on the next open.
// Hashed files under /_next/static are cached forever.
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain",
};
app.get("*", async (c) => {
  const path = decodeURIComponent(new URL(c.req.url).pathname);
  if (path.startsWith("/api/") || path.startsWith("/agent/")) return c.json({ error: "Not found" }, 404);
  const safe = normalize(path).replace(/^(\.\.[/\\])+/, "");
  const candidates = [join(config.webDir, safe), join(config.webDir, safe, "index.html"), join(config.webDir, `${safe}.html`)];
  for (const f of candidates) {
    try {
      if (!(await stat(f)).isFile()) continue;
      const ext = extname(f);
      const immutable = safe.startsWith("/_next/static/");
      return new Response(await readFile(f), {
        headers: {
          "Content-Type": TYPES[ext] ?? "application/octet-stream",
          "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache, no-store, must-revalidate",
          ...(safe === "/sw.js" ? { "Service-Worker-Allowed": "/" } : {}),
        },
      });
    } catch { /* try next */ }
  }
  try {
    return new Response(await readFile(join(config.webDir, "404.html")), { status: 404, headers: { "Content-Type": TYPES[".html"], "Cache-Control": "no-cache" } });
  } catch {
    return c.text("The web app is not built yet. Run npm run build in the repo.", 404);
  }
});
