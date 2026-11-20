// The bridge. Runs at login (launchd) and listens on 127.0.0.1.
// Tailscale Serve points the tailnet address at it, so the phone and desktop reach one origin.

import { execFile, spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";
import type { IncomingMessage } from "node:http";
import { config } from "./config";
import { app, host } from "./http";
import { live } from "./live";
import { auth } from "./auth";
import { agents } from "./agents";
import { mirror } from "./mirror";
import { channels } from "./channels";
import { proactive } from "./proactive";
import { closeDanglingReplies, sessions } from "./db";
import { seed } from "./seed";
import { agentContext } from "./context";

const dangling = closeDanglingReplies();
if (dangling) console.log(`[bridge] closed ${dangling} interrupted replies`);
await agents.start();
// Every agent always has a direct chat. It is the one place that is never empty, and the
// seed only runs on a demo machine, so this has to happen here or Chats opens blank.
for (const agent of agents.list()) channels.direct(agent.id);
if (config.seed) seed();

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.bind }, (info) => {
  console.log(`[bridge] ${config.version} on http://${info.address}:${info.port}  agents: ${agents.list().map((a) => a.name).join(", ")}  auth: ${config.auth ? "on" : "OFF"}`);
});

// WebSocket for live updates. The token comes as ?token= because browsers cannot set headers on a WebSocket.
const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req: IncomingMessage, socket, head) => {
  const url = new URL(req.url ?? "/", "http://x");
  // A page open on this Mac itself needs no token. A phone still does.
  const fromHere = !req.headers["x-forwarded-for"] && !req.headers["x-real-ip"]
    && /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(String(req.socket.remoteAddress ?? ""));
  if (url.pathname !== "/api/live" || (!fromHere && !auth.device(url.searchParams.get("token")))) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => {
    live.add(ws);
    ws.send(JSON.stringify({ type: "hello", host: host() }));
    ws.send(JSON.stringify({ type: "running", running: channels.running() }));
  });
});

/**
 * The local voice service is a separate process holding two models in memory. The bridge starts it if
 * it is not already up, so voice works after a reboot without a second launchd job to remember.
 */
function startLocalVoice() {
  const url = process.env.LOCAL_VOICE_URL ?? "http://127.0.0.1:8791";
  const script = join(homedir(), "voice/server.py");
  const python = join(homedir(), "voice/.venv/bin/python");
  const up = async () => {
    try {
      const c = new AbortController();
      const timer = setTimeout(() => c.abort(), 700);
      const res = await fetch(`${url}/health`, { signal: c.signal });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  };
  void (async () => {
    if (await up()) return;
    if (!existsSync(python) || !existsSync(script)) {
      console.log("[voice] no local voice installed, using ElevenLabs");
      return;
    }
    const log = openSync("/tmp/local-voice.log", "a");
    const child = spawn(python, [script], { detached: true, stdio: ["ignore", log, log] });
    child.unref();
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (await up()) {
        console.log("[voice] local voice up");
        return;
      }
    }
    console.log("[voice] local voice did not start, using ElevenLabs");
  })();
}
startLocalVoice();

// Sessions that live in the Hermes desktop app can be read here too; this copies new lines across.
mirror.start();

// Real numbers into the panels: Stripe revenue per project, once a day just after the brief.
// Lives here rather than in a Hermes cron so it keeps running even if that store is rebuilt.
function startMetricSync() {
  const run = () => {
    execFile(process.execPath, ["scripts/sync-metrics.mjs"], { cwd: process.cwd() }, (err, _out, errOut) => {
      if (err) console.warn("[metrics] sync failed:", (errOut || err.message).slice(0, 200).split("\n")[0]);
    });
  };
  const at = new Date();
  const next = new Date(at);
  next.setHours(7, 30, 0, 0);
  if (next <= at) next.setDate(next.getDate() + 1);
  setTimeout(() => { run(); setInterval(run, 24 * 60 * 60 * 1000).unref?.(); }, next.getTime() - at.getTime()).unref?.();
}
startMetricSync();

// The scheduled check and morning brief run in a hidden session per agent, not in any channel.
proactive.startScheduler(async (agentId, prompt) => {
  const adapter = agents.adapter(agentId);
  const agent = agents.get(agentId);
  if (!adapter || !agent || !adapter.online()) return;
  const hidden = "_system";
  const res = await adapter.turn(
    { sessionId: sessions.get(hidden, agentId), channelId: hidden, text: prompt, context: agentContext(agent, { id: hidden, kind: "direct", name: "Scheduled checks", agentIds: [agentId], unread: 0, live: false, updatedAt: "" }) },
    { delta() {}, approval: async () => "reject" },
    new AbortController().signal,
  );
  sessions.set(hidden, agentId, res.sessionId);
});

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { server.close(); process.exit(0); });
