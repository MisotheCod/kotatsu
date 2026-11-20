// An agent through Hermes (`hermes serve` on 127.0.0.1:9120, tui_gateway JSON-RPC).
//
// Ported from the old bridge's gateway client, which is proven against the real
// serve. Every name below was read off the running gateway, not guessed:
//   session.create -> { session_id (live), stored_session_id }
//   session.resume -> { session_id (live) }        reattach before the next prompt
//   prompt.submit  -> { session_id: live, text }
//   session.interrupt
// Events arrive as { method: "event", params: { type, session_id, payload } }:
//   message.delta    payload.text is the CHUNK (not the whole reply)
//   message.complete payload.text is the whole reply
//   approval.request payload has prompt_id + execution_generation + command
// Hermes stays the owner of sessions and approvals; this only relays.

import type { AgentAdapter, TurnHandlers, TurnInput, TurnResult } from "./types";
import { config } from "../config";
import WebSocket from "ws";
import { execFileSync } from "node:child_process";

const RPC = {
  createSession: "session.create",
  resume: "session.resume",
  send: "prompt.submit",
  approve: "approval.respond",
  interrupt: "session.interrupt",
  capabilities: "client.capabilities",
};

const EVT = {
  delta: "message.delta",
  done: "message.complete",
  approval: "approval.request",
  status: "status.update",
  error: "error",
};

type GatewayEvent = { type?: string; session_id?: string; payload?: Record<string, any> };
type Frame = { id: number | string; method?: string; params?: any; result?: any; error?: { message?: string } };

/**
 * The gateway accepts a WebSocket credential only as a query parameter. Safe here
 * and only here: the URL is built from the loopback serve address, never from
 * anything a phone sent, so it never crosses a network or a log.
 */
