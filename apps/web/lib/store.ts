"use client";
// One small store for the whole app. Filled from the bridge, then kept current by the live socket.
// Screens read from it with useStore(selector), so every screen updates the moment something changes.

import { useRef, useSyncExternalStore } from "react";
import type { Agent, Channel, CronJob, CronRun, Home, Host, LiveEvent, Message } from "@kotatsu/shared";
import { api, claimDesktopToken, liveUrl, NotPaired } from "./api";
import { desktopNotify, isDesktopApp } from "./desktop";

export interface State {
  status: "loading" | "ready" | "unpaired" | "offline";
  host?: Host;
  agents: Agent[];
  channels: Channel[];
  home?: Home;
  messages: Record<string, Message[]>;   // by channel id
  jobs: CronJob[];
  runs: CronRun[];
  connected: boolean;
}

let state: State = { status: "loading", agents: [], channels: [], messages: {}, jobs: [], runs: [], connected: false };
const INITIAL = state; // what the static HTML was built with; used while hydrating
const subs = new Set<() => void>();

function set(patch: Partial<State> | ((s: State) => Partial<State>)) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  subs.forEach((f) => f());
}

export function useStore<T>(sel: (s: State) => T): T {
  // Selectors may build new arrays (filter, map). Keep the last result while it is shallow equal,
  // otherwise React would see a new value on every read and loop.
  const last = useRef<{ v: T } | null>(null);
  const read = () => {
    const v = sel(state);
    if (last.current && shallowEqual(last.current.v, v)) return last.current.v;
    last.current = { v };
    return v;
  };
  const first = useRef<{ v: T } | null>(null);
  const server = () => (first.current ??= { v: sel(INITIAL) }).v;
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, read, server);
}

function shallowEqual(a: unknown, b: unknown) {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  return false;
}
export const getState = () => state;

// ---------- loading ----------
let desktopTried = false;
export async function refresh() {
  try {
    const [agents, channels, home, jobs, runs] = await Promise.all([api.agents(), api.channels(), api.home(), api.jobs(), api.runs()]);
    set({ agents, channels, home, jobs, runs, status: "ready" });
  } catch (e) {
    if (e instanceof NotPaired && !desktopTried && (await claimDesktopToken())) {
      desktopTried = true;
      return refresh();
    }
    desktopTried = true;
    set({ status: e instanceof NotPaired ? "unpaired" : state.status === "ready" ? "ready" : "offline" });
  }
}

export async function loadMessages(channelId: string) {
  const list = await api.messages(channelId);
  set((s) => ({ messages: { ...s.messages, [channelId]: list } }));
}

export async function refreshHome() {
  const home = await api.home().catch(() => undefined);
  if (home) set({ home });
}

// ---------- live socket ----------
let ws: WebSocket | null = null;
let retry = 0;
let started = false;

export function startLive() {
  if (started || typeof window === "undefined") return;
  started = true;
  void refresh().then(connect);
  // Coming back to the app (phone unlocked, tab focused) always re-syncs.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { void refresh(); if (!state.connected) connect(); }
  });
  window.addEventListener("online", () => { void refresh(); connect(); });
}

function connect() {
  if (state.status === "unpaired") return;
  try { ws?.close(); } catch {}
  ws = new WebSocket(liveUrl());
  ws.onopen = () => { retry = 0; set({ connected: true }); };
  ws.onmessage = (e) => apply(JSON.parse(e.data) as LiveEvent);
  ws.onclose = () => {
    set({ connected: false });
    const wait = Math.min(15_000, 500 * 2 ** retry++);
    setTimeout(() => { if (document.visibilityState === "visible") { void refresh(); connect(); } }, wait);
  };
}

function upsert<T>(list: T[], item: T, key: (x: T) => string, front = true): T[] {
  const k = key(item);
  const i = list.findIndex((x) => key(x) === k);
  if (i >= 0) { const next = list.slice(); next[i] = item; return next; }
  return front ? [item, ...list] : [...list, item];
}

function apply(ev: LiveEvent) {
  switch (ev.type) {
    case "hello": set({ host: ev.host }); break;
    case "message":
      set((s) => ({ messages: { ...s.messages, [ev.message.channelId]: upsert(s.messages[ev.message.channelId] ?? [], ev.message, (m) => m.id, false).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) } }));
      break;
    case "message.delta":
      set((s) => {
        const list = s.messages[ev.channelId];
        if (!list) return {};
        return { messages: { ...s.messages, [ev.channelId]: list.map((m) => (m.id === ev.id ? { ...m, text: ev.text } : m)) } };
      });
      break;
    case "channel":
      set((s) => ({ channels: upsert(s.channels, ev.channel, (c) => c.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }));
      break;
    case "agent": set((s) => ({ agents: upsert(s.agents, ev.agent, (a) => a.id, false) })); break;
    case "nudge":
      if (ev.nudge.state === "open" && isDesktopApp() && !state.home?.nudges.some((n) => n.id === ev.nudge.id)) {
        void desktopNotify(ev.nudge, agentById(ev.nudge.agentId)?.name, state.channels.find((c) => c.id === ev.nudge.channelId)?.name);
      }
      set((s) => {
        if (!s.home) return {};
        const others = s.home.nudges.filter((n) => n.id !== ev.nudge.id);
        const nudges = ev.nudge.state === "open" ? [ev.nudge, ...others].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : others;
        const earlier = ev.nudge.state === "done"
          ? [{ agentId: ev.nudge.agentId, text: ev.nudge.title, at: ev.nudge.createdAt }, ...s.home.earlier].slice(0, 5) : s.home.earlier;
        return { home: { ...s.home, nudges, earlier } };
      });
      break;
    case "brief": set((s) => (s.home ? { home: { ...s.home, brief: ev.brief } } : {})); break;
    case "watch":
      set((s) => (s.home ? { home: { ...s.home, watches: ev.watch.active ? upsert(s.home.watches, ev.watch, (w) => w.id) : s.home.watches.filter((w) => w.id !== ev.watch.id) } } : {}));
      break;
    case "running": set((s) => (s.home ? { home: { ...s.home, running: ev.running } } : {})); break;
    case "cron":
      set((s) => ({ runs: upsert(s.runs, ev.run, (r) => r.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), jobs: upsert(s.jobs, ev.job, (j) => j.slug) }));
      break;
    case "metric": case "approval": break; // screens that need these refetch on their own
  }
}

// ---------- helpers ----------
export const agentById = (id?: string) => state.agents.find((a) => a.id === id);
export function useAgent(id?: string) { return useStore((s) => s.agents.find((a) => a.id === id)); }
export function useChannel(id?: string) { return useStore((s) => s.channels.find((c) => c.id === id)); }