function gatewayUrl(baseUrl: string, token: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/api/ws";
  url.search = "";
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

/** The token is exported by the launchd wrapper; in dev it comes from Keychain. */
function serveToken(baseUrl: string): string {
  if (config.hermes.token) return config.hermes.token;
  let host = "";
  try {
    host = new URL(baseUrl).host;
  } catch {
    /* keep the fallback account */
  }
  for (const account of [host, "127.0.0.1:9120"]) {
    if (!account) continue;
    try {
      const out = execFileSync(
        "security",
        ["find-generic-password", "-a", account, "-s", process.env.HERMES_KEYCHAIN_ITEM ?? "agent-bridge-serve-token", "-w"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim();
      if (out) return out;
    } catch {
      /* try the next account */
    }
  }
  return "";
}

export class HermesAdapter implements AgentAdapter {
  private cfg: { profile?: string; url?: string; token?: string };

  constructor(cfg: { profile?: string; url?: string; token?: string } = {}) {
    this.cfg = cfg;
  }

  readonly runtime = "hermes" as const;
  private ws: WebSocket | null = null;
  private ok = false;
  private seq = 0;
  private stopped = false;
  private retry = 1_000;
  private readonly pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private readonly events = new Set<(ev: GatewayEvent) => void>();
  private readonly requests = new Set<(frame: Frame) => void>();
  /** stored session id -> the live handle on the current socket. Live handles die with the socket. */
  private readonly liveByStored = new Map<string, string>();

  async start() {
    this.stopped = false;
    this.connect();
  }

  online() {
    return this.ok;
  }

  private connect() {
    if (this.stopped) return;
    let socket: WebSocket;
    try {
      const base = this.cfg.url || config.hermes.url;
      socket = new WebSocket(gatewayUrl(base, this.cfg.token || serveToken(base)));
    } catch (err) {
      console.warn("[hermes] could not open socket:", (err as Error).message);
      setTimeout(() => this.connect(), (this.retry = Math.min(this.retry * 2, 30_000))).unref?.();
      return;
    }
    this.ws = socket;

    socket.on("open", () => {
      this.ok = true;
      this.retry = 1_000;
      console.log("[hermes] connected");
      // Advertise on EVERY connect: the capability is per connection, and a silent
      // client never receives approvals or agent questions at all.
      void this.call(RPC.capabilities, { server_requests: true }).catch(() => undefined);
    });

    socket.on("message", (raw) => this.ingest(String(raw)));

    socket.on("close", () => {
      this.ok = false;
      this.ws = null;
      for (const p of this.pending.values()) p.reject(new Error("Hermes disconnected"));
      this.pending.clear();
      if (this.stopped) return;
      const wait = this.retry;
      this.retry = Math.min(this.retry * 2, 30_000);
      setTimeout(() => this.connect(), wait).unref?.();
    });

    socket.on("error", (e) => console.warn("[hermes]", e.message));
  }

  private ingest(raw: string) {
    for (const line of raw.split("\n")) {
      const text = line.trim();
      if (!text) continue;
      let m: Frame;
      try {
        m = JSON.parse(text) as Frame;
      } catch {
        continue;
      }

      // A server request: string id plus a method. Answering it unblocks the agent.
      if (typeof m.id === "string" && m.method) {
        for (const l of [...this.requests]) l(m);
        continue;
      }

      if (typeof m.id === "number" && this.pending.has(m.id)) {
        const p = this.pending.get(m.id)!;
        this.pending.delete(m.id);
        if (m.error) p.reject(new Error(m.error.message ?? "Hermes error"));
        else p.resolve(m.result);
        continue;
      }

      if (m.method === "event" && m.params) {
        const ev = m.params as GatewayEvent;
        for (const l of [...this.events]) l(ev);
      }
    }
  }

  private call<T = any>(method: string, params: Record<string, unknown>, timeoutMs = 30_000): Promise<T> {
    if (!this.ws || !this.ok) return Promise.reject(new Error("This agent is offline"));
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      timer.unref?.();
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v as T);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      try {
        this.ws!.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
      } catch (err) {
        this.pending.delete(id);
        reject(err as Error);
      }
    });
  }

  /** Answer a server request (an approval) on the same socket. */
  private reply(id: string, result: Record<string, unknown>) {
    try {
      this.ws?.send(JSON.stringify({ jsonrpc: "2.0", id, result }));
    } catch {
      /* socket gone: the agent's turn times out on its own side */
    }
  }

  async turn(input: TurnInput, on: TurnHandlers, signal: AbortSignal): Promise<TurnResult> {
    // input.sessionId is the STORED id, the one the channel keeps. Live handles belong to a
    // socket and die with it, so a turn always resolves a live handle from the stored id first.
    let stored = input.sessionId ?? "";
    let live = "";
    if (stored) {
      const resumed = await this.call<{ session_id?: string }>(RPC.resume, { session_id: stored }).catch(() => null);
      if (resumed?.session_id) live = resumed.session_id;
    }
    if (!live) {
      // No stored session, or Hermes no longer has it: start a clean one.
      const created = await this.call<{ session_id?: string; stored_session_id?: string }>(RPC.createSession, {
        ...(input.model ? { model: input.model } : {}),
        ...(input.cwd ? { cwd: input.cwd } : {}),
      });
      const liveId = String(created?.session_id ?? "");
      if (!liveId) throw new Error("Hermes did not return a session id");
      live = liveId;
      stored = String(created?.stored_session_id ?? liveId);
    }
    const isFirstTurn = !input.sessionId;
    this.liveByStored.set(stored, live);

    const sid = live as string;
    const body = isFirstTurn ? `${input.context}\n\n${input.text}` : input.text;
    let text = "";
    let settled = false;
    let resolveFinal: (v: string) => void = () => undefined;
    let rejectFinal: (e: Error) => void = () => undefined;

    const askApproval = async (p: Record<string, any>) => {
      const decision = await on.approval({
        title: String(p["description"] ?? p["title"] ?? "Allow this?"),
        command: typeof p["command"] === "string" ? p["command"] : undefined,
        tool: typeof p["tool"] === "string" ? p["tool"] : undefined,
      });
      return decision === "approve" ? "once" : "deny";
    };

    const onEvent = (ev: GatewayEvent) => {
      if (ev.session_id && ev.session_id !== sid) return;
      const payload = ev.payload ?? {};

      if (ev.type === EVT.delta) {
        text += String(payload["text"] ?? "");
        on.delta(text);
        return;
      }
      if (ev.type === EVT.status) {
        const label = payload["label"] ?? payload["text"] ?? payload["status"];
        if (typeof label === "string" && label) on.status?.(label);
        return;
      }
      if (ev.type === EVT.approval) {
        // Canonical form: answered through the generation-bound RPC.
        void (async () => {
          const choice = await askApproval(payload);
          if (typeof payload["prompt_id"] === "string") {
            await this.call(RPC.approve, {
              choice,
              session_id: ev.session_id ?? sid,
              execution_generation: payload["execution_generation"],
              prompt_id: payload["prompt_id"],
            }).catch(() => undefined);
          }
        })();
        return;
      }
      if (ev.type === EVT.done) {
        if (settled) return;
        settled = true;
        resolveFinal(String(payload["text"] ?? text) || text);
        return;
      }
      if (ev.type === EVT.error) {
        if (settled) return;
        settled = true;
        rejectFinal(new Error(String(payload["message"] ?? "Hermes error")));
      }
    };

    const onRequest = (frame: Frame) => {
      if (frame.method !== EVT.approval) return;
      const p = frame.params ?? {};
      if (String(p["session_id"] ?? sid) !== sid) return;
      // Legacy form: a server request answered by id.
      void (async () => {
        const choice = await askApproval(p);
        this.reply(String(frame.id), { choice });
      })();
    };

    const finished = new Promise<string>((resolve, reject) => {
      resolveFinal = resolve;
      rejectFinal = reject;
    });

    this.events.add(onEvent);
    this.requests.add(onRequest);
    signal.addEventListener(
      "abort",
      () => {
        if (settled) return;
        settled = true;
        void this.call(RPC.interrupt, { session_id: sid }).catch(() => undefined);
        rejectFinal(new Error("stopped"));
      },
      { once: true },
    );

    try {
      await this.call(RPC.send, { session_id: sid, text: body });
      const final = await finished;
      return { sessionId: stored, text: final };
    } finally {
      this.events.delete(onEvent);
      this.requests.delete(onRequest);
    }
  }
}
